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
    createAdminManualBooking,
    createAdminWalkInBooking,
    getAdminAvailability,
    getAdminBookingDetail,
    getAdminCalendarOptions,
    getAdminDashboard,
    listAdminBookings,
    markAdminBookingNoShow,
    rescheduleAdminBooking,
    type AdminBookingManagementRepository,
} from "./bookings-service.ts";
import { createDrizzleAdminBookingsRepository } from "./repository.ts";
import { createDrizzleAdminScheduleRepository } from "./schedule-repository.ts";
import {
    AdminScheduleRequestError,
    createAdminBlockedTime,
    createAdminShift,
    createAdminShiftOverride,
    deactivateAdminShift,
    deleteAdminBlockedTime,
    deleteAdminShiftOverride,
    listAdminSchedule,
    updateAdminBlockedTime,
    updateAdminShift,
    updateAdminShiftOverride,
    type AdminScheduleRepository,
} from "./schedule-service.ts";
import { createTeamInviteDelivery } from "./team-invite-delivery.ts";
import { createDrizzleTeamOnboardingRepository } from "./team-repository.ts";
import {
    acceptBarberInvite,
    createBarberOnboarding,
    deactivateBarberAccess,
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
    bookingsRepository?: AdminBookingManagementRepository;
    scheduleRepository?: AdminScheduleRepository;
    appUrl?: string;
    now?: () => Date;
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
        "/api/admin/team/barbers",
        asyncRoute((request, response) =>
            handleAdminCreateBarber(request, response, undefined, dependencies),
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
        const dashboard = await getAdminDashboard(
            session.user,
            dependencies.bookingsRepository ?? createDrizzleAdminBookingsRepository(),
            { now: dependencies.now?.() ?? new Date() },
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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

export async function handleAdminRescheduleBooking(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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

export async function handleAdminCreateShiftOverride(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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

export async function handleAdminCreateBlockedTime(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
        const result = await createBarberOnboarding(
            session.user,
            {
                displayName: request.body?.displayName,
                email: request.body?.email,
                phoneE164: request.body?.phoneE164,
                locationIds: request.body?.locationIds,
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

export async function handleAdminDeactivateBarber(
    request: any,
    response: any,
    next?: any,
    dependencies: AdminApiDependencies = {},
) {
    try {
        assertAdminMutationOrigin(request, dependencies);
        const session = await getAdminSession(
            readAdminSessionToken(request),
            dependencies.authRepository ?? createDrizzleAuthRepository(),
            { now: dependencies.now?.() ?? new Date() },
        );
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

function sendAdminApiError(error: unknown, response: any, next?: any) {
    if (
        error instanceof AuthError ||
        error instanceof AdminAuthorizationError ||
        error instanceof AdminBookingRequestError ||
        error instanceof AdminScheduleRequestError ||
        error instanceof TeamAccessError ||
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
