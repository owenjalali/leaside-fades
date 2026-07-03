# Leaside Fades

Custom booking and scheduling platform for Leaside Fades, a two-location barbershop in Toronto. It is a focused "Fresha Lite": scheduling correctness, no double-booking, reliable availability generation, a clean customer booking flow, and simple owner/barber administration — without payments, inventory, payroll, or marketing systems.

One Express app serves three surfaces:

- the marketing site at `/`
- the public customer booking flow at `/book` (with `/booking` as an alias)
- the admin application at `/admin` (calendar, bookings, schedule, team, dashboard)

The platform is live in production at `https://leasidefades.com`.

## Stack

- **Frontend**: React 19 + Vite 7 + TypeScript (strict) single-page app
- **Styling**: Tailwind CSS v4, CSS-first — theme tokens live in `@theme` inside `src/index.css`; there is no `tailwind.config.*` file
- **Backend**: Express 5 in `server.js`, deployed as a single Vercel serverless function through `api/[...route].js`
- **Database**: Neon Postgres via Drizzle ORM and node-postgres (`pg`); migrations managed by drizzle-kit
- **Auth**: custom session auth with Argon2 password hashing (owner/admin/barber roles)
- **Notifications**: Twilio SMS and Resend email through an idempotent notifications outbox (the `notifications` table), with `mock` / `dev` / `live` delivery modes
- **Reminders**: appointment reminders run through `GET /api/jobs/send-reminders`, guarded by `CRON_SECRET` and triggered by cron-job.org (primary) and a GitHub Actions workflow (`.github/workflows/send-reminders.yml`, backup)
- **Tests**: Vitest

## Getting Started

```sh
npm install
```

Copy `.env.example` to `.env` and fill in values (see Environment Variables below):

```sh
cp .env.example .env
```

Apply database migrations:

```sh
npm run db:migrate
```

Optionally seed a local dev owner account and sample shifts:

```sh
npm run db:seed:dev-owner
npm run db:seed:dev-shifts
```

Start the dev server:

```sh
npm run dev
```

## Key Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck (`tsc`) + production build |
| `npm test` | Run the Vitest suite |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | Lint the codebase |
| `npm run db:generate` | Generate Drizzle migrations from the schema |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed static public business data |
| `npm run db:seed:dev-owner` | Seed a local dev owner account |
| `npm run db:seed:dev-shifts` | Seed local sample shifts |
| `npm run qa:production-smoke` | Non-mutating production smoke check (health, catalog, auth guards) |
| `npm run qa:production-read-stress` | Bounded non-mutating production read stress |
| `npm run qa:production-reminder-heartbeat` | Verify the durable reminder success heartbeat |
| `npm run qa:production-reminder-scheduler` | Verify scheduler runs in Vercel production logs |
| `npm run qa:phase*` | Repeatable per-phase real-route QA runners |
| `npm run preview` | Preview the production build locally |
| `npm run server` | Run the Express server directly (`node server.js`) |

## Environment Variables

`.env.example` is the authoritative, annotated list — copy it and fill in real values. The critical ones:

- `DATABASE_URL` — Postgres connection string (Neon in production)
- `NOTIFICATION_DELIVERY_MODE` — `mock` (default), `dev`, or `live`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — SMS delivery (live mode only)
- `RESEND_API_KEY` — email delivery (live mode only)
- `CRON_SECRET` — bearer token guarding `GET /api/jobs/send-reminders`
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob for barber profile photo uploads
- `SITE_*` — public site configuration (business name, phone, booking URL, social links)

Never put real credentials anywhere except your gitignored `.env` locally or Vercel environment variables in production.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system architecture, time model, and core module boundaries
- [docs/BOOKING_RULES.md](docs/BOOKING_RULES.md) — availability and booking rules (slot intervals, notice windows, overlap logic)
- [docs/PRODUCTION_RUNBOOK.md](docs/PRODUCTION_RUNBOOK.md) — deploy, smoke, reminder scheduler, cutover, and rollback procedures
- [docs/DECISIONS.md](docs/DECISIONS.md) — dated architecture decision records
- [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md) — manual QA checklist
- [docs/FRESHA_IMPORT_GUIDE.md](docs/FRESHA_IMPORT_GUIDE.md) — guarded Fresha data import workflow

## Deployment

Hosted on Vercel. Pushes to `master` auto-deploy to production, so every push to `master` is a deliberate production deploy. The build serves the SPA from `dist/` and routes all `/api/*` traffic to the single serverless function. Follow [docs/PRODUCTION_RUNBOOK.md](docs/PRODUCTION_RUNBOOK.md) for pre-deploy checks, migrations, smoke tests, and rollback.

## Security And Public Repository Policy

This repository is public. Rules:

- All secrets are environment-only: Vercel environment variables in production, a gitignored `.env` locally.
- Never commit credentials, tokens, exports, cookies, or customer data.
- `.env.example` contains placeholders and documentation only — no real values.
- Customer cancel/reschedule links use unguessable tokens; notification metadata never contains raw management tokens or URLs.
