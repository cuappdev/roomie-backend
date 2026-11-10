# roomie-backend

Backend for Roomie, made by [Cornell AppDev](https://www.cornellappdev.com).

Tech stack:

1. TypeScript/Node.js (Express)
2. PostgreSQL (Prisma)

## Setup

```bash
npm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # local Postgres
npx prisma generate
npx prisma migrate dev
```

## Running the app

```bash
npm run dev
```

Check `http://localhost:8000/health`.

## Tests

```bash
npm test
```

## Linting

```bash
npm run lint
npm run format
```
