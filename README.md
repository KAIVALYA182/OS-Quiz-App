# OS Quiz App

React/Vite and Express/PostgreSQL. Vite is updated to the compatible 6.4 maintenance line for security fixes and the test runner; React and the existing Tailwind 3 styling are retained. For installation and tests use Node 22.22.2+, 24.15+, or 26+ (matching the package engine ranges), and PostgreSQL 14+ (Supabase Session pooler supported). Existing question content, scoring, feedback, timer and answer-review components are retained.

## Install and configure

Run from the project root:

```sh
npm ci --prefix backend
npm ci --prefix frontend
# Create the example only if .env is absent; preserve your existing environment.
cp -n backend/.env.example backend/.env
```

Edit `backend/.env` locally. Never put database credentials or the session secret in Vite variables. Keep your existing DATABASE_URL if already configured. The example is deliberately a local placeholder:

```dotenv
DATABASE_URL=postgresql://osquiz:replace-me@localhost:5432/osquiz
DATABASE_SSL=false
SESSION_SECRET=replace-with-at-least-32-random-characters
CLIENT_ORIGIN=http://localhost:5173
PORT=5001
NODE_ENV=development
```

Generate a real session secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` and save it only in the backend environment. Preserve the secret across restarts. For Supabase set `DATABASE_SSL=true`; provide its trusted CA certificate in `DATABASE_SSL_CA` if needed. TLS certificate verification is enabled. Do not disable TLS for a remote database.

`CLIENT_ORIGIN` is a comma-separated list of exact allowed origins, without trailing slashes or wildcards. Cookies use HttpOnly, SameSite=Lax, a seven-day lifetime, and Secure in production. Deploy the frontend and API under the same site (preferably the same origin). Cross-site cookie hosting is intentionally unsupported by this configuration.

`TRUST_PROXY_HOPS` is unset by default. Set it to 1–3 only when every route to the backend passes through that exact number of trusted reverse proxies; prevent direct public access to that backend port. In production HTTPS must reach the proxy and it must overwrite forwarded headers. Login and registration share an in-process limit of 20 requests per IP per 15 minutes; a multi-instance deployment also needs an edge/shared rate limiter.

The frontend normally uses `/api`. Optional `frontend/.env` values:

```dotenv
# For development on macOS, port 5000 may be used by Control Center.
VITE_DEV_API_TARGET=http://localhost:5001
# Only public routing configuration belongs here:
VITE_API_BASE=/api
```

Without VITE_DEV_API_TARGET the existing Vite proxy target remains http://localhost:5000; set backend PORT to match the proxy.

## Database setup and migration

These commands change the database named in your backend environment. Review the target and take your normal backup first. The implementation and its test suite were not run against your configured Supabase database.

For an **empty database only**:

```sh
cd backend
npm run db:init
npm run migrate
npm run seed
cd ..
```

For an **existing database**:

```sh
cd backend
npm run migrate
# Optional: insert missing question-bank records and memberships.
npm run seed
cd ..
```

`db:init` refuses an existing users table. Migrations run transactionally under an advisory lock and record applied versions in `schema_migrations`. The fresh-install schema includes the same extensions. No migration, seed, or database reset runs during server startup.

**Seeding supplies initial or missing seed data. It is not required to access the database or start the app.** The seed preserves existing IDs, timestamps, user fields, credentials, answers, settings, memberships and positions. A removed source-bank item stays in PostgreSQL. New memberships append after the highest existing position. Counters report inserted/reused records without credentials or answers.

Stable question `seedKey` values are explicit in the question bank. Keep them unchanged when editing or moving a question. Quiz seed keys are the fixed `topic:<existing topic>` identifiers and `full-mock`; do not rename those identifiers to edit a quiz. Seed adoption first uses these keys, then a unique exact topic/text or quiz title match. Edited legacy question text can be adopted only when original topic-quiz and full-mock membership positions agree on one record. A renamed quiz can be adopted by its exact membership set. Where identity cannot be established safely, the entire seed rolls back with a diagnostic; inspect the affected records and explicitly assign the intended `seed_key` before retrying. Do not resolve ambiguity by deleting or merging historical records. Database content wins once records have keys: source edits do not overwrite database edits.

Migration stops on normalized email/username collisions or duplicate quiz positions. Resolve those conflicts through an explicit ownership/order decision before retrying. Existing users without usernames receive reserved `legacy_<UUID without hyphens>` identifiers. All pre-migration accounts remain disabled for authentication and competitive ranking; existing password hashes, IDs and histories are preserved. Placeholder passwords cannot authenticate. New registrations never inherit the shared test account's history. Recovery/activation of verified legacy accounts requires a separate deliberate operator process; this app adds no reset email workflow.

## Development

Use two terminals from the project root, after configuring matching ports:

```sh
npm run dev --prefix backend
```

```sh
npm run dev --prefix frontend
```

Open the Vite URL shown in the terminal and register your own account. The old shared test-user route is retired.

## Production

Set backend environment values in your deployment secret manager, including:

```dotenv
NODE_ENV=production
PORT=5001
DATABASE_SSL=true
CLIENT_ORIGIN=https://quiz.example.com
# Real DATABASE_URL, SESSION_SECRET and optional trusted CA are backend-only secrets.
# TRUST_PROXY_HOPS=1  # only for the fixed, protected topology described above
```

Install/build/start commands, from the project root:

```sh
npm ci --prefix backend --omit=dev
npm ci --prefix frontend
VITE_API_BASE=/api npm run build --prefix frontend
# Explicit deployment step; never an application startup hook:
npm run migrate --prefix backend
# Only if initial/missing seed data is required:
npm run seed --prefix backend
NODE_ENV=production npm start --prefix backend
```

Serve `frontend/dist` from your HTTPS static host/reverse proxy. Route `/api/*` to the backend at `127.0.0.1:5001`, preserving `/api`, the original host, and the trusted HTTPS forwarded protocol. Vite's development proxy is not part of the production build. Keep backend and frontend under `https://quiz.example.com` (replace with your actual domain). Secure cookies require HTTPS; Vite preview is not a production server.

## Behaviour and API

- `GET /api/auth/csrf` initializes a CSRF token. Include it as `X-CSRF-Token` on all POST requests, including login, registration and logout. Authentication regenerates the session and CSRF token.
- `POST /api/auth/register`: name, username, email, password, confirmPassword. Usernames/emails are trimmed and lowercased; PostgreSQL enforces normalized uniqueness. Passwords are unchanged, 12–128 characters, hashed with Argon2id (19 MiB, two iterations, parallelism one). Roles are server-assigned student; role payloads are rejected.
- `POST /api/auth/login`: username and password. `GET /api/auth/me` restores the signed-in user. `POST /api/auth/logout` destroys the database session and clears its cookie. The frontend sends credentialed requests and keeps no passwords/tokens in localStorage.
- `GET /api/quiz` lists standard quizzes. `POST /api/quiz/:quizId/start` creates an owned server assignment and returns questions without answers. `POST /api/practice` generates an owned personalised assignment.
- `POST /api/quiz/:quizId/submit`: `{attemptId, answers: [{questionId, selectedOptionIndex}]}`. Omitted answers are incorrect. Duplicate, foreign and out-of-range answers are rejected. Ownership, question set, score, type and elapsed time come from the server; forged payload fields do nothing. A locked attempt row and unique result constraint make concurrent/retried submissions return the same saved result.
- Timed attempts permit a 30-second network grace period after the server limit; later first submissions are rejected. Completed attempts remain retrievable and retries stay idempotent. Unfinished resume is out of scope.
- `GET /api/progress` returns personal completed-attempt statistics, a separate standard summary and history. `GET /api/results/:id` returns only an owned review, otherwise 404. All protected endpoints return 401 without authentication.
- New attempts snapshot question content and explanations so later question edits do not change their reviews. Legacy records did not save question snapshots; their reviews use the surviving current question content. Old scores and answers are never rewritten.

### Learning rules

`GET /api/learning` uses saved answers and existing topic metadata. Every occurrence in a completed attempt counts, including repeated questions and personalised practice. Unanswered questions count as incorrect. Recent accuracy uses the latest ten persisted answers per topic; fewer than three total answers means “Not enough data”, not weakness. Below 60% recent accuracy needs revision; 80% or more is strong; other topics are developing. Last practice includes both standard and personalised attempts.

Practice selects at most ten unique existing questions: roughly 80% prioritizes weak topics, previously incorrect responses, then least-recently-practised questions; the remaining questions prefer other topics for mixed revision. A small bank uses as many unique questions as available. New users are directed to the existing Operating System Basics diagnostic and can also try mixed practice. No fabricated topics, questions or explanations are added.

### Ranking rules

`GET /api/leaderboard/:quizId?page=1` returns 20 rows per page and the current student's rank independently of the visible page. Each student's highest server-calculated integer percentage for that standard quiz/version counts once. Ties share competition rank (1, 1, 3); usernames and IDs provide stable display ordering. Only public username, score, rank and an own-row marker are shown. Personalised practice, disabled/admin/shared accounts and unassigned legacy results are excluded.

A SHA-256 fingerprint covers quiz settings and ordered question snapshots, including options and answers. Only attempts matching the current quiz version rank together. Content, settings or membership changes can therefore start a new leaderboard cohort; older results remain in personal history. There is no overall cross-quiz leaderboard.

## Verification

```sh
npm run validate:questions --prefix backend
npm test --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
npm audit --prefix backend
npm audit --prefix frontend
```

Backend integration tests start their own disposable PostgreSQL cluster on a random local port, override DATABASE_URL before loading application modules, and never use project Supabase settings. Installation needs network access for the platform's embedded PostgreSQL package. Tests require permission to spawn processes and bind localhost ports. Production installation excludes this test dependency. The backend suite currently passes 17 tests (including its enclosing integration test); the frontend suite exercises components and the request client without network access. The suite covers migration preservation/collision rollback; empty/repeated/concurrent seeds; edited data and removed-source preservation; secure registration, login, CSRF, limits, logout and real process restarts; ownership isolation; topic calculations; small-bank practice; rankings, ties, pagination, versions and safe submission retries.

Backend dependency audit reports zero vulnerabilities. All 17 backend tests, all 11 frontend tests, question-bank validation, syntax checks and the production build passed. The frontend development dependency audit reports seven findings (five high, two moderate) in the existing Tailwind 3 dependency chain; fixing them through the suggested Tailwind 4 upgrade requires a separate styling migration. Frontend production dependencies have no reported vulnerabilities.

There was no pre-existing lint script in either package. Syntax checks, component tests, backend tests and the Vite production build are the automated checks. Browser visual/responsive verification could not be completed because the browser permission gate declined the local preview. Check those manually before deployment.

## Manual checks

1. Register two accounts; verify show/hide passwords, mismatch/duplicate errors and invalid login feedback.
2. Complete a timed and an untimed quiz; check countdown, keyboard controls, unanswered warning, feedback and explanations.
3. Refresh and restart the backend; confirm login and My Progress remain. Open a past review.
4. Switch accounts; confirm histories and recommendations are isolated. Log out and try protected URLs.
5. Complete personalised practice; confirm topic evidence and progress update, and leaderboard scores do not change.
6. Compare tied/best attempts for one quiz, switch quizzes and paginate. Check your highlighted row and rank.
7. Check navigation, forms, quiz controls, history and ranking table on narrow/mobile and desktop viewports.
8. On an approved database, run seed twice and compare existing IDs/content/history; startup alone must not seed.

## Changed files by feature

- Safe seed/schema: `backend/scripts/seed.js`, `backend/scripts/migrate.js`, `backend/scripts/initSchema.js`, `backend/scripts/validateQuestions.js`, `backend/data/questions.js`, `backend/db/schema.sql`, `backend/db/migrations/002_accounts_attempts.sql`, `backend/db/migrations/003_integrity.sql`.
- Authentication/API protection: `backend/auth.js`, `backend/server.js`, `backend/config/db.js`, `backend/routes/devRoutes.js`, `backend/.env.example`, `frontend/src/components/Auth.jsx`, `frontend/src/api/client.js`.
- Progress, personalised learning, rankings and scoring integration: `backend/attempts.js`, `backend/controllers/scoreController.js`, `backend/controllers/quizController.js`, `backend/routes/quizRoutes.js`, `backend/routes/scoreRoutes.js`, `backend/db/queries.js`, `frontend/src/App.jsx`, `frontend/src/components/PersonalPages.jsx`, `frontend/src/components/QuizAttempt.jsx`, `frontend/src/components/QuizList.jsx`, `frontend/src/api/quizApi.js`, `frontend/src/api/scoreApi.js`.
- Tests/setup: `backend/tests/integration.test.js`, `backend/tests/fixtures/session-server.js`, `backend/tests/fixtures/browser-preview.js`, `frontend/src/tests/*`, `frontend/vitest.config.js`, both package manifests/lockfiles, `frontend/vite.config.js`, `frontend/.env.example`, `.gitignore`, this README.
