import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { hashPassword } from "../auth/password.ts";
import type {
    AuthRepository,
    AuthSessionRecord,
    AuthUserRecord,
} from "../auth/service.ts";
import { registerAdminApiRoutes } from "./api.ts";
import type {
    AdminBlockedTimeRecord,
    AdminScheduleRepository,
    AdminShiftOverrideRecord,
    AdminShiftRecord,
} from "./schedule-service.ts";

const now = new Date("2026-04-27T15:00:00.000Z");
const ownerId = "11111111-1111-1111-1111-111111111111";
const barberUserId = "22222222-2222-2222-2222-222222222222";
const barberA = "33333333-3333-3333-3333-333333333333";
const barberB = "44444444-4444-4444-4444-444444444444";
const locationA = "55555555-5555-5555-5555-555555555555";

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
});

afterEach(() => {
    vi.useRealTimers();
});

class InMemoryAuthRepository implements AuthRepository {
    users: AuthUserRecord[] = [];
    sessions: AuthSessionRecord[] = [];

    async findActiveUserByEmail(email: string) {
        return this.users.find((user) => user.email === email && user.active) ?? null;
    }

    async createSession(session: Omit<AuthSessionRecord, "id" | "revokedAt" | "lastSeenAt">) {
        const created = {
            id: `session-${this.sessions.length + 1}`,
            revokedAt: null,
            lastSeenAt: null,
            ...session,
        };
        this.sessions.push(created);
        return created;
    }

    async findSessionByTokenHash(tokenHash: string) {
        const session = this.sessions.find((candidate) => candidate.tokenHash === tokenHash);
        const user = session
            ? this.users.find((candidate) => candidate.id === session.userId && candidate.active)
            : undefined;
        return session && user ? { session, user } : null;
    }

    async revokeSession(tokenHash: string) {
        const session = this.sessions.find((candidate) => candidate.tokenHash === tokenHash);
        if (session) session.revokedAt = now;
    }

    async touchSession(sessionId: string, seenAt: Date) {
        const session = this.sessions.find((candidate) => candidate.id === sessionId);
        if (session) session.lastSeenAt = seenAt;
    }
}

class InMemoryScheduleRepository implements AdminScheduleRepository {
    shifts: AdminShiftRecord[] = [];
    shiftOverrides: AdminShiftOverrideRecord[] = [];
    blockedTimes: AdminBlockedTimeRecord[] = [];
    barbers = [
        { id: barberA, displayName: "Sam To", sortOrder: 10, locationIds: [locationA] },
        { id: barberB, displayName: "Laura Nguyen", sortOrder: 20, locationIds: [locationA] },
    ];
    locations = [{ id: locationA, name: "Leaside Fades Eglinton", sortOrder: 10 }];

    async listSchedule(scope: { barberId?: string }) {
        return {
            locations: this.locations,
            barbers: scope.barberId
                ? this.barbers.filter((barber) => barber.id === scope.barberId)
                : this.barbers,
            shifts: this.shifts.filter((shift) => !scope.barberId || shift.barberId === scope.barberId),
            shiftOverrides: this.shiftOverrides.filter(
                (override) => !scope.barberId || override.barberId === scope.barberId,
            ),
            blockedTimes: this.blockedTimes.filter((blockedTime) => {
                if (!scope.barberId) return true;
                return blockedTime.scope === "business" || blockedTime.barberId === scope.barberId;
            }),
        };
    }

    async findActiveBarber(barberId: string) {
        return this.barbers.find((barber) => barber.id === barberId) ?? null;
    }

    async findActiveLocation(locationId: string) {
        return this.locations.find((location) => location.id === locationId) ?? null;
    }

    async findShiftById(shiftId: string) {
        return this.shifts.find((shift) => shift.id === shiftId) ?? null;
    }

    async findShiftOverrideById(overrideId: string) {
        return this.shiftOverrides.find((override) => override.id === overrideId) ?? null;
    }

    async findBlockedTimeById(blockedTimeId: string) {
        return this.blockedTimes.find((blockedTime) => blockedTime.id === blockedTimeId) ?? null;
    }

    async hasOverlappingShift() {
        return false;
    }

    async hasConfirmedBookingOverlapForBlockedTime() {
        return false;
    }

    async createShift(input: Omit<AdminShiftRecord, "id">) {
        const created = { ...input, id: `shift-${this.shifts.length + 1}` };
        this.shifts.push(created);
        return created;
    }

    async updateShift(shiftId: string, input: Omit<AdminShiftRecord, "id">) {
        const index = this.shifts.findIndex((shift) => shift.id === shiftId);
        if (index < 0) return null;
        this.shifts[index] = { ...input, id: shiftId };
        return this.shifts[index];
    }

    async deactivateShift(shiftId: string) {
        const shift = this.shifts.find((candidate) => candidate.id === shiftId);
        if (!shift) return null;
        shift.active = false;
        return shift;
    }

    async createShiftOverride(input: Omit<AdminShiftOverrideRecord, "id">) {
        const created = { ...input, id: `override-${this.shiftOverrides.length + 1}` };
        this.shiftOverrides.push(created);
        return created;
    }

    async updateShiftOverride(overrideId: string, input: Omit<AdminShiftOverrideRecord, "id">) {
        const index = this.shiftOverrides.findIndex((override) => override.id === overrideId);
        if (index < 0) return null;
        this.shiftOverrides[index] = { ...input, id: overrideId };
        return this.shiftOverrides[index];
    }

    async deleteShiftOverride(overrideId: string) {
        const before = this.shiftOverrides.length;
        this.shiftOverrides = this.shiftOverrides.filter((override) => override.id !== overrideId);
        return this.shiftOverrides.length < before;
    }

    async createBlockedTime(input: Omit<AdminBlockedTimeRecord, "id">) {
        const created = { ...input, id: `blocked-${this.blockedTimes.length + 1}` };
        this.blockedTimes.push(created);
        return created;
    }

    async updateBlockedTime(blockedTimeId: string, input: Omit<AdminBlockedTimeRecord, "id">) {
        const index = this.blockedTimes.findIndex((blockedTime) => blockedTime.id === blockedTimeId);
        if (index < 0) return null;
        this.blockedTimes[index] = { ...input, id: blockedTimeId };
        return this.blockedTimes[index];
    }

    async deleteBlockedTime(blockedTimeId: string) {
        const before = this.blockedTimes.length;
        this.blockedTimes = this.blockedTimes.filter((blockedTime) => blockedTime.id !== blockedTimeId);
        return this.blockedTimes.length < before;
    }
}

async function createTestApp() {
    const authRepository = new InMemoryAuthRepository();
    const scheduleRepository = new InMemoryScheduleRepository();
    authRepository.users.push(
        {
            id: ownerId,
            email: "owner@example.com",
            displayName: "Owner User",
            role: "owner",
            barberId: null,
            active: true,
            passwordHash: await hashPassword("owner-password"),
        },
        {
            id: barberUserId,
            email: "barber@example.com",
            displayName: "Barber User",
            role: "barber",
            barberId: barberA,
            active: true,
            passwordHash: await hashPassword("barber-password"),
        },
    );

    const app = express();
    app.use(express.json());
    registerAdminApiRoutes(app, {
        authRepository,
        scheduleRepository,
        appUrl: "http://localhost:3000",
        now: () => now,
    });

    return { app, scheduleRepository };
}

describe("Phase 7 admin schedule API", () => {
    test("unauthenticated schedule routes are rejected", async () => {
        const { app } = await createTestApp();

        await request(app).get("/api/admin/schedule").expect(401);
        await request(app).post("/api/admin/schedule/shifts").send({}).expect(401);
        await request(app).post("/api/admin/schedule/blocked-times").send({}).expect(401);
    });

    test("owner creates and lists recurring shifts through authenticated routes", async () => {
        const { app } = await createTestApp();
        const agent = request.agent(app);

        await agent.post("/api/admin/auth/login").send({ email: "owner@example.com", password: "owner-password" }).expect(200);

        const createResponse = await agent
            .post("/api/admin/schedule/shifts")
            .send({
                barberId: barberA,
                locationId: locationA,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
            })
            .expect(201);

        expect(createResponse.body.shift).toMatchObject({ id: "shift-1", active: true });

        const listResponse = await agent.get("/api/admin/schedule").expect(200);
        expect(listResponse.body.shifts).toHaveLength(1);
        expect(listResponse.body.barbers).toHaveLength(2);
    });

    test("barber users can create own blocked time but cannot manage shifts, overrides, or closures", async () => {
        const { app } = await createTestApp();
        const agent = request.agent(app);

        await agent.post("/api/admin/auth/login").send({ email: "barber@example.com", password: "barber-password" }).expect(200);

        await agent
            .post("/api/admin/schedule/shifts")
            .send({
                barberId: barberA,
                locationId: locationA,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
            })
            .expect(403);
        await agent
            .post("/api/admin/schedule/shift-overrides")
            .send({
                barberId: barberA,
                locationId: locationA,
                overrideDate: "2026-05-04",
                overrideType: "add",
                startTime: "10:00",
                endTime: "12:00",
            })
            .expect(403);
        await agent
            .post("/api/admin/schedule/blocked-times")
            .send({
                scope: "location",
                locationId: locationA,
                startDate: "2026-05-04",
                startTime: "12:00",
                endDate: "2026-05-04",
                endTime: "13:00",
            })
            .expect(403);

        const blockedResponse = await agent
            .post("/api/admin/schedule/blocked-times")
            .send({
                scope: "barber",
                barberId: barberA,
                startDate: "2026-05-04",
                startTime: "12:00",
                endDate: "2026-05-04",
                endTime: "13:00",
            })
            .expect(201);

        expect(blockedResponse.body.blockedTime).toMatchObject({
            scope: "barber",
            barberId: barberA,
        });
    });

    test("schedule mutations use the admin Origin guard", async () => {
        const { app } = await createTestApp();
        const agent = request.agent(app);

        await agent.post("/api/admin/auth/login").send({ email: "owner@example.com", password: "owner-password" }).expect(200);

        await agent
            .post("/api/admin/schedule/blocked-times")
            .set("Origin", "https://evil.example")
            .send({
                scope: "business",
                startDate: "2026-05-04",
                startTime: "00:00",
                endDate: "2026-05-05",
                endTime: "00:00",
            })
            .expect(403)
            .expect({ message: "Admin request origin is not allowed." });
    });

    test("server.js exposes the authenticated schedule route", async () => {
        // @ts-expect-error server.js is the plain ESM entrypoint exercised by this route smoke test.
        const { default: app } = await import("../../../server.js");

        await request(app).get("/api/admin/schedule").expect(401);
    });
});
