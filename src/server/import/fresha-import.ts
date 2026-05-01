import "dotenv/config";

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { and, asc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";

import { localDateTimeToUtc } from "../availability/time.ts";
import { createDatabaseClient } from "../db/client.ts";
import {
    barberLocations,
    barbers,
    bookingServices,
    bookings,
    customers,
    locations,
    serviceCategories,
    services,
    shifts,
} from "../db/schema.ts";

type ImportMode = "dry-run" | "apply";
type ImportStatus = "confirmed" | "cancelled" | "completed" | "no_show";
type ImportAction = "import" | "skip" | "duplicate" | "blocked";

interface FreshaExtraction {
    extractedAt?: string;
    window?: {
        from?: string;
        to?: string;
    };
    appointments?: FreshaAppointment[];
    schedules?: FreshaSchedule[];
}

interface FreshaAppointment {
    externalId?: string;
    status?: string;
    location?: string;
    locationName?: string;
    barber?: string;
    barberName?: string;
    customer?: {
        name?: string;
        phone?: string | null;
        email?: string | null;
    };
    customerName?: string;
    customerPhone?: string | null;
    customerEmail?: string | null;
    startLocal?: string;
    endLocal?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    services?: FreshaService[];
    notes?: string | null;
}

interface FreshaService {
    name?: string;
    category?: string;
    durationMinutes?: number;
    priceCents?: number;
    displayPrice?: string;
    priceType?: "fixed" | "from";
}

interface FreshaSchedule {
    externalId?: string;
    location?: string;
    locationName?: string;
    barber?: string;
    barberName?: string;
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
}

interface CatalogContext {
    locations: Array<{ id: string; slug: string; name: string }>;
    barbers: Array<{ id: string; slug: string; displayName: string; locationIds: string[] }>;
    services: Array<{
        id: string;
        name: string;
        categoryName: string;
        durationMinutes: number;
        priceCents: number;
        priceType: "fixed" | "from";
        displayPrice: string;
        sortOrder: number;
    }>;
}

interface ServiceSnapshot {
    serviceId: string | null;
    serviceName: string;
    categoryName: string;
    durationMinutes: number;
    priceCents: number;
    priceType: "fixed" | "from";
    displayPrice: string;
    sortOrder: number;
}

interface NormalizedAppointment {
    index: number;
    externalId: string;
    status: ImportStatus;
    localDate: string;
    localStart: string;
    localEnd: string;
    startTime: Date;
    endTime: Date;
    locationId: string;
    locationName: string;
    barberId: string;
    barberName: string;
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    customerFirstName: string;
    customerLastName: string;
    services: ServiceSnapshot[];
    totalDurationMinutes: number;
    notes: string | null;
    action: ImportAction;
    issues: string[];
}

interface NormalizedSchedule {
    index: number;
    externalId: string;
    locationId: string;
    locationName: string;
    barberId: string;
    barberName: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    action: ImportAction;
    issues: string[];
}

interface ImportReport {
    mode: ImportMode;
    inputPath: string;
    reportPath: string;
    window: { from: string; to: string };
    appointments: NormalizedAppointment[];
    schedules: NormalizedSchedule[];
    errors: string[];
}

const DEFAULT_INPUT = "output/fresha-import/fresha-extraction.json";
const DEFAULT_REPORT = "output/fresha-import/fresha-import-review.md";
const DEFAULT_WINDOW = { from: "2026-05-01", to: "2026-06-30" };
const TIME_ZONE = "America/Toronto";

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const mode = (args.mode ?? "dry-run") as ImportMode;

    if (mode !== "dry-run" && mode !== "apply") {
        throw new Error('Use "--mode=dry-run" or "--mode=apply".');
    }

    const inputPath = args.input ?? DEFAULT_INPUT;
    const reportPath = args.report ?? DEFAULT_REPORT;

    if (mode === "apply") {
        if (!args["approved-report"] || args["confirm-reviewed-report"] !== "true") {
            throw new Error(
                'Apply mode requires "--approved-report <path>" and "--confirm-reviewed-report=true".',
            );
        }

        await access(args["approved-report"]);
    }

    const extraction = parseExtraction(await readJson(inputPath));
    const window = {
        from: extraction.window?.from ?? DEFAULT_WINDOW.from,
        to: extraction.window?.to ?? DEFAULT_WINDOW.to,
    };
    assertLocalDate(window.from, "Import window from date is invalid.");
    assertLocalDate(window.to, "Import window to date is invalid.");

    const { db } = createDatabaseClient();
    const catalog = await loadCatalog(db);
    const report = await buildImportReport({
        db,
        mode,
        inputPath,
        reportPath,
        extraction,
        catalog,
        window,
    });

    await writeReport(report);

    const hasErrors = report.errors.length > 0 || report.appointments.some((row) => row.action === "blocked");
    if (mode === "apply") {
        if (hasErrors) {
            throw new Error("Import has blocking issues. Review the report and rerun dry-run after fixing them.");
        }

        await applyImport(db, report, extraction.extractedAt);
        const appliedReport = {
            ...report,
            mode,
        };
        await writeReport(appliedReport);
    }

    const summary = summarize(report);
    console.log(
        [
            `Fresha import ${mode} complete.`,
            `Appointments: ${summary.appointmentsToImport} import, ${summary.appointmentsSkipped} skip, ${summary.appointmentsDuplicate} duplicate, ${summary.appointmentsBlocked} blocked.`,
            `Schedules: ${summary.schedulesToImport} import, ${summary.schedulesSkipped} skip, ${summary.schedulesDuplicate} duplicate, ${summary.schedulesBlocked} blocked.`,
            `Report: ${path.resolve(reportPath)}`,
        ].join("\n"),
    );
}

async function buildImportReport(input: {
    db: ReturnType<typeof createDatabaseClient>["db"];
    mode: ImportMode;
    inputPath: string;
    reportPath: string;
    extraction: FreshaExtraction;
    catalog: CatalogContext;
    window: { from: string; to: string };
}): Promise<ImportReport> {
    const errors: string[] = [];
    const appointments: NormalizedAppointment[] = [];
    const schedules: NormalizedSchedule[] = [];

    for (const [index, appointment] of (input.extraction.appointments ?? []).entries()) {
        try {
            appointments.push(normalizeAppointment(index + 1, appointment, input.catalog, input.window));
        } catch (error) {
            errors.push(`Appointment ${index + 1}: ${messageFrom(error)}`);
        }
    }

    for (const [index, schedule] of (input.extraction.schedules ?? []).entries()) {
        try {
            schedules.push(normalizeSchedule(index + 1, schedule, input.catalog, input.window));
        } catch (error) {
            errors.push(`Schedule ${index + 1}: ${messageFrom(error)}`);
        }
    }

    flagInputAppointmentConflicts(appointments);

    for (const appointment of appointments) {
        if (appointment.action !== "import") continue;
        if (await existingImportedBooking(input.db, appointment)) {
            appointment.action = "duplicate";
            appointment.issues.push("Already imported.");
            continue;
        }

        const conflict = await existingConfirmedBookingConflict(input.db, appointment);
        if (conflict) {
            appointment.action = "blocked";
            appointment.issues.push(`Conflicts with existing booking ${conflict.id}.`);
        }
    }

    for (const schedule of schedules) {
        if (schedule.action !== "import") continue;
        if (await existingIdenticalShift(input.db, schedule)) {
            schedule.action = "duplicate";
            schedule.issues.push("Identical shift already exists.");
            continue;
        }

        if (await existingShiftConflict(input.db, schedule)) {
            schedule.action = "blocked";
            schedule.issues.push("Overlaps an existing active shift for this barber.");
        }
    }

    return {
        mode: input.mode,
        inputPath: input.inputPath,
        reportPath: input.reportPath,
        window: input.window,
        appointments,
        schedules,
        errors,
    };
}

function normalizeAppointment(
    index: number,
    appointment: FreshaAppointment,
    catalog: CatalogContext,
    window: { from: string; to: string },
): NormalizedAppointment {
    const status = normalizeStatus(appointment.status);
    const location = resolveLocation(appointment.location ?? appointment.locationName, catalog);
    const barber = resolveBarber(appointment.barber ?? appointment.barberName, catalog);
    const { localDate, localStart, localEnd } = appointmentLocalWindow(appointment);
    const startTime = localDateTimeToUtc(localDate, localStart, TIME_ZONE);
    const endTime = localDateTimeToUtc(localDate, localEnd, TIME_ZONE);
    const customerName = nonEmpty(
        appointment.customer?.name ?? appointment.customerName,
        "Customer name is required.",
    );
    const nameParts = splitCustomerName(customerName);
    const issues: string[] = [];
    let action: ImportAction = "import";

    if (localDate < window.from || localDate > window.to) {
        action = "skip";
        issues.push("Outside requested import window.");
    }

    if (status === "cancelled") {
        action = "skip";
        issues.push("Cancelled Fresha appointment does not block availability.");
    }

    if (startTime >= endTime) {
        throw new Error("Appointment start must be before end.");
    }

    if (!barber.locationIds.includes(location.id)) {
        action = "blocked";
        issues.push("Barber is not assigned to this location in launch data.");
    }

    const totalDurationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60_000);
    const services = normalizeServiceSnapshots(appointment.services, catalog, totalDurationMinutes);

    return {
        index,
        externalId: appointment.externalId?.trim() || derivedAppointmentId(appointment, index),
        status,
        localDate,
        localStart,
        localEnd,
        startTime,
        endTime,
        locationId: location.id,
        locationName: location.name,
        barberId: barber.id,
        barberName: barber.displayName,
        customerName,
        customerPhone: cleanOptional(appointment.customer?.phone ?? appointment.customerPhone),
        customerEmail: cleanOptional(appointment.customer?.email ?? appointment.customerEmail),
        customerFirstName: nameParts.firstName,
        customerLastName: nameParts.lastName,
        services,
        totalDurationMinutes,
        notes: cleanOptional(appointment.notes),
        action,
        issues,
    };
}

function normalizeSchedule(
    index: number,
    schedule: FreshaSchedule,
    catalog: CatalogContext,
    window: { from: string; to: string },
): NormalizedSchedule {
    const location = resolveLocation(schedule.location ?? schedule.locationName, catalog);
    const barber = resolveBarber(schedule.barber ?? schedule.barberName, catalog);
    const dayOfWeek = Number(schedule.dayOfWeek);
    const startTime = normalizeClock(nonEmpty(schedule.startTime, "Schedule start time is required."));
    const endTime = normalizeClock(nonEmpty(schedule.endTime, "Schedule end time is required."));
    const effectiveFrom = cleanOptional(schedule.effectiveFrom) ?? window.from;
    const effectiveTo = cleanOptional(schedule.effectiveTo) ?? window.to;
    const issues: string[] = [];
    let action: ImportAction = "import";

    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        throw new Error("Schedule weekday must be 0-6.");
    }

    if (startTime >= endTime) {
        throw new Error("Schedule start time must be before end time.");
    }

    assertLocalDate(effectiveFrom, "Schedule effective start date is invalid.");
    assertLocalDate(effectiveTo, "Schedule effective end date is invalid.");

    if (!barber.locationIds.includes(location.id)) {
        action = "blocked";
        issues.push("Barber is not assigned to this location in launch data.");
    }

    return {
        index,
        externalId: schedule.externalId?.trim() || `schedule-${index}`,
        locationId: location.id,
        locationName: location.name,
        barberId: barber.id,
        barberName: barber.displayName,
        dayOfWeek,
        startTime,
        endTime,
        effectiveFrom,
        effectiveTo,
        action,
        issues,
    };
}

async function applyImport(
    db: ReturnType<typeof createDatabaseClient>["db"],
    report: ImportReport,
    extractedAt: string | undefined,
) {
    const appointmentsToImport = report.appointments.filter((appointment) => appointment.action === "import");
    const schedulesToImport = report.schedules.filter((schedule) => schedule.action === "import");
    const importedAt = new Date();

    await db.transaction(async (tx) => {
        for (const schedule of schedulesToImport) {
            await tx.insert(shifts).values({
                barberId: schedule.barberId,
                locationId: schedule.locationId,
                dayOfWeek: schedule.dayOfWeek,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                effectiveFrom: schedule.effectiveFrom,
                effectiveTo: schedule.effectiveTo,
                active: true,
                createdAt: importedAt,
                updatedAt: importedAt,
            });
        }

        for (const appointment of appointmentsToImport) {
            const [customer] = await tx
                .insert(customers)
                .values({
                    firstName: appointment.customerFirstName,
                    lastName: appointment.customerLastName,
                    phoneE164: appointment.customerPhone,
                    email: appointment.customerEmail,
                    notes: appointment.notes,
                    createdAt: importedAt,
                    updatedAt: importedAt,
                })
                .returning({ id: customers.id });

            const [booking] = await tx
                .insert(bookings)
                .values({
                    customerId: customer.id,
                    barberId: appointment.barberId,
                    locationId: appointment.locationId,
                    status: appointment.status,
                    source: "imported",
                    startTime: appointment.startTime,
                    endTime: appointment.endTime,
                    totalDurationMinutes: appointment.totalDurationMinutes,
                    customerNotes: null,
                    internalNotes: buildInternalImportNote(appointment, report.window, extractedAt),
                    cancellationTokenHash: null,
                    rescheduleTokenHash: null,
                    createdAt: importedAt,
                    updatedAt: importedAt,
                })
                .returning({ id: bookings.id });

            await tx.insert(bookingServices).values(
                appointment.services.map((service) => ({
                    bookingId: booking.id,
                    serviceId: service.serviceId,
                    serviceName: service.serviceName,
                    categoryName: service.categoryName,
                    durationMinutes: service.durationMinutes,
                    priceCents: service.priceCents,
                    priceType: service.priceType,
                    displayPrice: service.displayPrice,
                    sortOrder: service.sortOrder,
                    createdAt: importedAt,
                })),
            );
        }
    });
}

async function loadCatalog(db: ReturnType<typeof createDatabaseClient>["db"]): Promise<CatalogContext> {
    const [locationRows, barberRows, barberLocationRows, serviceRows] = await Promise.all([
        db
            .select({
                id: locations.id,
                slug: locations.slug,
                name: locations.name,
            })
            .from(locations)
            .where(eq(locations.active, true))
            .orderBy(asc(locations.sortOrder), asc(locations.name)),
        db
            .select({
                id: barbers.id,
                slug: barbers.slug,
                displayName: barbers.displayName,
            })
            .from(barbers)
            .where(eq(barbers.active, true))
            .orderBy(asc(barbers.sortOrder), asc(barbers.displayName)),
        db.select({ barberId: barberLocations.barberId, locationId: barberLocations.locationId }).from(barberLocations),
        db
            .select({
                id: services.id,
                name: services.name,
                categoryName: serviceCategories.name,
                durationMinutes: services.durationMinutes,
                priceCents: services.priceCents,
                priceType: services.priceType,
                displayPrice: services.displayPrice,
                sortOrder: services.sortOrder,
            })
            .from(services)
            .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
            .where(eq(services.active, true))
            .orderBy(asc(services.sortOrder), asc(services.name)),
    ]);

    return {
        locations: locationRows,
        barbers: barberRows.map((barber) => ({
            ...barber,
            locationIds: barberLocationRows
                .filter((assignment) => assignment.barberId === barber.id)
                .map((assignment) => assignment.locationId),
        })),
        services: serviceRows,
    };
}

async function existingImportedBooking(
    db: ReturnType<typeof createDatabaseClient>["db"],
    appointment: NormalizedAppointment,
) {
    const [row] = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
            and(
                eq(bookings.source, "imported"),
                eq(bookings.barberId, appointment.barberId),
                eq(bookings.locationId, appointment.locationId),
                eq(bookings.startTime, appointment.startTime),
                sql`${bookings.internalNotes} ilike ${`%Fresha import ID: ${escapeLike(appointment.externalId)}%`}`,
            ),
        )
        .limit(1);

    return row ?? null;
}

async function existingConfirmedBookingConflict(
    db: ReturnType<typeof createDatabaseClient>["db"],
    appointment: NormalizedAppointment,
) {
    if (appointment.status !== "confirmed") {
        return null;
    }

    const [row] = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
            and(
                eq(bookings.status, "confirmed"),
                eq(bookings.barberId, appointment.barberId),
                lt(bookings.startTime, appointment.endTime),
                gt(bookings.endTime, appointment.startTime),
            ),
        )
        .limit(1);

    return row ?? null;
}

async function existingIdenticalShift(
    db: ReturnType<typeof createDatabaseClient>["db"],
    schedule: NormalizedSchedule,
) {
    const [row] = await db
        .select({ id: shifts.id })
        .from(shifts)
        .where(
            and(
                eq(shifts.active, true),
                eq(shifts.barberId, schedule.barberId),
                eq(shifts.locationId, schedule.locationId),
                eq(shifts.dayOfWeek, schedule.dayOfWeek),
                eq(shifts.startTime, schedule.startTime),
                eq(shifts.endTime, schedule.endTime),
                sql`${shifts.effectiveFrom} is not distinct from ${schedule.effectiveFrom}`,
                sql`${shifts.effectiveTo} is not distinct from ${schedule.effectiveTo}`,
            ),
        )
        .limit(1);

    return row ?? null;
}

async function existingShiftConflict(
    db: ReturnType<typeof createDatabaseClient>["db"],
    schedule: NormalizedSchedule,
) {
    const [row] = await db
        .select({ id: shifts.id })
        .from(shifts)
        .where(
            and(
                eq(shifts.active, true),
                eq(shifts.barberId, schedule.barberId),
                eq(shifts.dayOfWeek, schedule.dayOfWeek),
                lt(shifts.startTime, schedule.endTime),
                sql`${shifts.endTime} > ${schedule.startTime}`,
                or(sql`${shifts.effectiveTo} is null`, sql`${shifts.effectiveTo} >= ${schedule.effectiveFrom}`),
                or(sql`${shifts.effectiveFrom} is null`, sql`${shifts.effectiveFrom} <= ${schedule.effectiveTo}`),
            ),
        )
        .limit(1);

    return row ?? null;
}

function flagInputAppointmentConflicts(appointments: NormalizedAppointment[]) {
    const imports = appointments.filter((appointment) => appointment.action === "import" && appointment.status === "confirmed");

    for (let index = 0; index < imports.length; index += 1) {
        for (let compareIndex = index + 1; compareIndex < imports.length; compareIndex += 1) {
            const left = imports[index];
            const right = imports[compareIndex];
            const overlaps =
                left.barberId === right.barberId &&
                left.startTime < right.endTime &&
                left.endTime > right.startTime;

            if (!overlaps) continue;

            left.action = "blocked";
            right.action = "blocked";
            left.issues.push(`Overlaps extraction row ${right.index}.`);
            right.issues.push(`Overlaps extraction row ${left.index}.`);
        }
    }
}

async function writeReport(report: ImportReport) {
    await mkdir(path.dirname(report.reportPath), { recursive: true });
    await writeFile(report.reportPath, renderMarkdownReport(report), "utf-8");
}

function renderMarkdownReport(report: ImportReport) {
    const summary = summarize(report);
    const lines = [
        "# Fresha Import Review Report",
        "",
        `Generated: ${new Date().toISOString()}`,
        `Mode: ${report.mode}`,
        `Input: ${report.inputPath}`,
        `Window: ${report.window.from} to ${report.window.to}`,
        "",
        "## Summary",
        "",
        `- Appointments: ${summary.appointmentsToImport} import, ${summary.appointmentsSkipped} skip, ${summary.appointmentsDuplicate} duplicate, ${summary.appointmentsBlocked} blocked.`,
        `- Schedules: ${summary.schedulesToImport} import, ${summary.schedulesSkipped} skip, ${summary.schedulesDuplicate} duplicate, ${summary.schedulesBlocked} blocked.`,
        `- Errors: ${report.errors.length}.`,
        "",
    ];

    if (report.errors.length) {
        lines.push("## Blocking Parse Errors", "", ...report.errors.map((error) => `- ${error}`), "");
    }

    lines.push(
        "## Appointments",
        "",
        "| Row | Action | Date | Time | Location | Barber | Customer | Contact | Services | Issues |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ...report.appointments.map((appointment) =>
            [
                appointment.index,
                appointment.action,
                appointment.localDate,
                `${appointment.localStart}-${appointment.localEnd}`,
                appointment.locationName,
                appointment.barberName,
                appointment.customerName,
                contactSummary(appointment),
                appointment.services.map((service) => service.serviceName).join(", "),
                appointment.issues.join("; "),
            ]
                .map(markdownCell)
                .join(" | ")
                .replace(/^/, "| ")
                .replace(/$/, " |"),
        ),
        "",
        "## Schedules",
        "",
        "| Row | Action | Weekday | Time | Effective | Location | Barber | Issues |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ...report.schedules.map((schedule) =>
            [
                schedule.index,
                schedule.action,
                String(schedule.dayOfWeek),
                `${schedule.startTime}-${schedule.endTime}`,
                `${schedule.effectiveFrom ?? ""} to ${schedule.effectiveTo ?? ""}`,
                schedule.locationName,
                schedule.barberName,
                schedule.issues.join("; "),
            ]
                .map(markdownCell)
                .join(" | ")
                .replace(/^/, "| ")
                .replace(/$/, " |"),
        ),
        "",
        "## Review Gate",
        "",
        "Apply mode requires this report path plus `--confirm-reviewed-report=true`.",
        "Do not apply until the appointment, schedule, customer, barber, and conflict counts above are human-reviewed.",
        "",
    );

    return `${lines.join("\n")}\n`;
}

function summarize(report: ImportReport) {
    const count = <T extends { action: ImportAction }>(rows: T[], action: ImportAction) =>
        rows.filter((row) => row.action === action).length;

    return {
        appointmentsToImport: count(report.appointments, "import"),
        appointmentsSkipped: count(report.appointments, "skip"),
        appointmentsDuplicate: count(report.appointments, "duplicate"),
        appointmentsBlocked: count(report.appointments, "blocked"),
        schedulesToImport: count(report.schedules, "import"),
        schedulesSkipped: count(report.schedules, "skip"),
        schedulesDuplicate: count(report.schedules, "duplicate"),
        schedulesBlocked: count(report.schedules, "blocked"),
    };
}

function normalizeServiceSnapshots(
    inputServices: FreshaService[] | undefined,
    catalog: CatalogContext,
    totalDurationMinutes: number,
): ServiceSnapshot[] {
    const rawServices = inputServices?.length
        ? inputServices
        : [{ name: "Imported Fresha service", durationMinutes: totalDurationMinutes, displayPrice: "Imported" }];
    const fallbackDuration = rawServices.length > 1
        ? Math.max(15, Math.round(totalDurationMinutes / rawServices.length / 15) * 15)
        : totalDurationMinutes;

    return rawServices.map((service, index) => {
        const name = service.name?.trim() || "Imported Fresha service";
        const catalogService = catalog.services.find((candidate) => normalizeKey(candidate.name) === normalizeKey(name));

        return {
            serviceId: catalogService?.id ?? null,
            serviceName: name,
            categoryName: service.category?.trim() || catalogService?.categoryName || "Imported Fresha",
            durationMinutes: positiveInteger(service.durationMinutes) ?? catalogService?.durationMinutes ?? fallbackDuration,
            priceCents: nonNegativeInteger(service.priceCents) ?? catalogService?.priceCents ?? 0,
            priceType: service.priceType ?? catalogService?.priceType ?? "fixed",
            displayPrice: service.displayPrice?.trim() || catalogService?.displayPrice || "Imported",
            sortOrder: index,
        };
    });
}

function resolveLocation(value: string | undefined, catalog: CatalogContext) {
    const key = normalizeKey(nonEmpty(value, "Location is required."));
    const location = catalog.locations.find((candidate) =>
        [candidate.id, candidate.slug, candidate.name].some((candidateValue) => normalizeKey(candidateValue) === key),
    );

    if (!location) {
        throw new Error(`Unknown location "${value}".`);
    }

    return location;
}

function resolveBarber(value: string | undefined, catalog: CatalogContext) {
    const key = normalizeKey(nonEmpty(value, "Barber is required."));
    const barber = catalog.barbers.find((candidate) =>
        [candidate.id, candidate.slug, candidate.displayName].some((candidateValue) => normalizeKey(candidateValue) === key),
    );

    if (!barber) {
        throw new Error(`Unknown barber "${value}".`);
    }

    return barber;
}

function appointmentLocalWindow(appointment: FreshaAppointment) {
    if (appointment.startLocal && appointment.endLocal) {
        const start = splitLocalDateTime(appointment.startLocal, "Appointment startLocal is invalid.");
        const end = splitLocalDateTime(appointment.endLocal, "Appointment endLocal is invalid.");

        if (start.date !== end.date) {
            throw new Error("Overnight Fresha appointments are not supported by this importer.");
        }

        return {
            localDate: start.date,
            localStart: start.time,
            localEnd: end.time,
        };
    }

    const localDate = nonEmpty(appointment.date, "Appointment date is required.");
    assertLocalDate(localDate, "Appointment date is invalid.");

    return {
        localDate,
        localStart: normalizeClock(nonEmpty(appointment.startTime, "Appointment start time is required.")),
        localEnd: normalizeClock(nonEmpty(appointment.endTime, "Appointment end time is required.")),
    };
}

function splitLocalDateTime(value: string, message: string) {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);

    if (!match) {
        throw new Error(message);
    }

    assertLocalDate(match[1], message);
    return {
        date: match[1],
        time: normalizeClock(match[2]),
    };
}

function normalizeStatus(value: string | undefined): ImportStatus {
    const key = normalizeKey(value || "confirmed").replace("-", "_");

    if (key === "confirmed" || key === "completed" || key === "cancelled" || key === "no_show") {
        return key;
    }

    if (key === "canceled") {
        return "cancelled";
    }

    return "confirmed";
}

function normalizeClock(value: string) {
    const match = value.trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);

    if (!match) {
        throw new Error(`Invalid time "${value}".`);
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour > 23 || minute > 59 || minute % 15 !== 0) {
        throw new Error(`Time "${value}" must be a valid 15-minute clock value.`);
    }

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function assertLocalDate(value: string, message: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(message);
    }
}

function splitCustomerName(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts[0] ?? "Imported",
        lastName: parts.slice(1).join(" ") || "Fresha",
    };
}

function buildInternalImportNote(
    appointment: NormalizedAppointment,
    window: { from: string; to: string },
    extractedAt: string | undefined,
) {
    return [
        `Fresha import ID: ${appointment.externalId}`,
        `Fresha import window: ${window.from} to ${window.to}`,
        extractedAt ? `Fresha extracted at: ${extractedAt}` : null,
        appointment.notes ? `Fresha notes: ${appointment.notes}` : null,
    ]
        .filter(Boolean)
        .join("\n");
}

function derivedAppointmentId(appointment: FreshaAppointment, index: number) {
    return normalizeKey(
        [
            appointment.location ?? appointment.locationName,
            appointment.barber ?? appointment.barberName,
            appointment.customer?.name ?? appointment.customerName,
            appointment.startLocal ?? `${appointment.date ?? ""}T${appointment.startTime ?? ""}`,
            index,
        ]
            .filter(Boolean)
            .join("|"),
    );
}

function contactSummary(appointment: NormalizedAppointment) {
    const phone = appointment.customerPhone ? "phone" : "no phone";
    const email = appointment.customerEmail ? "email" : "no email";
    return `${phone}, ${email}`;
}

function markdownCell(value: unknown) {
    return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function normalizeKey(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function cleanOptional(value: unknown) {
    if (typeof value !== "string") return null;
    const cleaned = value.trim();
    return cleaned.length ? cleaned : null;
}

function nonEmpty(value: unknown, message: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(message);
    }

    return value.trim();
}

function positiveInteger(value: unknown) {
    return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function nonNegativeInteger(value: unknown) {
    return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function escapeLike(value: string) {
    return value.replace(/[%_\\]/g, "\\$&");
}

function parseExtraction(value: unknown): FreshaExtraction {
    if (!value || typeof value !== "object") {
        throw new Error("Extraction JSON must be an object.");
    }

    return value as FreshaExtraction;
}

async function readJson(filePath: string) {
    const text = await readFile(filePath, "utf-8");
    return JSON.parse(text.replace(/^\uFEFF/, ""));
}

function parseArgs(argv: string[]) {
    const args: Record<string, string> = {};

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith("--")) continue;

        const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
        const nextValue = argv[index + 1];

        if (inlineValue !== undefined) {
            args[rawKey] = inlineValue;
            continue;
        }

        if (nextValue && !nextValue.startsWith("--")) {
            args[rawKey] = nextValue;
            index += 1;
            continue;
        }

        args[rawKey] = "true";
    }

    return args;
}

function messageFrom(error: unknown) {
    return error instanceof Error ? error.message : "Unknown import error.";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(messageFrom(error));
        process.exit(1);
    });
}
