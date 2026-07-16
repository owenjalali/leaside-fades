import {
    AuthError,
    createDrizzleAuthRepository,
    createDrizzlePasswordResetRepository,
    createPasswordResetDelivery,
    getAdminSession,
    loginAdminUser,
    logoutAdminSession,
    requestPasswordReset,
    resetAdminPassword,
    type AuthRepository,
    type PasswordResetDelivery,
    type PasswordResetRepository,
} from "../auth/index.ts";
import {
    clearAdminSessionCookie,
    readAdminSessionToken,
    serializeSessionResponse,
    setAdminSessionCookie,
} from "../auth/http.ts";
import {
    AdminAuthorizationError,
    AdminBookingRequestError,
    type AdminBookingStatus,
    cancelAdminBooking,
    completeAdminBooking,
    createAdminManualBooking,
    createAdminWalkInBooking,
    editAdminBooking,
    getAdminAvailability,
    getAdminBookingDetail,
    getAdminCalendarOptions,
    getAdminDashboard,
    listAdminBookings,
    markAdminBookingNoShow,
    rescheduleAdminBooking,
    type AdminBookingManagementRepository,
    type AdminDashboardPeriod,
} from "./bookings-service.ts";
import { createDrizzleAdminBookingsRepository } from "./repository.ts";
import { createDrizzleAdminScheduleRepository } from "./schedule-repository.ts";
import {
    AdminScheduleRequestError,
    applyWeeklyScheduleBatch,
    createAdminBlockedTime,
    createAdminShift,
    createAdminShiftOverride,
    deactivateAdminShift,
    deleteAdminBlockedTime,
    deleteAdminShiftOverride,
    listAdminSchedule,
    replaceAdminDayShift,
    updateAdminBlockedTime,
    updateAdminShift,
    updateAdminShiftOverride,
    type AdminScheduleRepository,
} from "./schedule-service.ts";
import {
    resolveNotificationDeliveryMode,
    resolveSmsDeliveryMode,
} from "../notifications/index.ts";
import { createTeamInviteDelivery } from "./team-invite-delivery.ts";
import { createDrizzleTeamOnboardingRepository } from "./team-repository.ts";
import {
    createTeamProfileImageStorage,
    TEAM_PROFILE_IMAGE_CONTENT_TYPES,
    TEAM_PROFILE_IMAGE_MAX_BYTES,
    TeamProfileImageUploadError,
    type TeamProfileImageStorage,
} from "./team-profile-image-storage.ts";
import {
    acceptBarberInvite,
    createBarberOnboarding,
    deactivateBarberAccess,
    listTeamBarbers,
    TeamAccessError,
    type TeamInviteDelivery,
    type TeamOnboardingRepository,
} from "./team-service.ts";

interface AdminApiDependencies {
    authRepository?: AuthRepository;
    passwordResetRepository?: PasswordResetRepository;
    passwordResetDelivery?: PasswordResetDelivery;
    teamRepository?: TeamOnboardingRepository;
    teamInviteDelivery?: TeamInviteDelivery;
    teamProfileImageStorage?: TeamProfileImageStorage;
    bookingsRepository?: AdminBookingManagementRepository;
    scheduleRepository?: AdminScheduleRepository;
    appUrl?: string;
    now?: () => Date;
    notificationEnv?: Partial<Record<string, string | undefined>>;
}

type ExpressLikeApp = {
    get: (path: string, ...handlers: Array<(request: any, response: any, next: any) => void>) => void;
    post: (path: string, ...handlers: Array<(request: any, response: any, next: any) => void>) => void;
    use?: (...handlers: Array<(error: unknown, request: any, response: any, next: any) => void>) => void;
};

class AdminMutationOriginError extends Error {
    readonly status = 403;

    constructor() {
        super("Admin request origin is not allowed.");
        this.name = "AdminMutationOriginError";
    }
}

const ADMIN_MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOCAL_ADMIN_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
];

export function registerAdminApiRoutes(app: ExpressLikeApp, dependencies: AdminApiDependencies = {}) {
    app.post(
        "/api/admin/auth/login",
        asyncRoute((request, response) =>
            handleAdminLogin(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/auth/logout",
        asyncRoute((request, response) =>
            handleAdminLogout(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/auth/forgot-password",
        asyncRoute((request, response) =>
            handleAdminForgotPassword(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/auth/reset-password",
        asyncRoute((request, response) =>
            handleAdminResetPassword(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/auth/accept-invite",
        asyncRoute((request, response) =>
            handleAdminAcceptInvite(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/team/profile-image",
        asyncRoute((request, response) =>
            handleAdminUploadTeamProfileImage(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/team/barbers",
        asyncRoute((request, response) =>
            handleAdminCreateBarber(request, response, undefined, dependencies),
        ),
    );

    app.get(
        "/api/admin/team/barbers",
        asyncRoute((request, response) =>
            handleAdminTeamBarbers(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/team/barbers/:barberId/deactivate",
        asyncRoute((request, response) =>
            handleAdminDeactivateBarber(request, response, undefined, dependencies),
        ),
    );

    app.get(
        "/api/admin/auth/session",
        asyncRoute((request, response) =>
            handleAdminSession(request, response, undefined, dependencies),
        ),
    );

    app.get(
        "/api/admin/bookings",
        asyncRoute((request, response) =>
            handleAdminBookings(request, response, undefined, dependencies),
        ),
    );

    app.get(
        "/api/admin/dashboard",
        asyncRoute((request, response) =>
            handleAdminDashboard(request, response, undefined, dependencies),
        ),
    );

    app.get(
        "/api/admin/calendar/options",
        asyncRoute((request, response) =>
            handleAdminCalendarOptions(request, response, undefined, dependencies),
        ),
    );

    app.get(
        "/api/admin/availability",
        asyncRoute((request, response) =>
            handleAdminAvailability(request, response, undefined, dependencies),
        ),
    );

    app.get(
        "/api/admin/bookings/:bookingId",
        asyncRoute((request, response) =>
            handleAdminBookingDetail(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/bookings",
        asyncRoute((request, response) =>
            handleAdminCreateManualBooking(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/bookings/walk-in",
        asyncRoute((request, response) =>
            handleAdminCreateWalkInBooking(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/bookings/:bookingId/cancel",
        asyncRoute((request, response) =>
            handleAdminCancelBooking(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/bookings/:bookingId/no-show",
        asyncRoute((request, response) =>
            handleAdminNoShowBooking(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/bookings/:bookingId/complete",
        asyncRoute((request, response) =>
            handleAdminCompleteBooking(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/bookings/:bookingId/edit",
        asyncRoute((request, response) =>
            handleAdminEditBooking(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/bookings/:bookingId/reschedule",
        asyncRoute((request, response) =>
            handleAdminRescheduleBooking(request, response, undefined, dependencies),
        ),
    );

    app.get(
        "/api/admin/schedule",
        asyncRoute((request, response) =>
            handleAdminSchedule(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/shifts",
        asyncRoute((request, response) =>
            handleAdminCreateShift(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/shifts/:shiftId",
        asyncRoute((request, response) =>
            handleAdminUpdateShift(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/shifts/:shiftId/deactivate",
        asyncRoute((request, response) =>
            handleAdminDeactivateShift(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/weekly-batch",
        asyncRoute((request, response) =>
            handleAdminApplyWeeklyScheduleBatch(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/shift-overrides",
        asyncRoute((request, response) =>
            handleAdminCreateShiftOverride(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/shift-overrides/:overrideId",
        asyncRoute((request, response) =>
            handleAdminUpdateShiftOverride(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/shift-overrides/:overrideId/delete",
        asyncRoute((request, response) =>
            handleAdminDeleteShiftOverride(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/day-shifts",
        asyncRoute((request, response) =>
            handleAdminReplaceDayShift(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/blocked-times",
        asyncRoute((request, response) =>
            handleAdminCreateBlockedTime(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/blocked-times/:blockedTimeId",
        asyncRoute((request, response) =>
            handleAdminUpdateBlockedTime(request, response, undefined, dependencies),
        ),
    );

    app.post(
        "/api/admin/schedule/blocked-times/:blockedTimeId/delete",
        asyncRoute((request, response) =>
            handleAdminDeleteBlockedTime(request, response, undefined, dependencies),
        ),
    );

    app.use?.((error: unknown, _request: any, response: any, next: any) => {
        sendAdminApiError(error, response, next);
    });
}

export async function handleAdminLogin(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const result = await loginAdminUser(
            {
                email: request.body?.email,
                password: request.body?.password,
            },
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        setAdminSessionCookie(response, result.sessionToken, result.expiresAt);
        response.set("Cache-Control", "no-store");
        response.status(200).json(serializeSessionResponse(result.user));
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

async function requireAdminSession(
    request: any,
    response: any,
    dependencies: AdminApiDependencies,
) {
    const sessionToken = readAdminSessionToken(request);
    const session = await getAdminSession(
        sessionToken,
        dependencies.authRepository ?? createDrizzleAuthRepository(),
        { now: dependencies.now?.() ?? new Date() },
    );

    setAdminSessionCookie(response, sessionToken, session.session.expiresAt);
    return session;
}

export async function handleAdminLogout(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        await logoutAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            {
                now: dependencies.now?.() ?? new Date(),
            },
        );
        clearAdminSessionCookie(response);
        response.set("Cache-Control", "no-store");
        response.status(204).end();
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminForgotPassword(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const result = await requestPasswordReset(
            { email: request.body?.email },
            dependencies.passwordResetRepository ?? createDrizzlePasswordResetRepository(),
            dependencies.passwordResetDelivery ?? createPasswordResetDelivery(),
            {
                now: dependencies.now?.() ?? new Date(),
                appUrl: dependencies.appUrl ?? process.env.APP_URL,
            },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json(result);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminResetPassword(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        await resetAdminPassword(
            {
                token: request.body?.token,
                password: request.body?.password,
            },
            dependencies.passwordResetRepository ?? createDrizzlePasswordResetRepository(),
            {
                now: dependencies.now?.() ?? new Date(),
            },
        );

        clearAdminSessionCookie(response);
        response.set("Cache-Control", "no-store");
        response.status(204).end();
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminAcceptInvite(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        await acceptBarberInvite(
            {
                token: request.body?.token,
                password: request.body?.password,
            },
            dependencies.teamRepository ?? createDrizzleTeamOnboardingRepository(),
            {
                now: dependencies.now?.() ?? new Date(),
            },
        );

        clearAdminSessionCookie(response);
        response.set("Cache-Control", "no-store");
        response.status(204).end();
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminSession(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        response.set("Cache-Control", "no-store");
        response.status(200).json(serializeSessionResponse(session.user));
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminBookings(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const bookings = await listAdminBookings(
            session.user,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
            parseAdminBookingFilters(request.query),
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ bookings });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminDashboard(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const notificationEnv = dependencies.notificationEnv ?? process.env;
        const dashboard = await getAdminDashboard(
            session.user,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
            {
                now: dependencies.now?.() ?? new Date(),
                notificationDeliveryMode: resolveNotificationDeliveryMode(notificationEnv),
                notificationProviders: {
                    email: { provider: "brevo", state: "active" },
                    sms: {
                        provider: "twilio",
                        state: resolveSmsDeliveryMode(notificationEnv) === "paused"
                            ? "paused"
                            : "active",
                    },
                },
                dashboardPeriod: parseDashboardPeriod(request.query?.period),
                dashboardAnchorDate: parseDashboardAnchorDate(request.query?.anchorDate),
            },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json(dashboard);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminCalendarOptions(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const options = await getAdminCalendarOptions(
            session.user,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json(options);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminAvailability(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const availability = await getAdminAvailability(
            session.user,
            parseAdminAvailabilityQuery(request.query, dependencies.now?.() ?? new Date()),
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json(availability);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminBookingDetail(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const booking = await getAdminBookingDetail(
            session.user,
            request.params?.bookingId,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ booking });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminCreateManualBooking(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const booking = await createAdminManualBooking(
            session.user,
            request.body,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(201).json({ booking });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminCreateWalkInBooking(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const booking = await createAdminWalkInBooking(
            session.user,
            request.body,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(201).json({ booking });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminCancelBooking(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const booking = await cancelAdminBooking(
            session.user,
            request.params?.bookingId,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ booking });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminNoShowBooking(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const booking = await markAdminBookingNoShow(
            session.user,
            request.params?.bookingId,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ booking });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminCompleteBooking(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const booking = await completeAdminBooking(
            session.user,
            request.params?.bookingId,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ booking });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminEditBooking(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const booking = await editAdminBooking(
            session.user,
            request.params?.bookingId,
            request.body,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ booking });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminRescheduleBooking(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const booking = await rescheduleAdminBooking(
            session.user,
            request.params?.bookingId,
            request.body,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ booking });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminSchedule(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const schedule = await listAdminSchedule(
            session.user,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            parseAdminScheduleQuery(request.query),
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json(schedule);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminCreateShift(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const shift = await createAdminShift(
            session.user,
            request.body,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(201).json({ shift });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminUpdateShift(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const shift = await updateAdminShift(
            session.user,
            request.params?.shiftId,
            request.body,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ shift });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminDeactivateShift(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const shift = await deactivateAdminShift(
            session.user,
            request.params?.shiftId,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ shift });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

// Request/response are typed structurally (not `any`) to keep the lint-warning baseline flat.
export async function handleAdminApplyWeeklyScheduleBatch(
    request: { body?: { operations?: unknown } },
    response: {
        set: (name: string, value: string) => void;
        status: (code: number) => { json: (body: unknown) => void };
    },
    next?: unknown,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const result = await applyWeeklyScheduleBatch(
            session.user,
            request.body?.operations,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json(result);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminCreateShiftOverride(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const shiftOverride = await createAdminShiftOverride(
            session.user,
            request.body,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(201).json({ shiftOverride });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminUpdateShiftOverride(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const shiftOverride = await updateAdminShiftOverride(
            session.user,
            request.params?.overrideId,
            request.body,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ shiftOverride });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminDeleteShiftOverride(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const result = await deleteAdminShiftOverride(
            session.user,
            request.params?.overrideId,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json(result);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminReplaceDayShift(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const dayShift = await replaceAdminDayShift(
            session.user,
            request.body,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ dayShift });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminCreateBlockedTime(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const blockedTime = await createAdminBlockedTime(
            session.user,
            request.body,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(201).json({ blockedTime });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminUpdateBlockedTime(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const blockedTime = await updateAdminBlockedTime(
            session.user,
            request.params?.blockedTimeId,
            request.body,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json({ blockedTime });
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminDeleteBlockedTime(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const result = await deleteAdminBlockedTime(
            session.user,
            request.params?.blockedTimeId,
            dependencies.scheduleRepository ?? createDrizzleAdminScheduleRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json(result);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminCreateBarber(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const result = await createBarberOnboarding(
            session.user,
            {
                displayName: request.body?.displayName,
                email: request.body?.email,
                phoneE164: request.body?.phoneE164,
                profileImageUrl: request.body?.profileImageUrl,
                profileImagePathname: request.body?.profileImagePathname,
                locationIds: request.body?.locationIds,
                weeklyShifts: request.body?.weeklyShifts,
            },
            dependencies.teamRepository ?? createDrizzleTeamOnboardingRepository(),
            dependencies.teamInviteDelivery ?? createTeamInviteDelivery(),
            {
                now: dependencies.now?.() ?? new Date(),
                appUrl: dependencies.appUrl ?? process.env.APP_URL,
            },
        );

        response.set("Cache-Control", "no-store");
        response.status(201).json(result);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminTeamBarbers(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const result = await listTeamBarbers(
            session.user,
            dependencies.teamRepository ?? createDrizzleTeamOnboardingRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json(result);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminUploadTeamProfileImage(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);

        if (session.user.role !== "owner" && session.user.role !== "admin") {
            throw new TeamAccessError(403, "Owner or admin access is required.");
        }

        const contentType = normalizeContentType(readRequestHeader(request, "Content-Type"));

        if (!TEAM_PROFILE_IMAGE_CONTENT_TYPES.has(contentType)) {
            throw new TeamProfileImageUploadError(415, "Profile images must be JPG, PNG, or WebP.");
        }

        const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);

        if (body.length === 0) {
            throw new TeamProfileImageUploadError(400, "Profile image file is required.");
        }

        if (body.length > TEAM_PROFILE_IMAGE_MAX_BYTES) {
            throw new TeamProfileImageUploadError(413, "Profile image must be 4 MB or smaller.");
        }

        const filename = typeof request.query?.filename === "string" && request.query.filename.trim()
            ? request.query.filename.trim()
            : "profile-image";
        const upload = await (dependencies.teamProfileImageStorage ?? createTeamProfileImageStorage()).uploadProfileImage({
            filename,
            contentType,
            sizeBytes: body.length,
            body,
        });

        response.set("Cache-Control", "no-store");
        response.status(201).json(upload);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

export async function handleAdminDeactivateBarber(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await requireAdminSession(request, response, dependencies);
        const result = await deactivateBarberAccess(
            session.user,
            request.params?.barberId,
            dependencies.teamRepository ?? createDrizzleTeamOnboardingRepository(),
            {
                now: dependencies.now?.() ?? new Date(),
            },
        );

        response.set("Cache-Control", "no-store");
        response.status(200).json(result);
    } catch (error) {
        sendAdminApiError(error, response, next);
    }
}

function parseAdminBookingFilters(query: Record<string, unknown>) {
    return {
        from: typeof query.from === "string" ? query.from : undefined,
        to: typeof query.to === "string" ? query.to : undefined,
        locationId: typeof query.locationId === "string" ? query.locationId : undefined,
        barberId: typeof query.barberId === "string" ? query.barberId : undefined,
        status: typeof query.status === "string" ? (query.status as AdminBookingStatus) : undefined,
        limit: typeof query.limit === "string" ? Number(query.limit) : undefined,
    };
}

function parseDashboardPeriod(value: unknown): AdminDashboardPeriod | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === "week" || value === "month" || value === "year" || value === "all-time") {
        return value;
    }

    throw new AdminBookingRequestError(400, "Dashboard period is invalid.");
}

function parseDashboardAnchorDate(value: unknown) {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    throw new AdminBookingRequestError(400, "Dashboard anchor date is invalid.");
}

function parseAdminAvailabilityQuery(query: Record<string, unknown>, now: Date) {
    const rawServiceIds = query.serviceIds;
    const serviceIds =
        typeof rawServiceIds === "string"
            ? rawServiceIds.split(",").map((serviceId) => serviceId.trim()).filter(Boolean)
            : Array.isArray(rawServiceIds)
              ? rawServiceIds.filter((serviceId): serviceId is string => typeof serviceId === "string")
              : [];

    return {
        locationId: typeof query.locationId === "string" ? query.locationId : "",
        serviceIds,
        date: typeof query.date === "string" ? query.date : "",
        barberId: typeof query.barberId === "string" && query.barberId.trim() ? query.barberId : undefined,
        now,
    };
}

function parseAdminScheduleQuery(query: Record<string, unknown>) {
    return {
        from: typeof query.from === "string" ? query.from : undefined,
        to: typeof query.to === "string" ? query.to : undefined,
    };
}

// Cookie-backed admin mutations accept same-origin browser requests plus configured/local dev origins.
function assertAdminMutationOrigin(request: any, dependencies: AdminApiDependencies) {
    const method = String(request.method ?? "GET").toUpperCase();

    if (!ADMIN_MUTATION_METHODS.has(method)) {
        return;
    }

    const requestOrigin = readAdminMutationOrigin(request);

    if (requestOrigin === undefined) {
        return;
    }

    if (!requestOrigin || !allowedAdminMutationOrigins(request, dependencies).has(requestOrigin)) {
        throw new AdminMutationOriginError();
    }
}

function readAdminMutationOrigin(request: any) {
    const origin = readRequestHeader(request, "Origin");

    if (origin) {
        return normalizeOrigin(origin);
    }

    const referer = readRequestHeader(request, "Referer");
    return referer ? normalizeOrigin(referer) : undefined;
}

function allowedAdminMutationOrigins(request: any, dependencies: AdminApiDependencies) {
    const origins = new Set<string>();

    for (const origin of LOCAL_ADMIN_ORIGINS) {
        addAllowedOrigin(origins, origin);
    }

    addAllowedOrigin(origins, dependencies.appUrl ?? process.env.APP_URL);

    const host = readRequestHeader(request, "Host");

    if (host) {
        const forwardedProto = readRequestHeader(request, "X-Forwarded-Proto")?.split(",")[0]?.trim();
        const requestProtocol = typeof request.protocol === "string" ? request.protocol : undefined;
        const protocol = forwardedProto || requestProtocol;

        if (protocol) {
            addAllowedOrigin(origins, `${protocol}://${host}`);
        }

        addAllowedOrigin(origins, `http://${host}`);
        addAllowedOrigin(origins, `https://${host}`);
    }

    return origins;
}

function addAllowedOrigin(origins: Set<string>, value: string | undefined) {
    const origin = value ? normalizeOrigin(value) : null;

    if (origin) {
        origins.add(origin);
    }
}

function normalizeOrigin(value: string) {
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function readRequestHeader(request: any, name: string) {
    if (typeof request.get === "function") {
        const value = request.get(name);

        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    const rawValue = request.headers?.[name.toLowerCase()] ?? request.headers?.[name];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;

    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeContentType(value: string | undefined) {
    return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function sendAdminApiError(error: unknown, response: any, next?: any) {
    if (
        error instanceof AuthError ||
        error instanceof AdminAuthorizationError ||
        error instanceof AdminBookingRequestError ||
        error instanceof AdminScheduleRequestError ||
        error instanceof TeamAccessError ||
        error instanceof TeamProfileImageUploadError ||
        error instanceof AdminMutationOriginError
    ) {
        response.status(error.status).json({ message: error.message });
        return;
    }

    if (next) {
        next(error);
        return;
    }

    response.status(500).json({ message: "Admin service is currently unavailable." });
}

function asyncRoute(handler: (request: any, response: any, next: any) => Promise<void>) {
    return (request: any, response: any, next: any) => {
        Promise.resolve(handler(request, response, next)).catch(next);
    };
}
