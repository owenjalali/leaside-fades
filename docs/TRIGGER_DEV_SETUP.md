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

## Deploying updates (Windows path quirk)

The Trigger.dev CLI's containerized indexer breaks on paths containing spaces (this repo lives at
`…\Websites\Leaside Fades`), failing with `Cannot find module '…/Leaside%20Fades/trigger.config.mjs'`.
Deploys therefore run from the space-free workspace `C:\Users\owenj\.leaside-trigger`, which holds a
minimal `package.json` (pinned `@trigger.dev/sdk` + `@trigger.dev/build` 4.5.4) plus copies of
`trigger.config.ts` and `src/trigger/send-reminders.ts`. **The repo is the source of truth** — after
editing either file here, re-sync and deploy:

```powershell
Copy-Item "C:\Users\owenj\Websites\Leaside Fades\trigger.config.ts" "C:\Users\owenj\.leaside-trigger\" -Force
Copy-Item "C:\Users\owenj\Websites\Leaside Fades\src\trigger\send-reminders.ts" "C:\Users\owenj\.leaside-trigger\src\trigger\" -Force
cd C:\Users\owenj\.leaside-trigger
# load CRON_SECRET into the shell (e.g. from `vercel env pull`) before deploying
npx trigger.dev@4.5.4 deploy
```

Keep the CLI version pinned and matching the two `@trigger.dev/*` package versions — the CLI
aborts on mismatch in non-interactive shells.

## Cutover checklist

1. Parallel-run a few days. Healthy = green runs on the :00/:30 Toronto cadence in the
   [Trigger.dev runs view](https://cloud.trigger.dev/orgs/leviathan-systems-1eba/projects/leaside-fades-nkri/env/prod/runs),
   `skipped: recent_success` included.
2. Then disable or delete cron-job.org job `7551064` (cron-job.org dashboard) and delete
   `.github/workflows/send-reminders.yml`.
3. `docs/PRODUCTION_REMINDER_JOBS.md` sections about cron-job.org become historical at that
   point; the endpoint, auth, and cadence guard are unchanged.

## Local development

`npm run trigger:dev` runs the task against the Trigger.dev dev environment (schedules only fire
while the CLI is running). Set `CRON_SECRET` in your shell first for a real authenticated call;
without it the run fails fast by design. The dev command has the same space-in-path constraint —
run it from the workspace if it errors.
