import { relations, sql } from "drizzle-orm";
import {
    boolean,
    check,
    date,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    time,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

export const bookingStatusEnum = pgEnum("booking_status", [
    "confirmed",
    "cancelled",
    "completed",
    "no_show",
]);

export const bookingSourceEnum = pgEnum("booking_source", ["public", "manual", "walk_in", "imported"]);

export const priceTypeEnum = pgEnum("price_type", ["fixed", "from"]);

export const blockedTimeScopeEnum = pgEnum("blocked_time_scope", [
    "barber",
    "location",
    "business",
]);

export const notificationChannelEnum = pgEnum("notification_channel", ["sms", "email"]);

export const notificationStatusEnum = pgEnum("notification_status", [
    "pending",
    "sent",
    "failed",
    "skipped",
]);

export const notificationEventTypeEnum = pgEnum("notification_event_type", [
    "booking_confirmation",
    "reminder_24h",
    "reminder_2h",
    "cancellation_confirmation",
    "reschedule_confirmation",
]);

export const recipientTypeEnum = pgEnum("recipient_type", ["customer", "barber", "admin"]);

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "barber"]);

export const shiftOverrideTypeEnum = pgEnum("shift_override_type", [
    "add",
    "remove",
    "not_working",
]);

const idColumn = () => uuid("id").primaryKey().defaultRandom();
const createdAtColumn = () =>
    timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAtColumn = () =>
    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const locations = pgTable(
    "locations",
    {
        id: idColumn(),
        slug: varchar("slug", { length: 80 }).notNull().unique(),
        name: varchar("name", { length: 160 }).notNull(),
        addressLine1: varchar("address_line_1", { length: 200 }).notNull(),
        city: varchar("city", { length: 120 }).notNull(),
        province: varchar("province", { length: 80 }).notNull(),
        postalCode: varchar("postal_code", { length: 20 }).notNull(),
        phoneE164: varchar("phone_e164", { length: 32 }).notNull(),
        phoneDisplay: varchar("phone_display", { length: 40 }).notNull(),
        timezone: varchar("timezone", { length: 80 }).notNull().default("America/Toronto"),
        active: boolean("active").notNull().default(true),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("locations_active_sort_idx").on(table.active, table.sortOrder),
    ],
);

export const businessHours = pgTable(
    "business_hours",
    {
        id: idColumn(),
        locationId: uuid("location_id")
            .notNull()
            .references(() => locations.id, { onDelete: "cascade" }),
        dayOfWeek: integer("day_of_week").notNull(),
        openTime: time("open_time").notNull(),
        closeTime: time("close_time").notNull(),
        closed: boolean("closed").notNull().default(false),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        unique("business_hours_location_day_unique").on(table.locationId, table.dayOfWeek),
        check("business_hours_day_check", sql`${table.dayOfWeek} between 0 and 6`),
        check(
            "business_hours_time_check",
            sql`${table.closed} = true OR ${table.openTime} < ${table.closeTime}`,
        ),
    ],
);

export const barbers = pgTable(
    "barbers",
    {
        id: idColumn(),
        slug: varchar("slug", { length: 80 }).notNull().unique(),
        displayName: varchar("display_name", { length: 160 }).notNull(),
        phoneE164: varchar("phone_e164", { length: 32 }),
        email: varchar("email", { length: 255 }),
        profileImageUrl: text("profile_image_url"),
        profileImagePathname: text("profile_image_pathname"),
        active: boolean("active").notNull().default(true),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("barbers_active_sort_idx").on(table.active, table.sortOrder),
        uniqueIndex("barbers_email_unique").on(table.email),
    ],
);

export const barberLocations = pgTable(
    "barber_locations",
    {
        barberId: uuid("barber_id")
            .notNull()
            .references(() => barbers.id, { onDelete: "cascade" }),
        locationId: uuid("location_id")
            .notNull()
            .references(() => locations.id, { onDelete: "cascade" }),
        createdAt: createdAtColumn(),
    },
    (table) => [
        primaryKey({ columns: [table.barberId, table.locationId] }),
        index("barber_locations_location_idx").on(table.locationId),
    ],
);

export const serviceCategories = pgTable(
    "service_categories",
    {
        id: idColumn(),
        slug: varchar("slug", { length: 100 }).notNull().unique(),
        name: varchar("name", { length: 160 }).notNull(),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [index("service_categories_sort_idx").on(table.sortOrder)],
);

export const services = pgTable(
    "services",
    {
        id: idColumn(),
        categoryId: uuid("category_id")
            .notNull()
            .references(() => serviceCategories.id, { onDelete: "restrict" }),
        slug: varchar("slug", { length: 120 }).notNull().unique(),
        name: varchar("name", { length: 200 }).notNull(),
        durationMinutes: integer("duration_minutes").notNull(),
        priceCents: integer("price_cents").notNull(),
        priceType: priceTypeEnum("price_type").notNull(),
        displayPrice: varchar("display_price", { length: 80 }).notNull(),
        description: text("description"),
        active: boolean("active").notNull().default(true),
        sortOrder: integer("sort_order").notNull().default(0),
        isFeatured: boolean("is_featured").notNull().default(false),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("services_category_sort_idx").on(table.categoryId, table.sortOrder),
        index("services_active_featured_idx").on(table.active, table.isFeatured, table.sortOrder),
        check("services_duration_positive_check", sql`${table.durationMinutes} > 0`),
        check("services_price_nonnegative_check", sql`${table.priceCents} >= 0`),
    ],
);

export const barberServices = pgTable(
    "barber_services",
    {
        barberId: uuid("barber_id")
            .notNull()
            .references(() => barbers.id, { onDelete: "cascade" }),
        serviceId: uuid("service_id")
            .notNull()
            .references(() => services.id, { onDelete: "cascade" }),
        active: boolean("active").notNull().default(true),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        primaryKey({ columns: [table.barberId, table.serviceId] }),
        index("barber_services_service_idx").on(table.serviceId),
    ],
);

export const shifts = pgTable(
    "shifts",
    {
        id: idColumn(),
        barberId: uuid("barber_id")
            .notNull()
            .references(() => barbers.id, { onDelete: "cascade" }),
        locationId: uuid("location_id")
            .notNull()
            .references(() => locations.id, { onDelete: "cascade" }),
        dayOfWeek: integer("day_of_week").notNull(),
        startTime: time("start_time").notNull(),
        endTime: time("end_time").notNull(),
        effectiveFrom: date("effective_from"),
        effectiveTo: date("effective_to"),
        active: boolean("active").notNull().default(true),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("shifts_barber_day_idx").on(table.barberId, table.dayOfWeek, table.active),
        index("shifts_location_day_idx").on(table.locationId, table.dayOfWeek, table.active),
        check("shifts_day_check", sql`${table.dayOfWeek} between 0 and 6`),
        check("shifts_time_check", sql`${table.startTime} < ${table.endTime}`),
        check(
            "shifts_effective_dates_check",
            sql`${table.effectiveFrom} is null OR ${table.effectiveTo} is null OR ${table.effectiveFrom} <= ${table.effectiveTo}`,
        ),
    ],
);

export const shiftOverrides = pgTable(
    "shift_overrides",
    {
        id: idColumn(),
        barberId: uuid("barber_id")
            .notNull()
            .references(() => barbers.id, { onDelete: "cascade" }),
        locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
        overrideDate: date("override_date").notNull(),
        overrideType: shiftOverrideTypeEnum("override_type").notNull(),
        startTime: time("start_time"),
        endTime: time("end_time"),
        reason: text("reason"),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("shift_overrides_barber_date_idx").on(table.barberId, table.overrideDate),
        index("shift_overrides_location_date_idx").on(table.locationId, table.overrideDate),
        check(
            "shift_overrides_time_check",
            sql`(${table.overrideType} = 'not_working' AND ${table.startTime} IS NULL AND ${table.endTime} IS NULL) OR (${table.startTime} IS NOT NULL AND ${table.endTime} IS NOT NULL AND ${table.startTime} < ${table.endTime})`,
        ),
    ],
);

export const customers = pgTable(
    "customers",
    {
        id: idColumn(),
        firstName: varchar("first_name", { length: 120 }).notNull(),
        lastName: varchar("last_name", { length: 120 }).notNull(),
        phoneE164: varchar("phone_e164", { length: 32 }),
        email: varchar("email", { length: 255 }),
        notes: text("notes"),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("customers_phone_idx").on(table.phoneE164),
        index("customers_email_idx").on(table.email),
    ],
);

export const bookings = pgTable(
    "bookings",
    {
        id: idColumn(),
        customerId: uuid("customer_id")
            .notNull()
            .references(() => customers.id, { onDelete: "restrict" }),
        barberId: uuid("barber_id")
            .notNull()
            .references(() => barbers.id, { onDelete: "restrict" }),
        locationId: uuid("location_id")
            .notNull()
            .references(() => locations.id, { onDelete: "restrict" }),
        status: bookingStatusEnum("status").notNull().default("confirmed"),
        source: bookingSourceEnum("source").notNull().default("public"),
        startTime: timestamp("start_time", { withTimezone: true }).notNull(),
        endTime: timestamp("end_time", { withTimezone: true }).notNull(),
        totalDurationMinutes: integer("total_duration_minutes").notNull(),
        customerNotes: text("customer_notes"),
        internalNotes: text("internal_notes"),
        cancellationTokenHash: text("cancellation_token_hash"),
        rescheduleTokenHash: text("reschedule_token_hash"),
        cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
        cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("bookings_barber_time_idx").on(table.barberId, table.startTime, table.endTime),
        index("bookings_location_time_idx").on(table.locationId, table.startTime, table.endTime),
        index("bookings_customer_time_idx").on(table.customerId, table.startTime),
        index("bookings_status_idx").on(table.status),
        uniqueIndex("bookings_cancellation_token_hash_unique").on(table.cancellationTokenHash),
        uniqueIndex("bookings_reschedule_token_hash_unique").on(table.rescheduleTokenHash),
        check("bookings_time_check", sql`${table.startTime} < ${table.endTime}`),
        check("bookings_duration_positive_check", sql`${table.totalDurationMinutes} > 0`),
    ],
);

export const bookingServices = pgTable(
    "booking_services",
    {
        id: idColumn(),
        bookingId: uuid("booking_id")
            .notNull()
            .references(() => bookings.id, { onDelete: "cascade" }),
        serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
        serviceName: varchar("service_name", { length: 200 }).notNull(),
        categoryName: varchar("category_name", { length: 160 }).notNull(),
        durationMinutes: integer("duration_minutes").notNull(),
        priceCents: integer("price_cents").notNull(),
        priceType: priceTypeEnum("price_type").notNull(),
        displayPrice: varchar("display_price", { length: 80 }).notNull(),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: createdAtColumn(),
    },
    (table) => [
        index("booking_services_booking_idx").on(table.bookingId, table.sortOrder),
        check("booking_services_duration_positive_check", sql`${table.durationMinutes} > 0`),
        check("booking_services_price_nonnegative_check", sql`${table.priceCents} >= 0`),
    ],
);

export const blockedTimes = pgTable(
    "blocked_times",
    {
        id: idColumn(),
        scope: blockedTimeScopeEnum("scope").notNull(),
        barberId: uuid("barber_id").references(() => barbers.id, { onDelete: "cascade" }),
        locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
        startTime: timestamp("start_time", { withTimezone: true }).notNull(),
        endTime: timestamp("end_time", { withTimezone: true }).notNull(),
        reason: text("reason"),
        createdByUserId: uuid("created_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("blocked_times_scope_time_idx").on(table.scope, table.startTime, table.endTime),
        index("blocked_times_barber_time_idx").on(table.barberId, table.startTime, table.endTime),
        index("blocked_times_location_time_idx").on(table.locationId, table.startTime, table.endTime),
        check("blocked_times_time_check", sql`${table.startTime} < ${table.endTime}`),
        check(
            "blocked_times_scope_check",
            sql`(${table.scope} = 'business' AND ${table.barberId} IS NULL AND ${table.locationId} IS NULL) OR (${table.scope} = 'location' AND ${table.barberId} IS NULL AND ${table.locationId} IS NOT NULL) OR (${table.scope} = 'barber' AND ${table.barberId} IS NOT NULL)`,
        ),
    ],
);

export const users = pgTable(
    "users",
    {
        id: idColumn(),
        email: varchar("email", { length: 255 }).notNull().unique(),
        displayName: varchar("display_name", { length: 160 }).notNull(),
        role: userRoleEnum("role").notNull(),
        passwordHash: text("password_hash"),
        barberId: uuid("barber_id").references(() => barbers.id, { onDelete: "set null" }),
        active: boolean("active").notNull().default(true),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("users_role_active_idx").on(table.role, table.active),
        index("users_barber_idx").on(table.barberId),
    ],
);

export const userSessions = pgTable(
    "user_sessions",
    {
        id: idColumn(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        tokenHash: text("token_hash").notNull().unique(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        revokedAt: timestamp("revoked_at", { withTimezone: true }),
        lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("user_sessions_user_idx").on(table.userId),
        index("user_sessions_expires_idx").on(table.expiresAt),
        index("user_sessions_active_lookup_idx").on(table.tokenHash, table.expiresAt, table.revokedAt),
    ],
);

export const passwordResetTokens = pgTable(
    "password_reset_tokens",
    {
        id: idColumn(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        tokenHash: text("token_hash").notNull().unique(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        usedAt: timestamp("used_at", { withTimezone: true }),
        createdAt: createdAtColumn(),
    },
    (table) => [
        index("password_reset_tokens_user_idx").on(table.userId),
        index("password_reset_tokens_expires_idx").on(table.expiresAt),
        index("password_reset_tokens_unused_idx").on(table.tokenHash, table.usedAt),
    ],
);

export const userInviteTokens = pgTable(
    "user_invite_tokens",
    {
        id: idColumn(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        tokenHash: text("token_hash").notNull().unique(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        usedAt: timestamp("used_at", { withTimezone: true }),
        createdByUserId: uuid("created_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: createdAtColumn(),
    },
    (table) => [
        index("user_invite_tokens_user_idx").on(table.userId),
        index("user_invite_tokens_expires_idx").on(table.expiresAt),
        index("user_invite_tokens_unused_idx").on(table.tokenHash, table.usedAt),
    ],
);

export const notifications = pgTable(
    "notifications",
    {
        id: idColumn(),
        bookingId: uuid("booking_id")
            .notNull()
            .references(() => bookings.id, { onDelete: "cascade" }),
        recipientType: recipientTypeEnum("recipient_type").notNull(),
        recipientPhone: varchar("recipient_phone", { length: 32 }),
        recipientEmail: varchar("recipient_email", { length: 255 }),
        channel: notificationChannelEnum("channel").notNull(),
        eventType: notificationEventTypeEnum("event_type").notNull(),
        status: notificationStatusEnum("status").notNull().default("pending"),
        provider: varchar("provider", { length: 40 }),
        idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull().unique(),
        providerMessageId: varchar("provider_message_id", { length: 200 }),
        errorMessage: text("error_message"),
        metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
        attemptCount: integer("attempt_count").notNull().default(0),
        lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
        scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
        sentAt: timestamp("sent_at", { withTimezone: true }),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("notifications_booking_idx").on(table.bookingId),
        index("notifications_status_scheduled_idx").on(table.status, table.scheduledFor),
        check(
            "notifications_recipient_check",
            sql`${table.status} = 'skipped' OR ${table.recipientPhone} IS NOT NULL OR ${table.recipientEmail} IS NOT NULL`,
        ),
    ],
);

export const schedulerJobRuns = pgTable(
    "scheduler_job_runs",
    {
        id: idColumn(),
        jobName: varchar("job_name", { length: 120 }).notNull(),
        trigger: varchar("trigger", { length: 40 }).notNull().default("unknown"),
        status: varchar("status", { length: 32 }).notNull(),
        startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
        finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
        durationMs: integer("duration_ms").notNull(),
        result: jsonb("result").$type<Record<string, unknown> | null>(),
        errorMessage: text("error_message"),
        createdAt: createdAtColumn(),
        updatedAt: updatedAtColumn(),
    },
    (table) => [
        index("scheduler_job_runs_job_started_idx").on(table.jobName, table.startedAt),
        index("scheduler_job_runs_job_status_started_idx").on(table.jobName, table.status, table.startedAt),
        check("scheduler_job_runs_status_check", sql`${table.status} in ('success', 'failure')`),
        check("scheduler_job_runs_duration_check", sql`${table.durationMs} >= 0`),
    ],
);

export const locationsRelations = relations(locations, ({ many }) => ({
    businessHours: many(businessHours),
    barberLocations: many(barberLocations),
    shifts: many(shifts),
    bookings: many(bookings),
    blockedTimes: many(blockedTimes),
}));

export const barbersRelations = relations(barbers, ({ many, one }) => ({
    barberLocations: many(barberLocations),
    barberServices: many(barberServices),
    shifts: many(shifts),
    shiftOverrides: many(shiftOverrides),
    bookings: many(bookings),
    users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
    barber: one(barbers, {
        fields: [users.barberId],
        references: [barbers.id],
    }),
    sessions: many(userSessions),
    passwordResetTokens: many(passwordResetTokens),
    inviteTokens: many(userInviteTokens, { relationName: "invitee" }),
    createdInviteTokens: many(userInviteTokens, { relationName: "inviteCreator" }),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
    user: one(users, {
        fields: [userSessions.userId],
        references: [users.id],
    }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
    user: one(users, {
        fields: [passwordResetTokens.userId],
        references: [users.id],
    }),
}));

export const userInviteTokensRelations = relations(userInviteTokens, ({ one }) => ({
    user: one(users, {
        fields: [userInviteTokens.userId],
        references: [users.id],
        relationName: "invitee",
    }),
    createdByUser: one(users, {
        fields: [userInviteTokens.createdByUserId],
        references: [users.id],
        relationName: "inviteCreator",
    }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
    category: one(serviceCategories, {
        fields: [services.categoryId],
        references: [serviceCategories.id],
    }),
    barberServices: many(barberServices),
}));

export const serviceCategoriesRelations = relations(serviceCategories, ({ many }) => ({
    services: many(services),
}));

export const customersRelations = relations(customers, ({ many }) => ({
    bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
    customer: one(customers, {
        fields: [bookings.customerId],
        references: [customers.id],
    }),
    barber: one(barbers, {
        fields: [bookings.barberId],
        references: [barbers.id],
    }),
    location: one(locations, {
        fields: [bookings.locationId],
        references: [locations.id],
    }),
    services: many(bookingServices),
    notifications: many(notifications),
}));
