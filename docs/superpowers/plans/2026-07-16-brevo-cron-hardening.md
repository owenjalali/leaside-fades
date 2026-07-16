# Brevo Migration, Twilio Pause, and Reminder Cron Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Leaside Fades transactional email to Brevo, pause Twilio SMS without false failures, and make the reminder endpoint bounded, single-connection, concurrency-safe, and operationally truthful.

**Architecture:** Keep the existing notification provider and outbox boundaries, replace the live email adapter with a bounded Brevo HTTP adapter, and represent Twilio pause as an intentional provider state. Move live HTTP reminder orchestration into a focused module that authenticates before imports, acquires one bounded PostgreSQL client plus a session advisory lock, and passes that same Drizzle executor through cadence, reminder, heartbeat, and retention work. Extend the existing dashboard heartbeat interpretation rather than changing the scheduler-run schema.

**Tech Stack:** Express 5, TypeScript, Vitest, node-postgres, Drizzle ORM, native `fetch`, Brevo transactional email API, Twilio SDK, React/Vite, Vercel Functions, PostgreSQL advisory locks, headed Playwright CLI.

---

## File Structure

New files:

- `src/server/jobs/cron-auth.ts`: constant-time bearer parsing/comparison with no application imports.
- `src/server/jobs/cron-auth.test.ts`: bearer authentication coverage.
- `src/server/notifications/reminder-http-execution.ts`: one-connection HTTP orchestration, locking, cadence, and deadlines.
- `src/server/notifications/reminder-http-execution.test.ts`: fake pool/client/job orchestration tests.

Modified groups:

- Notification provider: `src/server/notifications/types.ts`, `config.ts`, `providers.ts`, their tests, `package.json`, and `package-lock.json`.
- Pause/deadline behavior: `dispatcher.ts`, `repository.ts`, `reminders.ts`, `reminder-job-runner.ts`, and tests.
- Cron/database: `server.js`, `src/server/db/client.ts`, route/scheduler tests, and the new executor.
- Health UI: `src/server/admin/bookings-service.ts`, `api.ts`, `src/admin/types.ts`, `admin-utils.ts`, `AdminApp.tsx`, and tests.
- Operations: `.env.example`, project status, architecture/rules/decisions/QA docs, reminder runbook, production runbook.

## Task 1: Notification Runtime Contract and Brevo Provider

**Files:**
- Modify: `src/server/notifications/types.ts`
- Modify: `src/server/notifications/config.ts`
- Modify: `src/server/notifications/config.test.ts`
- Modify: `src/server/notifications/providers.ts`
- Modify: `src/server/notifications/providers.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write failing configuration and provider tests**

Add tests proving live mode requires `BREVO_API_KEY` and `EMAIL_FROM`, omits Twilio credentials when `SMS_DELIVERY_MODE=paused`, and requires them when SMS is live. Exercise Brevo with injected fetch:

```ts
test("live Brevo sends a bounded transactional email", async () => {
    const fetchImpl = vi.fn(async () => new Response(
        JSON.stringify({ messageId: "<brevo-message-id>" }),
        { status: 201, headers: { "content-type": "application/json" } },
    ));
    const providers = createNotificationProviders({
        mode: "live",
        env: {
            BREVO_API_KEY: "brevo-test-key",
            EMAIL_FROM: "Leaside Fades <bookings@leasidefades.com>",
            SMS_DELIVERY_MODE: "paused",
        },
        fetch: fetchImpl,
    });

    await expect(providers.email.send({
        idempotencyKey: "booking-1:email",
        to: "customer@example.com",
        subject: "Booking confirmed",
        text: "Confirmed",
        html: "<p>Confirmed</p>",
    })).resolves.toEqual({ provider: "brevo", providerMessageId: "<brevo-message-id>" });

    expect(fetchImpl).toHaveBeenCalledWith(
        "https://api.brevo.com/v3/smtp/email",
        expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
});
```

- [ ] **Step 2: Run focused tests and verify red**

Run: `npm run test -- src/server/notifications/config.test.ts src/server/notifications/providers.test.ts`

Expected: FAIL because Brevo configuration, provider state, and adapter do not exist.

- [ ] **Step 3: Implement the provider contract**

Add active/paused provider state:

```ts
export type NotificationProviderDeliveryState = "active" | "paused";

export interface NotificationProviderStatus {
    provider: string;
    deliveryState: NotificationProviderDeliveryState;
    pauseReason?: "provider_paused";
}
```

Have SMS/email provider interfaces extend this status. Implement Brevo with native fetch and a bounded abort signal:

```ts
class BrevoEmailProvider implements EmailNotificationProvider {
    readonly provider = "brevo";
    readonly deliveryState = "active" as const;

    constructor(
        private readonly env: NotificationProviderEnv,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    async send(input: EmailSendInput): Promise<NotificationSendResult> {
        const apiKey = requiredEnv(this.env, "BREVO_API_KEY");
        const sender = parseEmailFrom(requiredEnv(this.env, "EMAIL_FROM"));
        const response = await this.fetchImpl("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                accept: "application/json",
                "api-key": apiKey,
                "content-type": "application/json",
            },
            signal: AbortSignal.timeout(providerTimeoutMsFromEnv(this.env)),
            body: JSON.stringify({
                sender,
                to: [{ email: input.to }],
                subject: input.subject,
                textContent: input.text,
                htmlContent: input.html,
                ...(this.env.EMAIL_REPLY_TO?.trim()
                    ? { replyTo: { email: this.env.EMAIL_REPLY_TO.trim() } }
                    : {}),
            }),
        });
        if (!response.ok) {
            throw new Error(`Brevo email delivery failed (HTTP ${response.status}).`);
        }
        const body = await response.json() as { messageId?: string };
        return {
            provider: this.provider,
            providerMessageId: body.messageId ?? `brevo-${safeProviderId(input.idempotencyKey)}`,
        };
    }
}
```

Parse either `Name <email@example.com>` or a bare email, reject malformed senders, sanitize Brevo failures to status-only messages, dynamically import `twilio` inside active SMS `send()`, and create a paused Twilio adapter that the dispatcher must never call.

- [ ] **Step 4: Remove Resend and verify green**

Run: `npm uninstall resend`

Run: `npm run test -- src/server/notifications/config.test.ts src/server/notifications/providers.test.ts`

Expected: PASS. `npm ls resend` shows no installed dependency.

- [ ] **Step 5: Commit provider migration**

```powershell
git add package.json package-lock.json src/server/notifications/types.ts src/server/notifications/config.ts src/server/notifications/config.test.ts src/server/notifications/providers.ts src/server/notifications/providers.test.ts
git commit -m "feat: migrate notification email provider to Brevo"
```

## Task 2: Intentional Twilio Pause and Failed-Row Reconciliation

**Files:**
- Modify: `src/server/notifications/dispatcher.ts`
- Modify: `src/server/notifications/dispatcher.test.ts`
- Modify: `src/server/notifications/repository.ts`
- Modify: `src/server/notifications/reminders.test.ts`

- [ ] **Step 1: Write failing pause tests**

Use a paused provider whose `send` is a spy that throws if reached. Expect the SMS result to be skipped with provider and pause reason, while email still sends:

```ts
expect(result).toContainEqual(expect.objectContaining({
    channel: "sms",
    status: "skipped",
    provider: "twilio",
    skipReason: "provider_paused",
}));
expect(providerSet.sms.send).not.toHaveBeenCalled();
```

Add a repository regression starting with the same idempotency key in `failed` state and expecting `createSkippedAttempt()` to convert it to `skipped`, clear `errorMessage`, preserve `provider: "twilio"`, and increment `attemptCount`.

- [ ] **Step 2: Run pause tests and verify red**

Run: `npm run test -- src/server/notifications/dispatcher.test.ts src/server/notifications/reminders.test.ts`

Expected: FAIL because paused provider metadata is ignored and existing failed rows remain failed.

- [ ] **Step 3: Skip paused providers before claiming a send**

Resolve the channel provider before `createPendingAttempt()`. For paused providers, call `createSkippedAttempt()` with `status: "skipped"`, provider name, and `metadata.skipReason = "provider_paused"`. Return provider and skip reason in the dispatch result.

After an insert conflict, reconcile only failed rows:

```ts
const [reconciled] = input.status === "skipped"
    ? await db.update(notifications).set({
        status: "skipped",
        provider: input.provider,
        providerMessageId: null,
        errorMessage: null,
        metadata: input.metadata,
        attemptCount: sql`${notifications.attemptCount} + 1`,
        lastAttemptAt: input.lastAttemptAt,
        updatedAt: input.updatedAt,
    }).where(and(
        eq(notifications.idempotencyKey, input.idempotencyKey),
        eq(notifications.status, "failed"),
    )).returning(notificationReturningFields)
    : [];
```

Treat a reconciled row as a new skip result, not a duplicate.

- [ ] **Step 4: Run pause and retry regressions**

Run: `npm run test -- src/server/notifications/dispatcher.test.ts src/server/notifications/reminders.test.ts`

Expected: PASS, including existing retry/idempotency behavior.

- [ ] **Step 5: Commit Twilio pause**

```powershell
git add src/server/notifications/dispatcher.ts src/server/notifications/dispatcher.test.ts src/server/notifications/repository.ts src/server/notifications/reminders.test.ts
git commit -m "feat: pause Twilio reminders without delivery failures"
```

## Task 3: Reminder Deadline and Provider-Level Results

**Files:**
- Modify: `src/server/notifications/types.ts`
- Modify: `src/server/notifications/dispatcher.ts`
- Modify: `src/server/notifications/dispatcher.test.ts`
- Modify: `src/server/notifications/reminders.ts`
- Modify: `src/server/notifications/reminders.test.ts`
- Modify: `src/server/notifications/reminder-job-runner.ts`

- [ ] **Step 1: Write failing deadline and aggregation tests**

Inject a `canStartProviderCall` sequence of `[true, false]` and expect one provider result plus one deferred channel:

```ts
expect(result).toEqual({
    scanned: 1,
    totalAttempts: 2,
    sent: 0,
    failed: 1,
    skipped: 0,
    duplicate: 0,
    deferred: 1,
    failedByProvider: { brevo: 1 },
    pausedByProvider: {},
});
```

Add a paused-only case expecting `pausedByProvider: { twilio: 1 }`, `failed: 0`, and no Twilio call.

- [ ] **Step 2: Run result tests and verify red**

Run: `npm run test -- src/server/notifications/dispatcher.test.ts src/server/notifications/reminders.test.ts`

Expected: FAIL because deferred/provider result fields do not exist.

- [ ] **Step 3: Implement per-recipient deadline gating**

Add dispatch status `deferred` plus optional `provider` and `skipReason`. Before creating a pending row:

```ts
if (input.canStartProviderCall && !input.canStartProviderCall()) {
    return {
        idempotencyKey,
        channel: input.recipient.channel,
        recipientType: input.recipient.recipientType,
        provider: provider.provider,
        status: "deferred",
    };
}
```

Add `deadlineAtMs`, `providerTimeoutMs`, and injected `nowMs` to the reminder job. Require a 1,000 ms database bookkeeping reserve:

```ts
const canStartProviderCall = input.deadlineAtMs === undefined
    ? undefined
    : () => input.nowMs() + providerTimeoutMs + 1_000 <= input.deadlineAtMs;
```

Deferred work creates no row and remains eligible through the lookback window. Aggregate failed, paused, and deferred work without changing existing idempotency keys.

- [ ] **Step 4: Run reminder and scheduler tracking tests**

Run: `npm run test -- src/server/notifications/dispatcher.test.ts src/server/notifications/reminders.test.ts src/server/jobs/scheduler-runs.test.ts`

Expected: PASS and scheduler tracking preserves the extended result.

- [ ] **Step 5: Commit bounded provider work**

```powershell
git add src/server/notifications/types.ts src/server/notifications/dispatcher.ts src/server/notifications/dispatcher.test.ts src/server/notifications/reminders.ts src/server/notifications/reminders.test.ts src/server/notifications/reminder-job-runner.ts
git commit -m "feat: bound reminder provider work by deadline"
```

## Task 4: Authenticate the Cron Before Initialization

**Files:**
- Create: `src/server/jobs/cron-auth.ts`
- Create: `src/server/jobs/cron-auth.test.ts`
- Modify: `server.js`
- Modify: `src/server/server.test.ts`

- [ ] **Step 1: Write failing bearer-authentication tests**

Cover missing, empty, Basic, wrong-length, wrong-value, and correct bearer tokens. Add a route regression that deletes `DATABASE_URL`, sends an unauthorized request, and still receives `401` so authentication is proven to run before scheduler/database initialization.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `npm run test -- src/server/jobs/cron-auth.test.ts src/server/server.test.ts`

Expected: FAIL because the isolated matcher does not exist and the route still initializes application modules too early.

- [ ] **Step 3: Implement a constant-time digest comparison**

Keep the module dependency-free except for Node crypto:

```ts
import { createHash, timingSafeEqual } from "node:crypto";

export function matchesCronBearer(authorization: string | undefined, secret: string): boolean {
    const match = authorization?.match(/^Bearer (.+)$/);
    if (!match) return false;
    const actual = createHash("sha256").update(match[1], "utf8").digest();
    const expected = createHash("sha256").update(secret, "utf8").digest();
    return timingSafeEqual(actual, expected);
}
```

Call this matcher at the top of the route, before dynamic imports of scheduler, notification, or database modules. Return the existing generic `401` response without exposing whether the secret was absent or incorrect.

- [ ] **Step 4: Verify authentication behavior**

Run: `npm run test -- src/server/jobs/cron-auth.test.ts src/server/server.test.ts`

Expected: PASS, including the no-`DATABASE_URL` unauthorized regression.

- [ ] **Step 5: Commit cron authentication**

```powershell
git add server.js src/server/server.test.ts src/server/jobs/cron-auth.ts src/server/jobs/cron-auth.test.ts
git commit -m "fix: authenticate reminder cron before initialization"
```

## Task 5: One Bounded Database Session and Advisory Lock

**Files:**
- Modify: `src/server/db/client.ts`
- Modify: `src/server/db/client.test.ts`
- Create: `src/server/notifications/reminder-http-execution.ts`
- Create: `src/server/notifications/reminder-http-execution.test.ts`
- Modify: `src/server/notifications/reminder-job-runner.ts`
- Modify: `server.js`
- Modify: `src/server/server.test.ts`

- [ ] **Step 1: Write failing pool and orchestration tests**

Assert that the HTTP pool is configured with `max: 1`, `connectionTimeoutMillis: 4_000`, and `query_timeout: 5_000`. With fake pool/client/job dependencies, prove:

- exactly one `connect()` serves cadence summary, reminder work, heartbeat, and retention;
- an unavailable advisory lock returns `200` semantics with `{ skipped: true, reason: "concurrent_run" }`;
- a recent successful run returns the existing cadence skip;
- provider delivery failures return a degraded result;
- connection/init timeout maps to a typed `503` outcome;
- unlock, release, and pool close happen after success and failure.

- [ ] **Step 2: Run bounded-execution tests and verify red**

Run: `npm run test -- src/server/db/client.test.ts src/server/notifications/reminder-http-execution.test.ts src/server/server.test.ts`

Expected: FAIL because the pool defaults are unbounded and the route creates separate database lifecycles.

- [ ] **Step 3: Allow an executor to reuse an acquired client**

Refactor database creation into `createDatabaseExecutor(poolOrClient)` plus `createDatabaseClient(connectionString, env, poolOptions)`. Preserve existing callers, while the HTTP path supplies:

```ts
{
    max: 1,
    connectionTimeoutMillis: connectionTimeoutMs,
    query_timeout: queryTimeoutMs,
}
```

Keep all timeout values clamped to safe positive ranges and use defaults of 4 seconds for connect and 5 seconds for queries.

- [ ] **Step 4: Implement one-session reminder HTTP execution**

Acquire one client and a two-key session advisory lock using a parameterized query:

```sql
select pg_try_advisory_lock($1, $2) as acquired
```

Use fixed signed 32-bit keys dedicated to the reminder job. Build one Drizzle executor on that client and pass it to cadence summary and `runConfiguredReminderJob`. Pass `deadlineAtMs = startedAtMs + 24_000` and `trigger: "http"`. Keep heartbeat and retention operations on the same executor through the existing tracked-job transaction path. Release the advisory lock in `finally`, then release the client and close the pool.

The job runner must only close a pool it owns; when an executor is injected it must leave lifecycle ownership with the caller.

- [ ] **Step 5: Map typed infrastructure outcomes at the route**

After cheap authentication, dynamically import the HTTP executor. Return:

- `200` for completed, cadence-skipped, or concurrent-skipped work;
- `200` with `degraded: true` for completed work containing provider failures/deferred work;
- `503` for bounded connection/initialization timeout;
- non-`2xx` for an actual job/database infrastructure exception.

Never include credentials, connection strings, or raw provider response bodies in responses or logs.

- [ ] **Step 6: Run focused execution tests**

Run: `npm run test -- src/server/db/client.test.ts src/server/notifications/reminder-http-execution.test.ts src/server/server.test.ts src/server/notifications/reminder-job-runner.test.ts`

Expected: PASS, with one connect and deterministic cleanup in every tested path.

- [ ] **Step 7: Commit bounded initialization**

```powershell
git add server.js src/server/server.test.ts src/server/db/client.ts src/server/db/client.test.ts src/server/notifications/reminder-http-execution.ts src/server/notifications/reminder-http-execution.test.ts src/server/notifications/reminder-job-runner.ts src/server/notifications/reminder-job-runner.test.ts
git commit -m "fix: bound reminder cron initialization"
```

## Task 6: Expose Degraded Delivery and Provider State

**Files:**
- Modify: `src/server/admin/bookings-service.ts`
- Modify: `src/server/admin/bookings-service.test.ts`
- Modify: `src/server/admin/api.ts`
- Modify: `src/server/admin/api.test.ts`
- Modify: `src/admin/types.ts`
- Modify: `src/admin/admin-utils.ts`
- Modify: `src/admin/admin-utils.test.ts`
- Modify: `src/admin/AdminApp.tsx`

- [ ] **Step 1: Write failing scheduler-health tests**

Add a recent successful heartbeat with `result.failed = 1`, `result.deferred = 0`, and `result.failedByProvider = { brevo: 1 }`. Expect `state: "degraded"` and a delivery-specific message. Cover state precedence:

```txt
latest infrastructure failure > stale > degraded provider delivery > healthy > unknown
```

Add paused-only work and assert it remains healthy. Paused skips must not enter the sent/failed denominator.

- [ ] **Step 2: Write failing API and UI-model tests**

Expect notification health to expose:

```ts
providers: {
    email: { provider: "brevo", state: "active" },
    sms: { provider: "twilio", state: "paused" },
}
```

Test `SMS_DELIVERY_MODE=live` separately. Extend the admin utility tests for the amber degraded presentation and provider labels.

- [ ] **Step 3: Run health tests and verify red**

Run: `npm run test -- src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts src/admin/admin-utils.test.ts`

Expected: FAIL because `degraded` and provider state are not represented.

- [ ] **Step 4: Implement truthful health interpretation**

Parse provider failure/deferred counters defensively from scheduler-run JSON. Preserve infrastructure failure/staleness precedence, then set `degraded` when a recent successful run completed with delivery failures or deferred provider calls. Treat `provider_paused` as an explicit provider state, not a scheduler failure.

Have the admin API derive provider status from environment configuration without returning keys or credentials. Render an amber degraded state plus compact labels: `Email - Brevo active` and `SMS - Twilio paused`/`active`.

- [ ] **Step 5: Verify scheduler health and admin rendering**

Run: `npm run test -- src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts src/admin/admin-utils.test.ts`

Expected: PASS for healthy, degraded, stale, failed, unknown, paused, and active cases.

- [ ] **Step 6: Commit scheduler health**

```powershell
git add src/server/admin/bookings-service.ts src/server/admin/bookings-service.test.ts src/server/admin/api.ts src/server/admin/api.test.ts src/admin/types.ts src/admin/admin-utils.ts src/admin/admin-utils.test.ts src/admin/AdminApp.tsx
git commit -m "feat: expose notification provider health"
```

## Task 7: Environment Contract, Documentation, and Local Verification

**Files:**
- Modify: `.env.example`
- Modify: `PROJECT_STATUS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/BOOKING_RULES.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/QA_CHECKLIST.md`
- Modify: `docs/PRODUCTION_REMINDER_JOBS.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`

- [ ] **Step 1: Update the environment template**

Replace Resend configuration with `BREVO_API_KEY`, `EMAIL_FROM`, and optional `EMAIL_REPLY_TO`. Document `SMS_DELIVERY_MODE=paused`, `NOTIFICATION_PROVIDER_TIMEOUT_MS=5000`, `REMINDER_DB_CONNECT_TIMEOUT_MS=4000`, `REMINDER_DB_QUERY_TIMEOUT_MS=5000`, and `REMINDER_HTTP_DEADLINE_MS=24000`. Never add real values.

- [ ] **Step 2: Update architecture, decision, status, and operations docs**

Record the Brevo decision and shared-Resend isolation, intentional Twilio pause, single database session/lock, bounded deadline behavior, degraded provider health, recovery steps, and the warning that pausing sends does not stop Twilio number/account charges. Update Phase 9/10/12 QA items with exact verification commands and production smoke checks.

- [ ] **Step 3: Run focused notification and cron suites**

Run:

```powershell
npm run test -- src/server/notifications src/server/jobs src/server/db/client.test.ts src/server/server.test.ts src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts src/admin/admin-utils.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the full local quality gate**

Run:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Expected: all commands exit `0`; lint has zero errors and no new warnings.

- [ ] **Step 5: Commit docs and environment contract**

```powershell
git add .env.example PROJECT_STATUS.md docs/ARCHITECTURE.md docs/BOOKING_RULES.md docs/DECISIONS.md docs/QA_CHECKLIST.md docs/PRODUCTION_REMINDER_JOBS.md docs/PRODUCTION_RUNBOOK.md
git commit -m "docs: document Brevo and cron operations"
```

## Task 8: Headed Brevo and Vercel Production Rollout

**Files:**
- Verify only: deployed production application and external provider/DNS configuration

- [ ] **Step 1: Confirm account scope before changing Brevo**

In the existing headed Playwright session, verify this Brevo account is on Free with the 300-email daily allowance and has no unrelated active sending domains, senders, API keys, or transactional workload. If it contains unrelated active production configuration, stop before mutation and report the conflict.

Do not take snapshots of credential pages. Do not expose, transcribe, or persist any SMTP password or API key in conversation, terminal output, screenshots, source files, or Git history.

- [ ] **Step 2: Authenticate the Leaside Fades sender/domain**

Add `leasidefades.com` or Brevo's recommended sending subdomain and sender `Leaside Fades <bookings@leasidefades.com>`. Copy Brevo's exact DKIM, DMARC, and provider-required SPF records into the authoritative DNS UI. Preserve existing MX records and merge/avoid duplicate SPF records exactly as the DNS/provider UI requires. Wait for Brevo verification and confirm all required checks pass.

- [ ] **Step 3: Create and install a production API key without revealing it**

Create one narrowly named key: `Leaside Fades Production Transactional`. Transfer it directly from the headed browser into Vercel's Production `BREVO_API_KEY` field using the browser clipboard/UI. Do not print it or save it locally.

Set Production configuration:

```txt
EMAIL_FROM=Leaside Fades <bookings@leasidefades.com>
SMS_DELIVERY_MODE=paused
NOTIFICATION_PROVIDER_TIMEOUT_MS=5000
REMINDER_DB_CONNECT_TIMEOUT_MS=4000
REMINDER_DB_QUERY_TIMEOUT_MS=5000
REMINDER_HTTP_DEADLINE_MS=24000
```

Keep `NOTIFICATION_DELIVERY_MODE=live` and keep existing Twilio credentials stored but unused.

- [ ] **Step 4: Deploy and run bounded endpoint smoke checks**

Deploy the verified commit to production. Confirm an unauthenticated request returns `401`; confirm an authenticated dry-run returns `200` without sending or opening unnecessary provider work. Run one controlled reminder invocation and verify it completes below 24 seconds, returns `200` even if delivery is degraded, and never invokes paused Twilio.

- [ ] **Step 5: Verify one controlled Brevo delivery**

Send only to the owner-controlled test recipient already approved for the migration. Verify the Brevo activity log records accepted/delivered status and no Twilio message or charge-producing send occurs. Confirm the production dashboard shows Brevo active, Twilio paused, and the scheduler state truthfully healthy or degraded.

- [ ] **Step 6: Retire Resend from only this Vercel project**

After successful Brevo delivery, remove `RESEND_API_KEY` from the Leaside Fades Vercel Production environment and redeploy. Do not delete, rotate, or modify the shared Resend account, its other client domains, or their credentials.

- [ ] **Step 7: Verify scheduler recovery and repository state**

Confirm the cron-job.org endpoint receives a non-timeout `200` on the next execution, the scheduler heartbeat is current, and provider failures are visible as degraded rather than hidden. Run:

```powershell
git status --short
git log --oneline -8
```

Expected: no unintended tracked changes or secret-bearing files; `.playwright-cli/` remains untracked or is safely removed after closing the browser session.
