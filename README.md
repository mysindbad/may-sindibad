# My Sindbad

My Sindbad is a Next.js travel application with PostgreSQL/Drizzle persistence, authentication, trips, marketplace/bookings, community features, maps, payments integration, and optional AI/weather providers.

## Runtime requirements

- Node.js 22+
- PostgreSQL

## Local setup

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Set `DATABASE_URL` before database commands. Never commit real secrets.

## Validation

Before production deployment, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Production configuration

Use `.env.example` as the source of environment-variable names. At minimum, production requires a valid PostgreSQL `DATABASE_URL` and a canonical HTTPS `APP_BASE_URL`. Optional integrations include Google OAuth, Stripe, an OpenAI-compatible AI provider, weather, and map tiles.

Database schema and hardening migrations are under `drizzle/`. Apply the migration chain to the production database and validate the application against that database before launch.

The repository includes tests and QA/runtime scripts. Treat them as verification tools; inspect the code and deployment target before deciding the exact production procedure.
