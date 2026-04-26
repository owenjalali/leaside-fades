# Decisions - Leaside Fades Booking System

## Decision Log

### 2026-04-26 - Build Custom Fresha Lite Instead of Full Clone

Decision:
Build a focused booking and scheduling system for Leaside Fades, not a full Fresha clone.

Reason:
The business needs reliable booking, staff scheduling, no-double-booking, and admin management. Full Fresha parity would create unnecessary scope creep.

### 2026-04-26 - Soft Migration From Fresha

Decision:
Use soft migration for launch.

Reason:
Keeping existing Fresha appointments active while routing new bookings to the new platform reduces migration risk.

### 2026-04-26 - No Online Payments for MVP

Decision:
Customers pay in shop. No checkout, card payment, deposits, or tax calculation for MVP.

Reason:
The shop already handles payment in person. Payments add complexity without being required for launch.

### 2026-04-26 - 15-Minute Slot Interval

Decision:
Use 15-minute slot intervals.

Reason:
Some services are 15 minutes, such as Beard Trim and Line Up.

### 2026-04-26 - No Buffer for MVP

Decision:
Do not add buffer time between appointments for MVP.

Reason:
The business rules currently require only no-overlap scheduling.

### 2026-04-26 - Repository Documentation Is Source of Truth

Decision:
Use root `AGENTS.md`, `PROJECT_STATUS.md`, and `docs` files to preserve context across fresh Codex windows.

Reason:
The developer expects to start fresh Codex contexts between phases.

### 2026-04-26 - Confirm React Vite + Express Stack

Decision:
Use the existing React Vite frontend and Express backend as the application foundation.

Reason:
The repo already contains a working React Vite marketing site and Express server. Keeping this stack avoids unnecessary framework migration and lets booking features be added incrementally.

### 2026-04-26 - Use PostgreSQL + Drizzle

Decision:
Use PostgreSQL for the database and Drizzle for schema/migrations.

Reason:
PostgreSQL supports strong constraints and transaction semantics needed for scheduling correctness. Drizzle fits the TypeScript/Express stack and keeps migrations explicit.

### 2026-04-26 - Keep Scheduling Logic Server-Side and Isolated

Decision:
Implement availability and booking conflict logic in isolated server-side modules, not React UI components.

Reason:
Scheduling correctness is the core product risk. Centralizing the logic prevents client-side drift and makes edge-case testing practical.

### 2026-04-26 - Prefer PostgreSQL Exclusion Constraint for Confirmed Booking Overlap

Decision:
Prefer a PostgreSQL exclusion constraint to prevent overlapping confirmed bookings for the same barber, backed by transactional application-level checks.

Reason:
Database-level protection reduces race-condition risk. Application-level checks are still required for clearer errors and blocked-time/business-rule validation.

### 2026-04-26 - Use UTC Persistence With America/Toronto Business-Time Calculations

Decision:
Persist appointment/block timestamps in UTC and perform business hour/date calculations in `America/Toronto`.

Reason:
The business operates in Toronto. UTC storage avoids persistence ambiguity while local calculations preserve expected shop behavior.

### 2026-04-26 - Use Notification Outbox/Log Table

Decision:
Log notification attempts in a database table and send through Twilio/Resend provider abstractions.

Reason:
Notifications must be auditable, retryable, and mockable in development without live credentials.

### 2026-04-26 - Defer Auth Decision Until Phase 5

Decision:
Do not implement auth before Phase 5. Before implementing auth, compare custom session auth, Supabase Auth, Better Auth, and Clerk against this repo.

Reason:
The current phases prioritize schema, availability, and booking correctness first. Auth choice depends on deployment and operational constraints that do not block Phase 1.

Phase 0 default recommendation:
Likely choose custom session auth unless hosting/deployment constraints favor a managed provider.
