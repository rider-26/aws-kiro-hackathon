# PeerLink NYP — Infrastructure & Deployment

This stack provisions the **compute/API layer**:

- REST API — API Gateway + Lambda running the Express backend via `serverless-http`
- WebSocket API — API Gateway v2 + Lambda, for session chat and real-time notifications
- IAM permissions granting those Lambdas access to the DynamoDB tables and S3 bucket

It does **not** create the DynamoDB tables or the S3 bucket. CDK imports them by name. Use `npm run provision:dynamo` in `/backend` to create the tables (see step 2).

> **You do not need any of this to run the app.** Local development uses a SQLite file and needs no AWS account at all — see the root README. This document is only for putting PeerLink on the internet.

---

## Deployment overview

| Layer | Where it goes | How |
|---|---|---|
| Frontend (React SPA) | Amplify Hosting or Netlify | Git-connected build |
| REST + WebSocket API | AWS Lambda + API Gateway | `cdk deploy` from `/infra` |
| Database | DynamoDB (22 tables) | `npm run provision:dynamo` from `/backend` |
| File uploads | S3 bucket | Created manually, CORS configured |

---

## Step 1 — Prerequisites

1. **AWS credentials** with permission to deploy CloudFormation, Lambda, API Gateway, IAM and DynamoDB. `cdk bootstrap`/`cdk deploy` need broader rights than the app's own runtime role.

   If you are using **AWS Academy / Learner Lab**, credentials rotate every session and include a session token. Copy all three values (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) from the lab's *AWS Details* panel each time they expire. Note Learner Lab accounts often restrict IAM role creation, which `cdk deploy` requires — check before committing to this path.

2. **AWS CLI** installed and configured, plus Node 20+.

3. Copy `infra/.env.example` to `infra/.env` and fill in at minimum:

   ```
   CDK_DEFAULT_ACCOUNT=<your account id>
   CDK_DEFAULT_REGION=ap-southeast-1
   JWT_SECRET=<a long random string>
   FRONTEND_ORIGIN=https://your-app.amplifyapp.com
   DEEPSEEK_API_KEY=<optional>
   ```

   `JWT_SECRET` is mandatory — the synth deliberately fails without it rather than deploying a function that cannot sign a token. Use a different secret from your local one.

---

## Step 2 — Create the DynamoDB tables

The app needs **22 tables and 28 secondary indexes**. Creating those by hand in the console is slow and error-prone: a mistyped index name doesn't fail at startup, it surfaces later as a `ValidationException` on whichever page happens to use that query.

So the table definitions are generated from `backend/src/config/indexes.js` — the same file the SQLite driver uses to build its own indexes, which keeps the two engines from drifting apart.

```powershell
cd backend
# Fill in the AWS block in backend/.env, then:
npm run provision:dynamo:plan   # prints every table + index, creates nothing
npm run provision:dynamo        # creates whatever is missing
```

The script is safe to re-run: existing tables are skipped, never modified or deleted. If a table already exists but is missing an index the app queries, it reports the discrepancy and exits non-zero rather than pretending the setup is complete — it will not alter an existing table, since adding an index is an `UpdateTable` with its own backfill behaviour.

All tables use on-demand billing (`PAY_PER_REQUEST`) and partition key `id` (String). Indexes project `ALL` attributes, because the app reads whole entities off its indexes — a `KEYS_ONLY` projection would force a second read per row.

### Then seed it

```powershell
# In backend/.env set DB_DRIVER=dynamodb, then:
npm run seed
```

This creates the demo accounts, modules, tutors, quiz history, group sessions and moderation queue. It's idempotent. Note `npm run seed:reset` refuses to run against DynamoDB by design — it only truncates the local SQLite file, so it can never wipe provisioned tables.

---

## Step 3 — Create the S3 bucket

Only needed for **user file uploads**. Without it, the bundled sample study material still works, so AI quiz generation, weak-topic diagnosis, tutor matching, booking, attendance, reviews and the retest loop all function.

1. Create a bucket (default name `peerlink-nyp-uploads`) and set `S3_BUCKET` in `infra/.env`.
2. Add a CORS rule allowing `PUT` and `GET` from your frontend origin — the browser uploads directly to S3 via a presigned URL, so the file never transits the API:

```json
[
  {
    "AllowedOrigins": ["https://your-app.amplifyapp.com", "http://localhost:5173"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

Keep the bucket **private**. Access is only ever granted through short-lived presigned URLs (5 minutes), and upload keys are derived server-side as `study-materials/{studentId}/...` so a client cannot write into another student's prefix.

---

## Step 4 — Deploy the API

```powershell
cd infra
npm install
npx cdk bootstrap    # first time only, per account/region
npm run deploy
```

Make sure `backend/node_modules` is installed first — the Lambda bundle is packaged straight from `/backend`.

CDK prints two outputs:

- **`RestApiUrl`** → the frontend's `VITE_API_BASE_URL`. The stage is named `api`, so the printed URL already ends in `/api/`.
- **`WebSocketUrl`** → the frontend's `VITE_WS_URL`.

### What the stack sets for you

- `DB_DRIVER=dynamodb` is set explicitly on both functions. The backend also ships a SQLite driver for local dev, and this is what guarantees the deployed code talks to DynamoDB rather than a filesystem that doesn't persist between invocations.
- `better-sqlite3` is **excluded from the bundle**. It's a native module compiled for whichever machine ran `npm install`, so a Windows or macOS build shipped to Amazon Linux would be unloadable. Nothing requires it on the DynamoDB path (the SQLite adapter is only required lazily when that driver is selected), so excluding it is safe and keeps the bundle smaller.
- `.env`, the local `data/` database, `tests/` and `scripts/` are excluded, so no local data or secret is ever uploaded.
- CORS is scoped to `FRONTEND_ORIGIN` when set. If it isn't, the API accepts any origin and the synth emits a warning. Narrow it once your frontend URL is known.

### Security note on secrets

`JWT_SECRET` and `DEEPSEEK_API_KEY` are passed as Lambda environment variables, which means **CDK writes them in plaintext into the CloudFormation template** (`infra/cdk.out/`, which is gitignored) and they are visible to anyone with CloudFormation or Lambda read access in the account.

That is an acceptable tradeoff for a student project in a lab account. For anything handling real student data, move them to AWS Secrets Manager or SSM Parameter Store and grant the function read access instead, so the value never appears in a template or a console page.

Two related points:

- Use a **different** `JWT_SECRET` for the deployment than your local one. Anyone holding the secret can mint a token for any user, including an Admin.
- Rotating `JWT_SECRET` invalidates every issued token, so all users are signed out on the next request. That is the correct response if you suspect it leaked.

---

## Step 5 — Deploy the frontend

Set these build-time variables in your host (Vite inlines `VITE_*` at build time, so they must be present when the build runs, not at runtime):

```
VITE_API_BASE_URL=https://<rest-api-id>.execute-api.<region>.amazonaws.com/api
VITE_WS_URL=wss://<ws-api-id>.execute-api.<region>.amazonaws.com/production
```

### Amplify Hosting

Connect the repo and set the app root to `frontend`. Amplify detects Vite; if you need to be explicit:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd frontend && npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: frontend/dist
    files:
      - '**/*'
  cache:
    paths:
      - frontend/node_modules/**/*
```

### Netlify

Base directory `frontend`, build command `npm run build`, publish directory `frontend/dist`.

**Both hosts need an SPA rewrite**, otherwise deep links like `/tutors/abc123` return 404 on refresh — the router is client-side. Netlify: add `frontend/public/_redirects` containing `/*  /index.html  200`. Amplify: add a rewrite rule from `/<*>` to `/index.html` with status `200`.

---

## Step 6 — Verify the deployment

```powershell
cd backend
$env:SMOKE_BASE_URL="https://<rest-api-id>.execute-api.<region>.amazonaws.com"
npm run smoke:api
```

58 live checks covering login for all three roles, tutor match scoring, the verified-only booking gate, access-control boundaries and the admin verification workflow. This exercises the real deployed data layer, not mocks.

Also worth running once a DeepSeek key is configured:

```powershell
npm run smoke:deepseek   # proves the live AI call works, rather than silently falling back
```

---

## Local development

Local dev does **not** use this stack. The backend runs as a plain Express server (`npm run dev` in `/backend`) against a local SQLite file, and an in-process WebSocket hub stands in for API Gateway. See the root README.

---

## Reference: tables and indexes

Generated from `backend/src/config/indexes.js`. Run `npm run provision:dynamo:plan` in `/backend` to print the current list. All partition keys are `id` (String); all index keys are Strings.

| Table | Secondary indexes (PK → SK) |
|---|---|
| `PeerLink_Users` | `email-index` (email) |
| `PeerLink_TutorProfiles` | `userId-index` (user_id) |
| `PeerLink_Modules` | `moduleCode-index` (module_code) |
| `PeerLink_TutorVerifications` | `tutorId-index` (tutor_id), `moduleId-index` (module_id) |
| `PeerLink_TutorTopics` | `tutorId-index` (tutor_id) |
| `PeerLink_TutorAvailability` | `tutorId-index` (tutor_id) |
| `PeerLink_SavedTutors` | `studentId-index` (student_id) |
| `PeerLink_Bookings` | `studentId-index` (student_id), `tutorId-index` (tutor_id) |
| `PeerLink_TutoringSessions` | `tutorId-index` (tutor_id), `bookingId-index` (booking_id) |
| `PeerLink_SessionParticipants` | `sessionId-index` (session_id), `studentId-index` (student_id) |
| `PeerLink_ChatMessages` | `sessionId-createdDate-index` (session_id → **created_date**) |
| `PeerLink_StudyMaterials` | `studentId-index` (student_id) |
| `PeerLink_Quizzes` | `studentId-index` (student_id) |
| `PeerLink_QuizQuestions` | `quizId-index` (quiz_id) |
| `PeerLink_QuizAttempts` | `quizId-index` (quiz_id), `studentId-index` (student_id) |
| `PeerLink_QuizResponses` | `attemptId-index` (attempt_id) |
| `PeerLink_TopicPerformance` | `studentId-moduleId-index` (student_id → **module_id**) |
| `PeerLink_Reviews` | `sessionId-index` (session_id), `tutorId-index` (tutor_id) |
| `PeerLink_UserReports` | `reporterId-index` (reporter_id), `reportedUserId-index` (reported_user_id) |
| `PeerLink_Notifications` | `userId-createdDate-index` (user_id → **created_date**) |
| `PeerLink_RecognitionRules` | none — a single well-known row read by id |
| `PeerLink_Connections` | `userId-index` (user_id) |

Three indexes have **sort keys** (bolded). Those aren't decoration: `ChatMessages` relies on the sort key to return messages oldest-first, and `TopicPerformance` uses it to fetch one student's rows for a single module.

`PeerLink_Connections` degrades gracefully if its index is missing — real-time push stops working but notifications still persist and appear on the next page load, so bookings and chat writes are unaffected. Every other index is required by the view that queries it.

---

## Cost and teardown

Everything used here is serverless and on-demand: DynamoDB `PAY_PER_REQUEST`, Lambda per-invocation, API Gateway per-request. A demo workload costs approximately nothing, and most of it falls inside the AWS Free Tier.

To tear down:

```powershell
cd infra
npx cdk destroy
```

That removes the Lambdas and both API Gateways. It does **not** delete the DynamoDB tables or the S3 bucket, since CDK only imported them — delete those manually if you want a clean account.
