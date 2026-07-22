# Trigger.dev reminder scheduling

Status (2026-07-19): **live**. The scheduled task in `src/trigger/send-reminders.ts` is deployed
to Trigger.dev project **leaside-fades** (`proj_wuzcnpvcgrcswqpushpt`, org Leviathan Systems) and
runs every 30 minutes 06:00–21:30 Toronto with 3 retry attempts per run. `CRON_SECRET` is synced
into the Trigger.dev Production environment at deploy time via the `syncEnvVars` extension in
`trigger.config.ts` (value is read from the deploying shell — pull it from Vercel first; it is
never entered in the dashboard). A Production email alert to the owner fires on task-run failure
and deployment failure.

It replaces cron-job.org job `7551064` and the GitHub Actions canary
(`.github/workflows/send-reminders.yml`) after the parallel-run period below. The endpoint is
idempotent (advisory lock + 30-minute `recent_success` guard + outbox idempotency keys), so
retries and two schedulers running in parallel are both safe; a `skipped: recent_success`
result counts as a healthy run.

## Deploying updates

The repo folder was renamed to `C:\Users\owenj\Websites\leaside-fades` (2026-07-19) because the
Trigger.dev CLI's containerized indexer breaks on paths containing spaces (it URL-encodes them
into module URLs — `Cannot find module '…/Leaside%20Fades/trigger.config.mjs'`; a junction at a
space-free path does not help, the CLI canonicalizes to the real name). With the rename in place,
deploys run straight from the repo:

```powershell
cd C:\Users\owenj\Websites\leaside-fades
# load CRON_SECRET into the shell (e.g. from `vercel env pull`) before deploying
npx trigger.dev@4.5.4 deploy
```

Keep the CLI version pinned and matching the two `@trigger.dev/*` package versions
(`@trigger.dev/sdk` and `@trigger.dev/build`, both repo dependencies) — the CLI aborts on
mismatch in non-interactive shells. The old `C:\Users\owenj\.leaside-trigger` mirror workspace
is retired and deleted.

## Cutover status (2026-07-19)

Cutover executed at the owner's request — Trigger.dev is the sole scheduler:

1. `.github/workflows/send-reminders.yml` deleted (commit `098867c`).
2. cron-job.org job `7551064`: disable in the cron-job.org dashboard (needs the owner's
   login). Until it is disabled it runs harmlessly in parallel — the endpoint's advisory
   lock and 30-minute `recent_success` guard make double-scheduling safe.
3. `docs/PRODUCTION_REMINDER_JOBS.md` sections about cron-job.org and the GH canary are
   historical; the endpoint, auth, and cadence guard are unchanged. Watch the
   [Trigger.dev runs view](https://cloud.trigger.dev/orgs/leviathan-systems-1eba/projects/leaside-fades-nkri/env/prod/runs)
   for the :00/:30 Toronto cadence (`skipped: recent_success` counts as healthy).

## Local development

`npm run trigger:dev` runs the task against the Trigger.dev dev environment (schedules only fire
while the CLI is running). Set `CRON_SECRET` in your shell first for a real authenticated call;
without it the run fails fast by design. The dev command has the same space-in-path constraint —
run it from the workspace if it errors.
