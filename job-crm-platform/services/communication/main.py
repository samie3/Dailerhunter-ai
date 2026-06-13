"""
Communication microservice — exposes a simple REST API for email validation.
Used internally by the aggregator and backend.
"""

from fastapi import FastAPI
from pydantic import BaseModel
from loguru import logger
import re

app = FastAPI(title="Communication Service")


class ValidateRequest(BaseModel):
    email: str


class ValidateResponse(BaseModel):
    email: str
    valid: bool
    reason: str | None = None


def basic_validate(email: str) -> bool:
    return bool(re.match(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", email))


@app.post("/validate", response_model=ValidateResponse)
async def validate_email(req: ValidateRequest):
    email = req.email.strip().lower()
    try:
        from sniffmail import EmailValidator
        v = EmailValidator()
        result = v.validate(email)
        return ValidateResponse(email=email, valid=result.is_valid)
    except Exception as e:
        logger.warning(f"sniffmail unavailable, falling back: {e}")
        valid = basic_validate(email)
        return ValidateResponse(email=email, valid=valid, reason="fallback")


@app.get("/health")
async def health():
    return {"status": "ok"}
