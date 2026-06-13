"""
Aggregator service: listens on Redis queue for 'fetch-listings' jobs,
scrapes job boards, validates emails, and stores leads in PostgreSQL.
"""

import asyncio
import json
import os
import re

import redis.asyncio as aioredis
from dotenv import load_dotenv
from loguru import logger
from jobspy import scrape_jobs
import asyncpg

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.getenv("DATABASE_URL")
QUEUE_KEY = "bull:aggregator:wait"

# ─── Email validator ─────────────────────────────────────────────────────────

def is_valid_email(email: str) -> bool:
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email))


async def validate_with_sniffmail(email: str) -> bool:
    try:
        from sniffmail import EmailValidator
        v = EmailValidator()
        result = v.validate(email)
        return result.is_valid
    except Exception:
        return is_valid_email(email)


# ─── Job fetcher ─────────────────────────────────────────────────────────────

def fetch_listings(search_term: str, location: str, limit: int = 1000):
    logger.info(f"Fetching jobs: '{search_term}' in '{location}' (limit {limit})")
    try:
        jobs_df = scrape_jobs(
            site_name=["indeed", "glassdoor", "linkedin"],
            search_term=search_term,
            location=location,
            results_wanted=limit,
            hours_old=72,
            country_indeed="USA",
        )
        logger.info(f"Fetched {len(jobs_df)} raw listings")
        return jobs_df
    except Exception as e:
        logger.error(f"JobSpy error: {e}")
        return None


# ─── Database helpers ─────────────────────────────────────────────────────────

async def save_leads(pool, rows: list[dict], user_id: str, sequence_id: str):
    async with pool.acquire() as conn:
        for row in rows:
            await conn.execute(
                """
                INSERT INTO "Lead" (id, "userId", "sequenceId", "companyName", "jobTitle",
                    "jobUrl", "contactEmail", "emailValid", status, "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'PENDING', NOW(), NOW())
                ON CONFLICT DO NOTHING
                """,
                user_id,
                sequence_id,
                row["company"],
                row["title"],
                row.get("job_url"),
                row.get("email"),
                row.get("email_valid", False),
            )
    logger.info(f"Saved {len(rows)} leads for sequence {sequence_id}")


# ─── Main worker loop ─────────────────────────────────────────────────────────

async def main():
    r = await aioredis.from_url(REDIS_URL)
    pool = await asyncpg.create_pool(DATABASE_URL.replace("postgresql://", "postgresql://"))

    logger.info("Aggregator service started — waiting for jobs…")

    while True:
        try:
            # BullMQ stores jobs as JSON in list keys
            raw = await r.blpop(QUEUE_KEY, timeout=5)
            if not raw:
                continue

            _, payload = raw
            job = json.loads(payload)
            data = job.get("data", {})

            seq_id = data.get("sequenceId")
            user_id = data.get("userId")
            sector = data.get("sector", "software engineer")
            city = data.get("city", "New York")

            logger.info(f"Processing job seq={seq_id} sector='{sector}' city='{city}'")

            df = fetch_listings(sector, city)
            if df is None or df.empty:
                logger.warning("No listings fetched")
                continue

            leads = []
            for _, row in df.iterrows():
                email = row.get("company_emails") or row.get("email")
                if isinstance(email, str):
                    email = email.strip().lower()
                else:
                    email = None

                valid = await validate_with_sniffmail(email) if email else False

                leads.append({
                    "company": str(row.get("company", "Unknown")),
                    "title": str(row.get("title", "")),
                    "job_url": str(row.get("job_url", "")),
                    "email": email,
                    "email_valid": valid,
                })

            await save_leads(pool, leads, user_id, seq_id)

            # Update sequence status
            async with pool.acquire() as conn:
                await conn.execute(
                    'UPDATE "Sequence" SET "updatedAt"=NOW() WHERE id=$1',
                    seq_id,
                )

        except Exception as e:
            logger.exception(f"Aggregator loop error: {e}")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
