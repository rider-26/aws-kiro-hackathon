# PeerLink NYP

AI-assisted peer tutoring platform for NYP students. Connects tutees who need academic help with academically verified student tutors, using an AI-driven diagnose → match → book → attend → retest loop to measure real learning improvement.

## Structure

- `/frontend` — React + Vite + Tailwind CSS SPA (deploys to Amplify/Netlify)
- `/backend` — Express API, runs locally as a normal server and in production as an AWS Lambda function (via `serverless-http`)
- `/infra` — AWS CDK (TypeScript) stack for the API Gateway (REST + WebSocket) + Lambda deployment layer

## Data & AI

- **Database**: pluggable via `DB_DRIVER` — **SQLite** for local development (zero setup), **DynamoDB** when deployed. Both implement the same repository contract, so no service code differs between them.
- **File storage**: AWS S3, presigned URLs (optional locally — see below)
- **AI quiz generation**: DeepSeek API, with a seeded fallback quiz if the live call fails
- **Auth**: JWT-based, credential login with bcrypt-hashed passwords

## Getting started (local dev)

Runs with **no AWS account, credentials, Docker or Java** — the default driver is a local SQLite file.

```powershell
# Backend
cd backend
copy .env.example .env    # defaults to DB_DRIVER=sqlite; nothing to fill in to start
npm install
npm run seed              # creates backend/data/peerlink.db + demo users, tutors, modules, quiz
npm run dev               # http://localhost:5000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

Then sign in at http://localhost:5173 with any account below.

### Useful backend scripts

| Script | What it does |
|---|---|
| `npm run seed` | Seeds demo data (idempotent — safe to re-run) |
| `npm run seed:reset` | Wipes the local database first, then seeds. SQLite only |
| `npm run db:stats` | Row counts per table, to confirm what's populated |
| `npm run smoke:api` | 37 live checks against a running backend (real data layer, no mocks) |
| `npm run smoke:ws` | 7 live WebSocket checks (notifications + chat broadcast) |
| `npm run smoke:deepseek` | Verifies the live DeepSeek call. Needs `DEEPSEEK_API_KEY` |
| `npm test` | 462 unit/integration tests |

### What needs real AWS, and what doesn't

Only two features touch AWS, and both degrade gracefully:

- **Uploading your own study material** needs an S3 bucket. Without it the bundled sample material still works, so AI quiz generation, weak-topic diagnosis, tutor matching, booking, attendance, reviews and the retest/improvement loop all run end to end.
- **Real-time push when deployed** uses API Gateway WebSockets. Locally an in-process WebSocket hub covers it, so live chat and notifications work as-is.

Leaving `DEEPSEEK_API_KEY` blank is also fine: quizzes fall back to a seeded 10-question IT2513 bank and are tagged as such in the UI.

### Switching to DynamoDB

Set `DB_DRIVER=dynamodb` in `backend/.env` and fill in the AWS credential block. The required tables and their 28 secondary indexes are documented in `/infra/README.md`. Note that AWS Academy / Learner Lab credentials expire each session and will need re-pasting.

Demo accounts (password `demo1234` after seeding):
- Tutee — `jinyu@student.demo` (Jinyu Chen)
- Tutor — `alex@tutor.demo` (Alex Tan)
- Admin — `lecturer@admin.demo` (Ms Lim)

## Deployment

Not required to run or demo the app — local development needs no AWS account. See **[`/infra/README.md`](infra/README.md)** for the full walkthrough.

Summary of the path:

| Step | Command | Notes |
|---|---|---|
| 1. Create tables | `npm run provision:dynamo` (in `/backend`) | Builds all 22 tables + 28 indexes from `config/indexes.js`. Preview with `provision:dynamo:plan` |
| 2. Seed | `npm run seed` with `DB_DRIVER=dynamodb` | Same seed data as local |
| 3. Deploy API | `npm run deploy` (in `/infra`) | CDK stands up Lambda + REST API + WebSocket API |
| 4. Deploy frontend | Amplify or Netlify | `amplify.yml` is at the repo root; `_redirects` handles SPA routing on Netlify |
| 5. Verify | `npm run smoke:api` against the deployed URL | 58 live checks against the real deployed stack |

The S3 bucket (step 3 in the infra README) is optional — without it everything works except uploading your own study material.
