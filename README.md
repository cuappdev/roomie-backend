# roomie-backend

An open-sourced backend for Roomie, an app for managing life with your roommates: chores, a shared shopping list, bills and more. Made by [Cornell AppDev](https://www.cornellappdev.com).

Tech stack:

1. TypeScript/Node.js (Express 5)
2. PostgreSQL (Prisma 7)
3. Firebase Auth (Google sign-in, Cornell accounts only)

> `main` currently serves `GET /health` only. Login, profile, houses, chores and the shopping list live on the `mvp-features` branch.

## Installation

To run this project, you need [Node.js](https://nodejs.org/en/download/) 22+ and [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or a local PostgreSQL install).

Clone the project with

```bash
git clone https://github.com/cuappdev/roomie-backend.git
```

After cloning the project, `cd` into the new directory and install dependencies with

```bash
npm install
```

## Setting up the database

Start a local Postgres database with

```bash
docker compose -f docker-compose.dev.yml up -d
```

This creates a database called `roomie` with user `roomie` and password `roomie` on port 5432. If you installed Postgres yourself, create the same user and database instead:

```sql
CREATE ROLE roomie LOGIN SUPERUSER PASSWORD 'roomie';
CREATE DATABASE roomie OWNER roomie;
```

Then generate the Prisma client and create the tables:

```bash
npx prisma generate
npx prisma migrate dev
```

To look at the data, run `npx prisma studio`.

Whenever you change `prisma/schema.prisma`, run `npx prisma migrate dev --name <what_changed>` followed by `npx prisma generate`, and commit the new folder in `prisma/migrations/`.

## Environment variables

Copy the template and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. The default matches the Docker database above. |
| `PORT` | Port the server listens on (default `8000`). |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to the Firebase service account key. Ask in the `#roomie-backend` channel for `firebase-service-account.json` and put it in the root directory. |

## Running the app

```bash
npm run dev
```

Then check that it's up at `http://localhost:8000/health`. You can also import `docs/roomie.postman_collection.json` into Postman.

## Running tests

Tests run against a separate `roomie_test` database. Set it up once:

```bash
docker compose -f docker-compose.dev.yml exec db createdb -U roomie roomie_test
DATABASE_URL=postgresql://roomie:roomie@localhost:5432/roomie_test npx prisma migrate deploy
```

Then run

```bash
npm test
```

## Deployment

Pushing to `main` builds a Docker image and deploys it to the dev server through GitHub Actions, the same setup as Eatery. Pushing to `release` deploys to prod. Both workflows only run when started by hand until the server and secrets are set up.

## Configuration (optional)

We use ESLint and Prettier for linting and formatting. If you are using VS Code, both are available in the Extensions panel. Run ESLint with `npm run lint` and Prettier with `npm run format`.
