# Job Application CRM & Automation Platform

A production-ready platform that aggregates job listings, sequences personalized outreach via Gmail OAuth, and handles AI-assisted follow-up replies — with optional WhatsApp integration for Pro users.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│  Next.js    │────▶│ Node/Express │────▶│  BullMQ Workers    │
│  Dashboard  │     │  API Gateway │     │  (dispatch/WA/AI)  │
└─────────────┘     └──────────────┘     └────────────────────┘
                           │                       │
                    ┌──────▼──────┐        ┌──────▼──────┐
                    │ PostgreSQL  │        │    Redis     │
                    │  (Prisma)   │        │  (BullMQ)    │
                    └─────────────┘        └─────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  ┌──────────┐      ┌──────────┐      ┌──────────┐
  │Aggregator│      │  AI      │      │ Messaging│
  │(JobSpy + │      │Orchestr. │      │(Baileys/ │
  │Scrapling)│      │(OpenAI)  │      │WhatsApp) │
  └──────────┘      └──────────┘      └──────────┘
```

## Quick Start

```bash
# 1. Clone and enter
cd job-crm-platform

# 2. Configure secrets
cp .env.example .env
# Edit .env — set DB, Redis, Google OAuth, OpenAI keys

# 3. Deploy (Ubuntu VPS)
bash deploy.sh
```

## Daily Quota Ramp

| Day | Max emails |
|-----|-----------|
| 1   | 45        |
| 2   | 90        |
| 3   | 180       |
| 4   | 360       |
| 5+  | 490       |

WhatsApp is capped at **100 messages/day** for compliance (Pro plan only).

## Services

| Service | Stack | Port |
|---------|-------|------|
| Frontend | Next.js 14 + TailwindCSS | 3000 |
| Backend | Node.js + Express | 4000 |
| Worker | BullMQ + node-cron | — |
| Aggregator | Python + JobSpy + Scrapling | — |
| AI Orchestrator | Python + OpenAI | — |
| Messaging | Node.js + Baileys | 3001 |
| Communication | Python + FastAPI | 8001 |
| PostgreSQL | v16 | 5432 |
| Redis | v7 | 6379 |
| Nginx | Reverse proxy | 80/443 |

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Email registration |
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/auth/google` | Google OAuth2 |
| POST | `/api/sequence/start` | Start aggregation + dispatch |
| POST | `/api/sequence/stop` | Pause sequence |
| GET | `/api/sequence/status` | Status + stats |
| POST | `/api/email/approve` | Approve AI draft |
| GET | `/api/email/pending-replies` | List AI drafts |
| POST | `/api/whatsapp/pair` | Trigger 8-digit pairing |
| GET | `/api/whatsapp/status` | WA connection status |
| POST | `/api/upload/cv` | Upload CV (PDF/DOCX) |
| GET | `/api/analytics` | Daily analytics |
