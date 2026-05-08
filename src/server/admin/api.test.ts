import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { hashPassword } from "../auth/password.ts";
import type {
    PasswordResetDelivery,
    PasswordResetRepository,
    PasswordResetTokenRecord,
} from "../auth/password-reset-service.ts";
import type {
    AuthRepository,
    AuthSessionRecord,
    AuthUserRecord,
} from "../auth/service.ts";
import type {
    AdminBookingRecord,
    AdminBookingManagementRepository,
    AdminBookingsRepository,
    AdminCalendarOptionsRepository,
    AdminDashboardActivityRecord,
} from "./bookings-service.ts";
import type { AvailabilityData } from "../availability/index.ts";
import type {
    BookingRepository,
    BookingServiceSnapshot,
    CreateBookingRequest,
    CreatedBooking,
} from "../bookings/index.ts";
import { registerAdminApiRoutes } from "./api.ts";
import type {
    TeamInviteDelivery,
    TeamOnboardingRepository,
    TeamBarberRecord,
    TeamUserRecord,
    UserInviteTokenRecord,
} from "./team-service.ts";

const ownerId = "11111111-1111-1111-1111-111111111111";
const eglintonId = "33333333-3333-3333-3333-333333333333";
const millwoodId = "44444444-4444-4444-4444-444444444444";
const now = new Date("2026-04-27T15:00:00.000Z");
const serviceId = "55555555-5555-5555-5555-555555555555";

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
});

afterEach(() => {
    vi.useRealTimers();
});

class InMemoryAuthRepository implements AuthRepository, PasswordResetRepository, TeamOnboardingRepository {
    users: AuthUserRecord[] = [];
    sessions: AuthSessionRecord[] = [];
    resetTokens: PasswordResetTokenRecord[] = [];
    barbers: TeamBarberRecord[] = [];
    inviteTokens: UserInviteTokenRecord[] = [];
    activeLocationIds = [eglintonId, millwoodId];

    async findActiveUserByEmail(email: string) {
        return this.users.find((user) => user.email === email && user.active) ?? null;
    }

    async createSession(session: Omit<AuthSessionRecord, "id" | "revokedAt" | "lastSeenAt">) {
        const created: AuthSessionRecord = {
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

        if (session) {
            session.revokedAt = now;
        }
    }

    async touchSession(sessionId: string, seenAt: Date, expiresAt?: Date) {
        const session = this.sessions.find((candidate) => candidate.id === sessionId);

        if (session) {
            session.lastSeenAt = seenAt;
            if (expiresAt) {
                session.expiresAt = expiresAt;
            }
        }
    }

    async createPasswordResetToken(token: Omit<PasswordResetTokenRecord, "id" | "usedAt">) {
        const created: PasswordResetTokenRecord = {
            id: `reset-token-${this.resetTokens.length + 1}`,
            usedAt: null,
            ...token,
        };
        this.resetTokens.push(created);
        return created;
    }

    async findPasswordResetTokenByHash(tokenHash: string) {
        const token = this.resetTokens.find((candidate) => candidate.tokenHash === tokenHash);
        const user = token
            ? this.users.find((candidate) => candidate.id === token.userId && candidate.active)
            : undefined;

        return token && user ? { token, user } : null;
    }

    async completePasswordReset(input: {
        tokenId: string;
        userId: string;
        passwordHash: string;
        usedAt: Date;
    }) {
        const token = this.resetTokens.find((candidate) => candidate.id === input.tokenId);
        const user = this.users.find((candidate) => candidate.id === input.userId);

        if (token) {
            token.usedAt = input.usedAt;
        }

        if (user) {
            user.passwordHash = input.passwordHash;
        }

        for (const session of this.sessions) {
            if (session.userId === input.userId && !session.revokedAt) {
                session.revokedAt = input.usedAt;
            }
        }
    }

    async findActiveLocationIds(locationIds: string[]) {
        return locationIds.filter((id) => this.activeLocationIds.includes(id));
    }

    async createBarberWithInvite(input: {
        barber: {
            slug: string;
            displayName: string;
            email: string;
            phoneE164: string | null;
            locationIds: string[];
        };
        user: {
            email: string;
            displayName: string;
        };
        invite: {
            tokenHash: string;
            expiresAt: Date;
            createdByUserId: string;
        };
    }) {
        const barber: TeamBarberRecord = {
            id: `barber-${this.barbers.length + 1}`,
            slug: input.barber.slug,
            displayName: input.barber.displayName,
            email: input.barber.email,
            phoneE164: input.barber.phoneE164,
            active: true,
            locationIds: input.barber.locationIds,
        };
        const user: TeamUserRecord = {
            id: `team-user-${this.users.length + 1}`,
            email: input.user.email,
            displayName: input.user.displayName,
            role: "barber",
            barberId: barber.id,
            active: false,
            passwordHash: null,
        };
        const inviteToken: UserInviteTokenRecord = {
            id: `invite-token-${this.inviteTokens.length + 1}`,
            userId: user.id,
            tokenHash: input.invite.tokenHash,
            expiresAt: input.invite.expiresAt,
            usedAt: null,
            createdByUserId: input.invite.createdByUserId,
        };

        this.barbers.push(barber);
        this.users.push(user);
        this.inviteTokens.push(inviteToken);

        return { barber, user, inviteToken };
    }

    async findInviteByTokenHash(tokenHash: string) {
        const inviteToken = this.inviteTokens.find((candidate) => candidate.tokenHash === tokenHash);
        const user = inviteToken
            ? this.users.find((candidate) => candidate.id === inviteToken.userId)
            : undefined;

        return inviteToken && user ? { inviteToken, user } : null;
    }

    async acceptInvite(input: {
        inviteTokenId: string;
        userId: string;
        passwordHash: string;
        acceptedAt: Date;
    }) {
        const inviteToken = this.inviteTokens.find((candidate) => candidate.id === input.inviteTokenId);
        const user = this.users.find((candidate) => candidate.id === input.userId);

        if (inviteToken) {
            inviteToken.usedAt = input.acceptedAt;
        }

        if (user) {
            user.active = true;
            user.passwordHash = input.passwordHash;
        }
    }

    async deactivateBarberAndLinkedUsers(input: { barberId: string; deactivatedAt: Date }) {
        const barber = this.barbers.find((candidate) => candidate.id === input.barberId);
        const deactivatedUserIds: string[] = [];

        if (barber) {
            barber.active = false;
        }

        for (const user of this.users) {
            if (user.barberId === input.barberId) {
                user.active = false;
                deactivatedUserIds.push(user.id);
            }
        }

        for (const session of this.sessions) {
            if (deactivatedUserIds.includes(session.userId) && !session.revokedAt) {
                session.revokedAt = input.deactivatedAt;
            }
        }

        return { barberId: input.barberId, deactivatedUserIds };
    }
}

class InMemoryPasswordResetDelivery implements PasswordResetDelivery {
    deliveries: Array<{ email: string; resetUrl: string; expiresAt: Date }> = [];

    async sendPasswordResetLink(input: {
        email: string;
        resetUrl: string;
        expiresAt: Date;
    }) {
        this.deliveries.push(input);
    }
}

class InMemoryTeamInviteDelivery implements TeamInviteDelivery {
    deliveries: Array<{ email: string; inviteUrl: string; expiresAt: Date }> = [];

    async sendBarberInvite(input: {
        email: string;
        inviteUrl: string;
        expiresAt: Date;
    }) {
        this.deliveries.push(input);
    }
}

const serviceSnapshot: BookingServiceSnapshot = {
    serviceId,
    serviceName: "Men's Cut",
    categoryName: "Hair & Styling (Men)",
    durationMinutes: 30,
    priceCents: 3000,
    priceType: "fixed",
    displayPrice: "$30",
    sortOrder: 10,
};

function baseAvailability(overrides: Partial<AvailabilityData> = {}): AvailabilityData {
    return {
        businessHours: [
            {
                locationId: eglintonId,
                dayOfWeek: 1,
                openTime: "10:00",
                closeTime: "19:00",
            },
        ],
        barbers: [
            { id: "barber-a", active: true, sortOrder: 1 },
            { id: "barber-b", active: true, sortOrder: 2 },
        ],
        barberLocations: [
            { barberId: "barber-a", locationId: eglintonId },
            { barberId: "barber-b", locationId: eglintonId },
        ],
        services: [{ id: serviceId, durationMinutes: 30, active: true }],
        shifts: [
            {
                barberId: "barber-a",
                locationId: eglintonId,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
                active: true,
            },
            {
                barberId: "barber-b",
                locationId: eglintonId,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
                active: true,
            },
        ],
        shiftOverrides: [],
        bookings: [],
        blockedTimes: [],
        ...overrides,
    };
}

class InMemoryAdminBookingsRepository
    implements AdminBookingsRepository, AdminCalendarOptionsRepository, AdminBookingManagementRepository, BookingRepository
{
    bookings: AdminBookingRecord[] = [
        {
            id: "booking-a",
            barberId: "barber-a",
            barberName: "Sam To",
            locationId: eglintonId,
            locationName: "Leaside Fades Eglinton",
            customerName: "Ada Lovelace",
            customerEmail: "ada@example.com",
            customerPhone: "+16475550199",
            status: "confirmed",
            source: "public",
            startTime: new Date("2026-04-27T16:00:00.000Z"),
            endTime: new Date("2026-04-27T16:30:00.000Z"),
            totalDurationMinutes: 30,
            services: ["Men's Cut"],
        },
        {
            id: "booking-b",
            barberId: "barber-b",
            barberName: "Laura Nguyen",
            locationId: millwoodId,
            locationName: "Leaside Fades Millwood",
            customerName: "Other Customer",
            customerEmail: "other@example.com",
            customerPhone: "+16475550222",
            status: "confirmed",
            source: "public",
            startTime: new Date("2026-04-27T17:00:00.000Z"),
            endTime: new Date("2026-04-27T17:30:00.000Z"),
            totalDurationMinutes: 30,
            services: ["Men's Cut"],
        },
    ];
    customers: CreateBookingRequest["customer"][] = [];
    bookingServices: Array<BookingServiceSnapshot & { bookingId: string }> = [];
    availabilityData = baseAvailability();
    activityRecords: AdminDashboardActivityRecord[] | null = null;

    async listBookingsForAdminScope(scope: any) {
        const bookings = this.bookings.filter((booking) => {
            const startsAfterFrom = !scope.from || booking.startTime >= scope.from;
            const startsBeforeTo = !scope.to || booking.startTime < scope.to;
            return (
                (!scope.barberId || booking.barberId === scope.barberId) &&
                (!scope.locationId || booking.locationId === scope.locationId) &&
                (!scope.status || booking.status === scope.status) &&
                startsAfterFrom &&
                startsBeforeTo
            );
        });

        return bookings.slice(0, scope.limit);
    }

    async listDashboardBookingsForAdminScope(scope: any) {
        return this.listBookingsForAdminScope(scope);
    }

    async listDashboardActivityForAdminScope(scope: any): Promise<AdminDashboardActivityRecord[]> {
        if (this.activityRecords) {
            return this.activityRecords
                .filter((activity) => !scope.barberId || activity.barberId === scope.barberId)
                .slice(0, scope.limit);
        }

        return this.bookings
            .filter((booking) => !scope.barberId || booking.barberId === scope.barberId)
            .slice(0, scope.limit)
            .map((booking) => ({
                id: `${booking.id}:activity`,
                bookingId: booking.id,
                eventType: booking.status === "no_show" ? "no_show" : "booking_confirmation",
                status: booking.status === "no_show" ? "no_show" : "sent",
                channel: booking.status === "no_show" ? "calendar" : "sms",
                recipientType: booking.status === "no_show" ? "shop" : "customer",
                recipientLabel: booking.status === "no_show" ? "Calendar" : "Customer SMS ***0199",
                customerName: booking.customerName,
                barberId: booking.barberId,
                barberName: booking.barberName,
                locationName: booking.locationName,
                appointmentStatus: booking.status,
                appointmentSource: booking.source,
                appointmentStartTime: booking.startTime,
                appointmentEndTime: booking.endTime,
                services: booking.services,
                createdAt: booking.startTime,
                updatedAt: booking.endTime,
                sentAt: booking.status === "no_show" ? null : booking.startTime,
                scheduledFor: null,
                errorMessage: null,
                provider: booking.status === "no_show" ? null : "mock",
                providerMessageId: booking.status === "no_show" ? null : `${booking.id}:provider`,
                attemptCount: booking.status === "no_show" ? 0 : 1,
                lastAttemptAt: booking.status === "no_show" ? null : booking.startTime,
            }));
    }

    async getBookingByIdForAdminScope(scope: { bookingId: string; barberId?: string }) {
        const booking = this.bookings.find(
            (candidate) =>
                candidate.id === scope.bookingId &&
                (!scope.barberId || candidate.barberId === scope.barberId),
        );

        return booking
            ? {
                  ...booking,
                  serviceIds: [serviceId],
                  serviceDetails: [serviceSnapshot],
                  customerNotes: null,
                  internalNotes: null,
              }
            : null;
    }

    async listCalendarOptions(scope: { barberId?: string }) {
        return {
            locations: [
                { id: eglintonId, name: "Leaside Fades Eglinton", sortOrder: 10 },
                { id: millwoodId, name: "Leaside Fades Millwood", sortOrder: 20 },
            ],
            barbers: [
                { id: "barber-a", displayName: "Sam To", locationIds: [eglintonId], sortOrder: 10 },
                { id: "barber-b", displayName: "Laura Nguyen", locationIds: [millwoodId], sortOrder: 20 },
            ].filter((barber) => !scope.barberId || barber.id === scope.barberId),
            services: [
                {
                    id: serviceId,
                    name: "Men's Cut",
                    durationMinutes: 30,
                    displayPrice: "$30",
                    priceCents: 3000,
                    priceType: "fixed" as const,
                    sortOrder: 10,
                },
            ],
        };
    }

    async withTransaction<T>(callback: (transaction: BookingRepository) => Promise<T>): Promise<T> {
        return callback(this);
    }

    async loadAvailabilityData(request: CreateBookingRequest) {
        return {
            ...this.availabilityData,
            bookings: (this.availabilityData.bookings ?? []).filter(
                (booking: any) => !(request.excludeBookingId && booking.id === request.excludeBookingId),
            ),
        };
    }

    async loadServiceSnapshots(serviceIds: string[]) {
        return serviceIds.map(() => serviceSnapshot);
    }

    async countConfirmedBookingsByBarber() {
        return {};
    }

    async hasConfirmedBookingOverlap(barberId: string, startTime: Date, endTime: Date, excludeBookingId?: string) {
        return this.bookings.some(
            (booking) =>
                booking.id !== excludeBookingId &&
                booking.barberId === barberId &&
                booking.status === "confirmed" &&
                startTime < booking.endTime &&
                endTime > booking.startTime,
        );
    }

    async hasBlockedTimeOverlap() {
        return false;
    }

    async createCustomer(customer: CreateBookingRequest["customer"]) {
        this.customers.push(customer);
        return { id: `customer-${this.customers.length}` };
    }

    async insertBooking(input: any): Promise<CreatedBooking> {
        const customer = this.customers[this.customers.length - 1];
        const created = {
            id: `manual-${this.bookings.length + 1}`,
            barberName: input.barberId === "barber-a" ? "Sam To" : "Laura Nguyen",
            locationName: "Leaside Fades Eglinton",
            customerName: `${customer?.firstName} ${customer?.lastName}`,
            customerEmail: customer?.email ?? "",
            customerPhone: customer?.phoneE164 ?? "",
            services: ["Men's Cut"],
            ...input,
        };
        this.bookings.push(created);
        return created;
    }

    async insertBookingServices(bookingId: string, snapshots: BookingServiceSnapshot[]) {
        this.bookingServices.push(...snapshots.map((snapshot) => ({ ...snapshot, bookingId })));
    }

    async cancelBookingForAdminScope(input: { bookingId: string; barberId?: string }) {
        const booking = this.bookings.find(
            (candidate) =>
                candidate.id === input.bookingId &&
                (!input.barberId || candidate.barberId === input.barberId),
        );
        if (!booking) return null;
        if (booking.status === "completed" || booking.status === "no_show") {
            return { ...booking, mutable: false as const };
        }
        booking.status = "cancelled";
        return { ...booking, mutable: true as const };
    }

    async markBookingNoShowForAdminScope(input: { bookingId: string; barberId?: string; markedAt: Date }) {
        const booking = this.bookings.find(
            (candidate) =>
                candidate.id === input.bookingId &&
                (!input.barberId || candidate.barberId === input.barberId),
        );
        if (!booking) return null;
        if (booking.status !== "confirmed" || booking.startTime > input.markedAt) {
            return { ...booking, mutable: false as const };
        }
        booking.status = "no_show";
        return { ...booking, mutable: true as const };
    }

    async updateBookingScheduleForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        nextBarberId: string;
        locationId: string;
        startTime: Date;
        endTime: Date;
        totalDurationMinutes: number;
    }) {
        const booking = this.bookings.find(
            (candidate) =>
                candidate.id === input.bookingId &&
                (!input.barberId || candidate.barberId === input.barberId),
        );
        if (!booking) return null;
        booking.barberId = input.nextBarberId;
        booking.locationId = input.locationId;
        booking.startTime = input.startTime;
        booking.endTime = input.endTime;
        booking.totalDurationMinutes = input.totalDurationMinutes;
        return booking;
    }
}

function dashboardActivityFixture(
    overrides: Partial<AdminDashboardActivityRecord> = {},
): AdminDashboardActivityRecord {
    return {
        id: "activity-fixture",
        bookingId: "booking-fixture",
        eventType: "booking_confirmation",
        status: "sent",
        channel: "email",
        recipientType: "customer",
        recipientLabel: "Customer Email a***@example.com",
        customerName: "Ada Lovelace",
        barberId: "barber-a",
        barberName: "Sam To",
        locationName: "Leaside Fades Eglinton",
        appointmentStatus: "confirmed",
        appointmentSource: "public",
        appointmentStartTime: new Date("2026-05-03T19:00:00.000Z"),
        appointmentEndTime: new Date("2026-05-03T19:30:00.000Z"),
        services: ["Men's Cut"],
        createdAt: new Date("2026-05-03T13:55:00.000Z"),
        updatedAt: new Date("2026-05-03T13:55:00.000Z"),
        sentAt: null,
        scheduledFor: null,
        errorMessage: null,
        provider: "mock",
        providerMessageId: null,
        attemptCount: 1,
        lastAttemptAt: new Date("2026-05-03T13:55:00.000Z"),
        ...overrides,
    };
}

async function createTestApp(options: { now?: () => Date } = {}) {
    const authRepository = new InMemoryAuthRepository();
    const passwordResetDelivery = new InMemoryPasswordResetDelivery();
    const teamInviteDelivery = new InMemoryTeamInviteDelivery();
    const bookingsRepository = new InMemoryAdminBookingsRepository();
    authRepository.users.push({
        id: ownerId,
        email: "owner@example.com",
        displayName: "Owner User",
        role: "owner",
        barberId: null,
        active: true,
        passwordHash: await hashPassword("correct-password"),
    });

    const app = express();
    app.use(express.json());
    registerAdminApiRoutes(app, {
        authRepository,
        bookingsRepository,
        passwordResetRepository: authRepository,
        passwordResetDelivery,
        teamRepository: authRepository,
        teamInviteDelivery,
        appUrl: "http://localhost:3000",
        now: options.now ?? (() => now),
    });

    return { app, authRepository, passwordResetDelivery, teamInviteDelivery, bookingsRepository };
}

function cookieExpiryIso(setCookie: string | undefined) {
    const expires = setCookie?.match(/Expires=([^;]+)/)?.[1];
    return expires ? new Date(expires).toISOString() : "";
}

function tokenFromResetUrl(resetUrl: string) {
    return new URL(resetUrl).searchParams.get("token") ?? "";
}

function tokenFromInviteUrl(inviteUrl: string) {
    return new URL(inviteUrl).searchParams.get("token") ?? "";
}

describe("Phase 5A admin API", () => {
    test("unauthenticated protected booking requests are rejected", async () => {
        const { app } = await createTestApp();

        await request(app)
            .get("/api/admin/bookings")
            .expect(401)
            .expect({ message: "Authentication required." });
    });

    test("login sets an HTTP-only SameSite=Lax cookie and session-check returns the safe user", async () => {
        const { app } = await createTestApp();
        const agent = request.agent(app);

        const loginResponse = await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        expect(loginResponse.body).toEqual({
            user: {
                id: ownerId,
                email: "owner@example.com",
                displayName: "Owner User",
                role: "owner",
                barberId: null,
            },
        });
        expect(loginResponse.headers["set-cookie"][0]).toContain("lf_admin_session=");
        expect(loginResponse.headers["set-cookie"][0]).toContain("HttpOnly");
        expect(loginResponse.headers["set-cookie"][0]).toContain("SameSite=Lax");

        const sessionResponse = await agent.get("/api/admin/auth/session").expect(200);
        expect(sessionResponse.body.user.email).toBe("owner@example.com");
        expect(sessionResponse.body.user.passwordHash).toBeUndefined();
    });

    test("protected admin activity renews the session cookie and stored expiry", async () => {
        let currentNow = now;
        const { app, authRepository } = await createTestApp({ now: () => currentNow });
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        currentNow = new Date("2026-05-20T15:00:00.000Z");
        const bookingsResponse = await agent.get("/api/admin/bookings").expect(200);

        expect(cookieExpiryIso(bookingsResponse.headers["set-cookie"]?.[0])).toBe("2026-06-19T15:00:00.000Z");
        expect(authRepository.sessions[0].lastSeenAt?.toISOString()).toBe("2026-05-20T15:00:00.000Z");
        expect(authRepository.sessions[0].expiresAt.toISOString()).toBe("2026-06-19T15:00:00.000Z");
    });

    test("login marks the admin session cookie Secure in production", async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        const { app } = await createTestApp();

        try {
            const loginResponse = await request(app)
                .post("/api/admin/auth/login")
                .send({ email: "owner@example.com", password: "correct-password" })
                .expect(200);

            expect(loginResponse.headers["set-cookie"][0]).toContain("Secure");
        } finally {
            process.env.NODE_ENV = originalNodeEnv;
        }
    });

    test("invalid login fails generically", async () => {
        const { app } = await createTestApp();

        await request(app)
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "wrong-password" })
            .expect(401)
            .expect({ message: "Invalid email or password." });
    });

    test("logout clears the cookie and revokes the session", async () => {
        const { app, authRepository } = await createTestApp();
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        const logoutResponse = await agent.post("/api/admin/auth/logout").expect(204);
        expect(logoutResponse.headers["set-cookie"][0]).toContain("lf_admin_session=;");
        expect(authRepository.sessions[0].revokedAt).toBeInstanceOf(Date);

        await agent.get("/api/admin/auth/session").expect(401);
    });

    test("forgot-password returns a generic response without delivering for unknown email", async () => {
        const { app, passwordResetDelivery } = await createTestApp();

        await request(app)
            .post("/api/admin/auth/forgot-password")
            .send({ email: "missing@example.com" })
            .expect(200)
            .expect({
                message: "If that email can reset a password, a reset link has been sent.",
            });

        expect(passwordResetDelivery.deliveries).toHaveLength(0);
    });

    test("reset-password sets a new password and revokes existing sessions", async () => {
        const { app, authRepository, passwordResetDelivery } = await createTestApp();
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        await request(app)
            .post("/api/admin/auth/forgot-password")
            .send({ email: "owner@example.com" })
            .expect(200);
        const resetToken = tokenFromResetUrl(passwordResetDelivery.deliveries[0].resetUrl);

        await request(app)
            .post("/api/admin/auth/reset-password")
            .send({ token: resetToken, password: "new-password" })
            .expect(204);

        expect(authRepository.resetTokens[0].usedAt).toEqual(now);
        expect(authRepository.sessions[0].revokedAt).toEqual(now);
        await agent.get("/api/admin/auth/session").expect(401);

        await request(app)
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(401);
        await request(app)
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "new-password" })
            .expect(200);
    });

    test("reset-password rejects invalid and single-use tokens", async () => {
        const { app, passwordResetDelivery } = await createTestApp();

        await request(app)
            .post("/api/admin/auth/reset-password")
            .send({ token: "not-a-real-token", password: "new-password" })
            .expect(400)
            .expect({ message: "Password reset link is invalid or expired." });

        await request(app)
            .post("/api/admin/auth/forgot-password")
            .send({ email: "owner@example.com" })
            .expect(200);
        const resetToken = tokenFromResetUrl(passwordResetDelivery.deliveries[0].resetUrl);

        await request(app)
            .post("/api/admin/auth/reset-password")
            .send({ token: resetToken, password: "new-password" })
            .expect(204);
        await request(app)
            .post("/api/admin/auth/reset-password")
            .send({ token: resetToken, password: "another-password" })
            .expect(400)
            .expect({ message: "Password reset link is invalid or expired." });
    });
});

describe("Phase 5C admin team onboarding API", () => {
    test("unauthenticated barber creation is rejected", async () => {
        const { app } = await createTestApp();

        await request(app)
            .post("/api/admin/team/barbers")
            .send({
                displayName: "New Barber",
                email: "new@example.com",
                locationIds: [eglintonId],
            })
            .expect(401)
            .expect({ message: "Authentication required." });
    });

    test("owner creates and invites a linked barber user", async () => {
        const { app, authRepository, teamInviteDelivery } = await createTestApp();
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        const response = await agent
            .post("/api/admin/team/barbers")
            .send({
                displayName: "New Barber",
                email: "new@example.com",
                phoneE164: "+16475550123",
                locationIds: [eglintonId, millwoodId],
            })
            .expect(201);

        expect(response.body.barber).toMatchObject({
            id: "barber-1",
            displayName: "New Barber",
            email: "new@example.com",
            active: true,
            locationIds: [eglintonId, millwoodId],
        });
        expect(response.body.user).toEqual({
            id: "team-user-2",
            email: "new@example.com",
            displayName: "New Barber",
            role: "barber",
            barberId: "barber-1",
            active: false,
        });
        expect(response.body.inviteToken).toBeUndefined();
        expect(authRepository.users.find((user) => user.email === "new@example.com")).toMatchObject({
            role: "barber",
            barberId: "barber-1",
            active: false,
            passwordHash: null,
        });
        expect(teamInviteDelivery.deliveries).toHaveLength(1);
        expect(teamInviteDelivery.deliveries[0].inviteUrl).toContain("/admin/accept-invite?token=");
    });

    test("barber users cannot create other barber accounts", async () => {
        const { app, authRepository } = await createTestApp();
        authRepository.users.push({
            id: "barber-user",
            email: "barber@example.com",
            displayName: "Barber User",
            role: "barber",
            barberId: "barber-existing",
            active: true,
            passwordHash: await hashPassword("barber-password"),
        });
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "barber@example.com", password: "barber-password" })
            .expect(200);
        await agent
            .post("/api/admin/team/barbers")
            .send({
                displayName: "Blocked Barber",
                email: "blocked@example.com",
                locationIds: [eglintonId],
            })
            .expect(403)
            .expect({ message: "Owner or admin access is required." });
    });

    test("accepted invite lets the barber log in and see only their own bookings", async () => {
        const { app, teamInviteDelivery, bookingsRepository } = await createTestApp();
        const ownerAgent = request.agent(app);

        await ownerAgent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);
        const createResponse = await ownerAgent
            .post("/api/admin/team/barbers")
            .send({
                displayName: "Own Scope Barber",
                email: "own-scope@example.com",
                locationIds: [eglintonId],
            })
            .expect(201);
        const inviteToken = tokenFromInviteUrl(teamInviteDelivery.deliveries[0].inviteUrl);
        bookingsRepository.bookings = [
            {
                id: "own-booking",
                barberId: createResponse.body.barber.id,
                barberName: "Own Scope Barber",
                locationId: "location-a",
                locationName: "Leaside Fades Eglinton",
                customerName: "Own Customer",
                customerEmail: "own@example.com",
                customerPhone: "+16475550111",
                status: "confirmed",
                source: "public",
                startTime: new Date("2026-04-27T16:00:00.000Z"),
                endTime: new Date("2026-04-27T16:30:00.000Z"),
                totalDurationMinutes: 30,
                services: ["Men's Cut"],
            },
            {
                id: "other-booking",
                barberId: "another-barber",
                barberName: "Another Barber",
                locationId: "location-a",
                locationName: "Leaside Fades Eglinton",
                customerName: "Other Customer",
                customerEmail: "other@example.com",
                customerPhone: "+16475550222",
                status: "confirmed",
                source: "public",
                startTime: new Date("2026-04-27T17:00:00.000Z"),
                endTime: new Date("2026-04-27T17:30:00.000Z"),
                totalDurationMinutes: 30,
                services: ["Men's Cut"],
            },
        ];

        await request(app)
            .post("/api/admin/auth/accept-invite")
            .send({ token: inviteToken, password: "setup-password" })
            .expect(204);

        const barberAgent = request.agent(app);
        await barberAgent
            .post("/api/admin/auth/login")
            .send({ email: "own-scope@example.com", password: "setup-password" })
            .expect(200);
        const bookingsResponse = await barberAgent.get("/api/admin/bookings").expect(200);

        expect(bookingsResponse.body.bookings.map((booking: { id: string }) => booking.id)).toEqual([
            "own-booking",
        ]);
    });

    test("invite tokens are single-use and expired invites are rejected", async () => {
        const { app, teamInviteDelivery } = await createTestApp();
        const ownerAgent = request.agent(app);

        await ownerAgent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);
        await ownerAgent
            .post("/api/admin/team/barbers")
            .send({
                displayName: "Invite Barber",
                email: "invite@example.com",
                locationIds: [eglintonId],
            })
            .expect(201);
        const inviteToken = tokenFromInviteUrl(teamInviteDelivery.deliveries[0].inviteUrl);

        await request(app)
            .post("/api/admin/auth/accept-invite")
            .send({ token: "invalid-token", password: "setup-password" })
            .expect(400)
            .expect({ message: "Invite link is invalid or expired." });
        await request(app)
            .post("/api/admin/auth/accept-invite")
            .send({ token: inviteToken, password: "setup-password" })
            .expect(204);
        await request(app)
            .post("/api/admin/auth/accept-invite")
            .send({ token: inviteToken, password: "another-password" })
            .expect(400)
            .expect({ message: "Invite link is invalid or expired." });
    });

    test("deactivated barber user cannot access admin endpoints", async () => {
        const { app, teamInviteDelivery } = await createTestApp();
        const ownerAgent = request.agent(app);

        await ownerAgent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);
        const createResponse = await ownerAgent
            .post("/api/admin/team/barbers")
            .send({
                displayName: "Deactivate Barber",
                email: "deactivate@example.com",
                locationIds: [eglintonId],
            })
            .expect(201);
        const inviteToken = tokenFromInviteUrl(teamInviteDelivery.deliveries[0].inviteUrl);
        await request(app)
            .post("/api/admin/auth/accept-invite")
            .send({ token: inviteToken, password: "setup-password" })
            .expect(204);

        const barberAgent = request.agent(app);
        await barberAgent
            .post("/api/admin/auth/login")
            .send({ email: "deactivate@example.com", password: "setup-password" })
            .expect(200);

        await ownerAgent
            .post(`/api/admin/team/barbers/${createResponse.body.barber.id}/deactivate`)
            .expect(200)
            .expect({
                barberId: createResponse.body.barber.id,
                deactivatedUserIds: [createResponse.body.user.id],
            });

        await barberAgent.get("/api/admin/auth/session").expect(401);
        await barberAgent.get("/api/admin/bookings").expect(401);
    });
});

describe("Phase 6 admin mutation Origin guard", () => {
    test("admin mutations reject invalid Origin headers", async () => {
        const { app } = await createTestApp();
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        await agent
            .post("/api/admin/bookings")
            .set("Origin", "https://evil.example")
            .send({
                locationId: eglintonId,
                serviceIds: [serviceId],
                barberId: "barber-a",
                startTime: "2026-05-04T16:00:00.000Z",
                customer: {
                    firstName: "Manual",
                    lastName: "Customer",
                    phone: "+16475550123",
                    email: "manual@example.com",
                },
            })
            .expect(403)
            .expect({ message: "Admin request origin is not allowed." });
    });

    test("admin mutations reject invalid Referer headers when Origin is absent", async () => {
        const { app } = await createTestApp();
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        await agent
            .post("/api/admin/bookings/booking-a/cancel")
            .set("Referer", "https://evil.example/admin/calendar")
            .expect(403)
            .expect({ message: "Admin request origin is not allowed." });
    });

    test.each([
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ])("admin mutations allow configured/local Origin %s", async (origin) => {
        const { app } = await createTestApp();

        await request(app)
            .post("/api/admin/auth/login")
            .set("Origin", origin)
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);
    });

    test("admin GET reads are not rejected by the mutation Origin guard", async () => {
        const { app } = await createTestApp();
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        await agent
            .get("/api/admin/bookings")
            .set("Origin", "https://evil.example")
            .expect(200);
    });
});

describe("Phase 6 admin calendar and booking management API", () => {
    test("owner can read filtered bookings, booking detail, and calendar options", async () => {
        const { app } = await createTestApp();
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        const listResponse = await agent
            .get(
                `/api/admin/bookings?from=2026-04-27&to=2026-04-27&locationId=${eglintonId}&barberId=barber-a&status=confirmed`,
            )
            .expect(200);
        expect(listResponse.body.bookings.map((booking: { id: string }) => booking.id)).toEqual([
            "booking-a",
        ]);

        const detailResponse = await agent.get("/api/admin/bookings/booking-a").expect(200);
        expect(detailResponse.body.booking).toMatchObject({
            id: "booking-a",
            customerEmail: "ada@example.com",
            serviceDetails: [serviceSnapshot],
        });

        const optionsResponse = await agent.get("/api/admin/calendar/options").expect(200);
        expect(optionsResponse.body.locations).toHaveLength(2);
        expect(optionsResponse.body.barbers).toHaveLength(2);
        expect(optionsResponse.body.services.map((service: { id: string }) => service.id)).toEqual([
            serviceId,
        ]);
    });

    test("owner dashboard returns appointments and safe notification-center activity", async () => {
        const { app } = await createTestApp();
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        const response = await agent.get("/api/admin/dashboard").expect(200);

        expect(response.body.todayBookings.map((booking: { id: string }) => booking.id)).toEqual([
            "booking-a",
            "booking-b",
        ]);
        expect(response.body.activity[0]).toMatchObject({
            bookingId: "booking-a",
            eventType: "booking_confirmation",
            recipientLabel: "Customer SMS ***0199",
        });
        expect(JSON.stringify(response.body.activity)).not.toContain("token");
        expect(JSON.stringify(response.body.activity)).not.toContain("cancelUrl");
        expect(JSON.stringify(response.body.activity)).not.toContain("rescheduleUrl");
    });

    test("owner dashboard serializes active and historical notification failure metadata", async () => {
        const { app, bookingsRepository } = await createTestApp();
        bookingsRepository.activityRecords = [
            dashboardActivityFixture({
                id: "active-resend-failure",
                bookingId: "booking-a",
                status: "failed",
                eventType: "booking_confirmation",
                channel: "email",
                provider: "resend",
                errorMessage:
                    "The leasidefades.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
                appointmentStartTime: new Date("2026-05-03T19:00:00.000Z"),
                appointmentEndTime: new Date("2026-05-03T19:30:00.000Z"),
            }),
            dashboardActivityFixture({
                id: "historical-resend-failure",
                bookingId: "booking-b",
                status: "failed",
                eventType: "reminder_2h",
                channel: "email",
                provider: "resend",
                errorMessage:
                    "The leasidefades.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
                appointmentStartTime: new Date("2026-04-26T19:00:00.000Z"),
                appointmentEndTime: new Date("2026-04-26T19:30:00.000Z"),
            }),
        ];
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        const response = await agent.get("/api/admin/dashboard").expect(200);

        expect(response.body.activity).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "active-resend-failure",
                    isActiveFailure: true,
                    failureCategory: "provider_config",
                    failureSummary: "Email provider configuration issue",
                }),
                expect.objectContaining({
                    id: "historical-resend-failure",
                    isActiveFailure: false,
                    failureCategory: "provider_config",
                    failureSummary: "Email provider configuration issue",
                }),
            ]),
        );
    });

    test("barber cannot read or mutate another barber's bookings through Phase 6 routes", async () => {
        const { app, authRepository } = await createTestApp();
        authRepository.users.push({
            id: "barber-user",
            email: "barber@example.com",
            displayName: "Barber User",
            role: "barber",
            barberId: "barber-a",
            active: true,
            passwordHash: await hashPassword("barber-password"),
        });
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "barber@example.com", password: "barber-password" })
            .expect(200);

        await agent.get("/api/admin/bookings/booking-b").expect(404);
        await agent
            .post("/api/admin/bookings")
            .send({
                locationId: eglintonId,
                serviceIds: [serviceId],
                barberId: "barber-b",
                startTime: "2026-05-04T14:00:00.000Z",
                customer: {
                    firstName: "Manual",
                    lastName: "Customer",
                    phone: "+16475550123",
                    email: "manual@example.com",
                },
            })
            .expect(403);
        await agent
            .post("/api/admin/bookings/booking-b/cancel")
            .expect(404);
        await agent
            .post("/api/admin/bookings/booking-b/reschedule")
            .send({
                locationId: eglintonId,
                barberId: "barber-b",
                startTime: "2026-05-04T14:30:00.000Z",
            })
            .expect(403);
    });

    test("owner can create, cancel, and reschedule bookings through authenticated routes", async () => {
        const { app, bookingsRepository } = await createTestApp();
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        const createResponse = await agent
            .post("/api/admin/bookings")
            .send({
                locationId: eglintonId,
                serviceIds: [serviceId],
                barberId: "barber-a",
                startTime: "2026-05-04T16:00:00.000Z",
                customer: {
                    firstName: "Manual",
                    lastName: "Customer",
                    phone: "+16475550123",
                    email: "manual@example.com",
                },
                internalNotes: "Walk-in",
            })
            .expect(201);
        expect(createResponse.body.booking).toMatchObject({
            source: "manual",
            barberId: "barber-a",
        });
        expect(bookingsRepository.bookingServices).toHaveLength(1);

        const cancelResponse = await agent.post("/api/admin/bookings/booking-a/cancel").expect(200);
        expect(cancelResponse.body.booking.status).toBe("cancelled");

        bookingsRepository.bookings[0].status = "confirmed";
        bookingsRepository.availabilityData = baseAvailability({
            bookings: [
                {
                    id: "booking-a",
                    barberId: "barber-a",
                    locationId: eglintonId,
                    status: "confirmed",
                    startTime: new Date("2026-05-04T14:00:00.000Z"),
                    endTime: new Date("2026-05-04T14:30:00.000Z"),
                } as any,
            ],
        });

        const rescheduleResponse = await agent
            .post("/api/admin/bookings/booking-a/reschedule")
            .send({
                locationId: eglintonId,
                barberId: "barber-a",
                startTime: "2026-05-04T14:15:00.000Z",
            })
            .expect(200);
        expect(rescheduleResponse.body.booking).toMatchObject({
            id: "booking-a",
            startTime: "2026-05-04T14:15:00.000Z",
            endTime: "2026-05-04T14:45:00.000Z",
        });
    });

    test("unauthenticated Phase 6 booking management requests are rejected", async () => {
        const { app } = await createTestApp();

        await request(app).get("/api/admin/calendar/options").expect(401);
        await request(app).get("/api/admin/dashboard").expect(401);
        await request(app).get("/api/admin/bookings/booking-a").expect(401);
        await request(app).post("/api/admin/bookings").send({}).expect(401);
        await request(app).post("/api/admin/bookings/walk-in").send({}).expect(401);
        await request(app).post("/api/admin/bookings/booking-a/cancel").expect(401);
        await request(app).post("/api/admin/bookings/booking-a/no-show").expect(401);
        await request(app).post("/api/admin/bookings/booking-a/reschedule").send({}).expect(401);
    });
});

describe("Phase 7.5 admin walk-in and no-show API", () => {
    test("owner creates a walk-in without phone or email through authenticated routes", async () => {
        const { app, bookingsRepository } = await createTestApp();
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        const response = await agent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: eglintonId,
                serviceIds: [serviceId],
                barberId: "barber-a",
                startTime: "2026-05-04T14:00:00.000Z",
                customerName: "Jeff",
            })
            .expect(201);

        expect(response.body.booking).toMatchObject({
            source: "walk_in",
            barberId: "barber-a",
            customerName: "Jeff",
            customerEmail: null,
            customerPhone: null,
        });
        expect(bookingsRepository.customers[0]).toMatchObject({
            firstName: "Jeff",
            lastName: "",
            email: null,
            phoneE164: null,
        });
    });

    test("barber walk-in spoof and no-show on another barber are rejected", async () => {
        const { app, authRepository } = await createTestApp();
        authRepository.users.push({
            id: "barber-user",
            email: "barber@example.com",
            displayName: "Barber User",
            role: "barber",
            barberId: "barber-a",
            active: true,
            passwordHash: await hashPassword("barber-password"),
        });
        const agent = request.agent(app);

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "barber@example.com", password: "barber-password" })
            .expect(200);

        await agent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: eglintonId,
                serviceIds: [serviceId],
                barberId: "barber-b",
                startTime: "2026-05-04T14:00:00.000Z",
                customerName: "Spoof",
            })
            .expect(403);

        await agent.post("/api/admin/bookings/booking-b/no-show").expect(404);
    });

    test("owner marks a current or past confirmed booking as no-show", async () => {
        const { app, bookingsRepository } = await createTestApp();
        const agent = request.agent(app);
        bookingsRepository.bookings[0].startTime = new Date("2026-04-27T14:00:00.000Z");
        bookingsRepository.bookings[0].endTime = new Date("2026-04-27T14:30:00.000Z");

        await agent
            .post("/api/admin/auth/login")
            .send({ email: "owner@example.com", password: "correct-password" })
            .expect(200);

        const response = await agent.post("/api/admin/bookings/booking-a/no-show").expect(200);

        expect(response.body.booking).toMatchObject({
            id: "booking-a",
            status: "no_show",
        });
    });
});
