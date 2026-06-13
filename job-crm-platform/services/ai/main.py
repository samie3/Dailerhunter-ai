"""
AI Orchestrator: polls connected Gmail inboxes every 5 minutes,
detects interview/follow-up emails, generates drafts via OpenAI,
stores them as PENDING_APPROVAL in AIReply table.
"""

import asyncio
import base64
import os

import asyncpg
from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from loguru import logger
from openai import AsyncOpenAI

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
POLL_INTERVAL = 300  # 5 minutes

TRIGGER_KEYWORDS = [
    "interview", "مقابلة", "follow up", "متابعة",
    "interested in your profile", "we'd like to schedule",
    "نرغب بمقابلتك", "invitation to interview",
]

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def build_gmail(access_token: str, refresh_token: str):
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        token_uri="https://oauth2.googleapis.com/token",
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


async def draft_reply(inbound_body: str, company_name: str, job_title: str) -> dict:
    prompt = f"""You are a professional job applicant.
A company ({company_name}) sent this email regarding a {job_title} position:

{inbound_body}

Write a concise, professional reply email. Return JSON with keys "subject" and "body"."""

    response = await client.chat.completions.create(
        model="claude-sonnet-4-6",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=600,
    )
    import json
    return json.loads(response.choices[0].message.content)


def decode_body(payload) -> str:
    body = ""
    if "body" in payload and payload["body"].get("data"):
        body = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="ignore")
    elif "parts" in payload:
        for part in payload["parts"]:
            if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
                body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="ignore")
                break
    return body


def is_triggered(subject: str, body: str) -> bool:
    text = (subject + " " + body).lower()
    return any(kw.lower() in text for kw in TRIGGER_KEYWORDS)


async def poll_user_inbox(pool, user):
    user_id = user["id"]
    gmail = build_gmail(user["accessToken"], user["refreshToken"])

    result = gmail.users().messages().list(
        userId="me", q="is:unread", maxResults=20
    ).execute()

    messages = result.get("messages", [])
    if not messages:
        return

    for msg_meta in messages:
        msg = gmail.users().messages().get(userId="me", id=msg_meta["id"], format="full").execute()
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        subject = headers.get("Subject", "")
        from_email = headers.get("From", "")
        body = decode_body(msg["payload"])

        if not is_triggered(subject, body):
            continue

        # Avoid duplicate processing
        async with pool.acquire() as conn:
            existing = await conn.fetchval(
                'SELECT id FROM "AIReply" WHERE "userId"=$1 AND "inboundBody"=$2',
                user_id, body[:500],
            )
            if existing:
                continue

        logger.info(f"AI trigger detected: '{subject}' from {from_email}")

        try:
            draft = await draft_reply(body, from_email, "the applied position")
        except Exception as e:
            logger.error(f"Draft generation failed: {e}")
            continue

        # Find matching lead
        async with pool.acquire() as conn:
            lead = await conn.fetchrow(
                'SELECT id FROM "Lead" WHERE "userId"=$1 AND "contactEmail" ILIKE $2 LIMIT 1',
                user_id, f"%{from_email.split('<')[-1].strip('>')}%",
            )
            if not lead:
                lead = await conn.fetchrow(
                    'SELECT id FROM "Lead" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',
                    user_id,
                )
            if not lead:
                continue

            await conn.execute(
                """
                INSERT INTO "AIReply" (id, "userId", "leadId", "inboundBody",
                    "draftSubject", "draftBody", status, "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'PENDING_APPROVAL', NOW(), NOW())
                """,
                user_id, lead["id"], body[:2000],
                draft.get("subject", "Re: " + subject),
                draft.get("body", ""),
            )
        logger.info(f"Stored AI draft for user {user_id}")


async def main():
    pool = await asyncpg.create_pool(DATABASE_URL)
    logger.info("AI Orchestrator started — polling every 5 minutes")

    while True:
        try:
            users = await pool.fetch(
                """
                SELECT u.id, gt."accessToken", gt."refreshToken"
                FROM "User" u
                JOIN "GoogleToken" gt ON gt."userId" = u.id
                """
            )
            logger.info(f"Polling {len(users)} connected inboxes")
            await asyncio.gather(*[poll_user_inbox(pool, dict(u)) for u in users])
        except Exception as e:
            logger.exception(f"AI poll error: {e}")

        await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
