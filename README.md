# Roomie Backend

REST API for **Roomie**, Cornell AppDev's roommate management app (houses, chores, shopping list; bills, calendar, moodboard and storage later).

It follows the layout of AppDev's newest backend, [eatery-blue-backend](https://github.com/cuappdev/eatery-blue-backend), so anyone who has worked there will feel at home.

## Stack

| | |
|---|---|
| Runtime | Node 22, TypeScript, Express 5 |
| Database | PostgreSQL 16 via Prisma 7 (`@prisma/adapter-pg`) |
| Validation | Zod 4 |
| Auth | Firebase Auth (Google sign-in) verified with `firebase-admin`; **@cornell.edu only** |
| Tests | Vitest + Supertest against a real Postgres |
| Deploy | Docker image → Docker Hub → SSH + docker compose (same as Eatery) |

Differences from Eatery: Prisma 7 instead of 6 (the client no longer needs a native engine), and auth uses Google sign-in instead of a device UUID, because Roomie needs to know *who* you are to put you in a house.

## Getting started

```bash
npm install
cp .env.example .env                               # AUTH_DEV_BYPASS=true is already set for local dev
docker compose -f docker-compose.dev.yml up -d     # local Postgres on :5432
npx prisma migrate dev                             # creates tables + generates the client
npm run dev                                        # http://localhost:8000
```

**Endpoint reference for the iOS/Android devs: [docs/API.md](docs/API.md).**

Demo data from the designs (The Linden Loft): `npm run db:seed`.

Try it without any Firebase setup:

```bash
curl -X POST localhost:8000/auth/login -H 'Authorization: Bearer dev:lk452'
curl localhost:8000/users/me -H 'Authorization: Bearer dev:lk452'
```

### Tests

Tests use a separate `roomie_test` database and wipe it before every test.

```bash
createdb -h localhost -U roomie roomie_test   # once (or: docker compose exec db createdb -U roomie roomie_test)
DATABASE_URL=postgresql://roomie:roomie@localhost:5432/roomie_test npx prisma migrate deploy
npm test
```

### Changing the schema

Edit `prisma/schema.prisma`, then `npx prisma migrate dev --name what_changed`. Commit the generated folder in `prisma/migrations/`. The Docker image runs `prisma migrate deploy` on start.

## How login works

```
iOS / Android                                   Roomie API
─────────────                                   ──────────
Google sign-in through Firebase Auth
(hint hd=cornell.edu in the Google picker)
        │ Firebase ID token
        ▼
POST /auth/login  Authorization: Bearer <id token>
                                                verify token with firebase-admin
                                                reject non-@cornell.edu emails
                                                create user on first login (netid = email prefix)
        ◀──────────── { isNewUser, user, house, pendingInvites }

every other request: Authorization: Bearer <id token>
(the Firebase SDK refreshes it automatically; just ask it for the current token)
```

The app picks the first screen from the login response: no house and pending invites → "join this house?"; no house → onboarding; a house → Home.

**Never send Cornell passwords to this server.** The sign-in design shows a NetID + password form; that needs to become a "Continue with Cornell Google" button.

`AUTH_DEV_BYPASS=true` lets you send `Bearer dev:<netid>` instead of a real token. It is ignored when `NODE_ENV=production`.

### Firebase setup (once, by whoever owns the project)

1. Create a Firebase project and enable **Google** as a sign-in provider.
2. Add the iOS and Android apps in Firebase (they need `GoogleService-Info.plist` / `google-services.json`).
3. Project settings → Service accounts → *Generate new private key*. Save it as `firebase-service-account.json` in the repo root (it's gitignored), or put the JSON into `FIREBASE_SERVICE_ACCOUNT_JSON`.

## Project layout

```
src/
  app.ts                 Express app: middleware + routers (exported for tests)
  server.ts              starts the HTTP server
  prisma.ts              Prisma client
  firebase.ts            firebase-admin, initialized on first use
  auth/                  POST /auth/login, token verification
  users/                 GET/PATCH /users/me
  middleware/            requireAuth, requireHouseMember, validateRequest, errors, logging, rate limit
  utils/                 AppError (from Eatery), dates, shared Prisma selects
  <feature>/             one folder per feature: Router → Controller → Service, plus <feature>.schema.ts (Zod)
prisma/
  schema.prisma          every table
  migrations/
test/                    integration tests (one file per feature)
```

### Conventions

- **Errors**: throw `NotFoundError`, `ForbiddenError`, etc. from `utils/AppError.ts`. Express 5 forwards async errors to `globalErrorHandler`, which returns `{ status, statusCode, message, errorCode, data? }`.
- **Validation**: each route gets `validateRequest(schema)`; in the controller, `valid(req, schema)` returns the typed, parsed `{ body, query, params }`.
- **Money** is always whole cents (`priceCents: 429` = $4.29).
- **Date-only values** (due dates, lease end) are `"YYYY-MM-DD"` strings in the API and `DATE` in Postgres. "Today" means today in the house's `timezone`, not the server's.
- **House routes** live under `/houses/:houseId/...` behind `requireHouseMember`, which answers 404 to non-members so house IDs can't be probed.

## Deploying

`.github/workflows/deploy-dev.yml` and `deploy-prod.yml` are Eatery's workflows renamed for Roomie. They are manual-only for now. Once AppDev sets up a server and a `cornellappdev/roomie-dev` Docker Hub repo, add the secrets (`DOCKER_USERNAME`, `DOCKER_PASSWORD`, `DEV_SERVER_HOST`, `SERVER_USERNAME`, `DEV_SERVER_KEY`) and uncomment the `push` trigger. `ci.yml` runs type checks and tests on every PR.
