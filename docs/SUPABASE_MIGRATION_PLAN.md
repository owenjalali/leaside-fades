# Neon → Supabase migration plan (option, not yet scheduled)

Status: **assessment + runbook only — no migration has been performed.**

## Is it a good idea?

Yes, with one caveat. The case for moving:

- **Removes the failure class permanently.** Supabase free tier is always-on shared Postgres —
  no scale-to-zero, no compute-hour metering. The cold-start 503 saga and the compute-quota
  outage recorded in `feat: fit reminder scheduling and history inside Neon Free quotas`
  (commit `7807074`) both become impossible.
- **Stack consolidation.** Supabase is the default backend for every other Leviathan project;
  one console, one mental model.
- **The database is tiny** (~1.5k appointments, well under the 500MB free limit) and the app
  talks plain Postgres through Drizzle/pg — no Supabase SDK adoption needed. This is "Postgres
  hosted somewhere better", not a re-architecture.

The caveat: the current setup **works** after the connect-retry fix, and staying on Neon with the
$19 Launch plan (no scale-to-zero) is the zero-effort alternative if quota pressure returns.
Migrate as planned maintenance, not as an emergency. If the Neon console shows compute usage
comfortably under the free quota month after month, this can wait indefinitely.

Supabase free-tier note: projects pause after ~7 days of **inactivity** — site traffic plus the
half-hourly reminder job means this never triggers for a live shop.

## Runbook (~half a day including verification)

1. **Create the Supabase project** in `us-east-1` (matches Vercel iad1 + current Neon region).
   Save the database password once into the password manager.
2. **Schema**: point a shell at the new DB and run the Drizzle migrations
   (`DATABASE_URL=<supabase-session-pooler-url> npm run db:migrate`). Verify with `\dt` that all
   tables from `src/server/db/schema.ts` exist.
3. **Data**: brief booking freeze (late evening), then
   `pg_dump --data-only` from Neon → `psql` into Supabase. Verify row counts on `bookings`,
   `notifications`, `scheduler_job_runs`, `users`, service/price tables. Reset sequences
   (`setval`) if any serial columns exist.
4. **Connection strings — the one technical trap**: the reminder path uses
   `pg_try_advisory_lock` (session-scoped), so Vercel's `DATABASE_URL` must use Supabase's
   **session-mode pooler (port 5432)**, NOT transaction mode (6543). Also use the pooler for
   `DATABASE_URL_UNPOOLED`/migrations — Supabase *direct* connections are IPv6-only, which
   Vercel functions (and many home ISPs) can't reach.
5. **SSL**: keep `DATABASE_SSL_MODE` per the sslmode ADR in `docs/DECISIONS.md`
   (Supabase pooler requires TLS like Neon; `db/client.ts` handles it).
6. **Deploy + verify**: update Vercel env `DATABASE_URL` → redeploy → run
   `npm run qa:production-smoke` and `npm run qa:production-reminder-heartbeat`, watch two
   reminder ticks in the Trigger.dev runs view, click through `/admin/dashboard`.
7. **Rollback**: flip Vercel `DATABASE_URL` back to Neon (keep the Neon project untouched for
   at least a week). Any bookings made on Supabase during that window would need a manual copy
   back — hence the freeze in step 3 and a same-evening go/no-go.
8. **Cleanup (after a stable week)**: delete the Neon project; remove the Neon-era
   `POSTGRES_*`/`PGHOST*`/`NEON_PROJECT_ID` Vercel envs; record the move in `docs/DECISIONS.md`.
