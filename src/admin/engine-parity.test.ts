/**
 * Engine-parity PROPERTY tests.
 *
 * The admin Team Week grid resolves a barber's day with resolveBarberDay
 * (src/admin/admin-utils.ts); customers book against getAvailableSlots
 * (src/server/availability/availability-engine.ts). If the two ever disagree,
 * the grid lies: it can say "off" while the engine still sells the slot.
 * These tests generate N seeded random worlds, project each world into BOTH
 * input shapes, and assert two invariants for every barber at every location
 * they are assigned to:
 *
 *   1. BOOKING-SAFETY - if the grid reports no working window for a
 *      barber+location (and, day-level, working === false), the engine must
 *      return ZERO slots for that barber+location.
 *   2. CONTAINMENT - every slot the engine offers must START inside some
 *      window the grid shows for that barber+location (Toronto local time).
 *
 * DIRECTION (what this file does and does NOT prove): these invariants prove the
 * BOOKING-SAFETY direction only - the grid never says "off" while the engine
 * still sells, and the engine never sells outside a grid window. They
 * deliberately do NOT assert the reverse (grid ⊆ engine): confirmed bookings,
 * partial blocked times, and windows shorter than the service legitimately let
 * the engine offer FEWER slots than the grid shows as working. That is safe for
 * customers (they cannot over-book); its only cost is an owner occasionally
 * seeing a "working" barber with no public slots, which is an admin-trust nit,
 * not an oversell.
 *
 * Bridge rules (mirroring production exactly):
 * - These projections are hand-built to mirror production's data SHAPES; the
 *   real repository assembly (buildAvailabilityData plus the Drizzle ORDER BY /
 *   WHERE clauses in public-booking/repository.ts) is exercised end-to-end by
 *   the Team Week lifecycle QA (npm run qa:teamweek-lifecycle), which books
 *   through the live engine. This file pins the semantics; that runner pins the
 *   wiring.
 * - Engine shiftOverrides are sorted like public-booking/repository.ts:
 *   (overrideDate, overrideType enum order, id). The shift_override_type
 *   pgEnum is ["add", "remove", "not_working"] (src/server/db/schema.ts), so
 *   adds always reach the engine BEFORE removes. Every production
 *   getAvailableSlots call site (public booking, booking-service, admin
 *   bookings-service) loads overrides through that repository, so this is
 *   what "booking truth" actually sees. See the "override order" tests below
 *   for why this matters.
 * - Admin-side overrides are SHUFFLED per iteration: the grid resolver must
 *   be order-insensitive, and this proves it stays that way.
 * - Blocked times / bookings are minted with the engine's own
 *   localDateTimeToUtc and handed to the grid as ISO strings, so both sides
 *   agree on the underlying instants.
 * - Business hours are open 00:00-23:59 every day at both locations so hours
 *   never clip below shift windows (the engine only uses business hours as a
 *   closed-day gate; it does not clip windows to open/close).
 * - Fixed now far before the target week, minimumNoticeMinutes 0 and
 *   maxAdvanceDays 365, so notice/advance never clip. Target dates live in
 *   the week of 2026-07-20 (July: no DST edge in America/Toronto).
 */
import { describe, expect, test } from "vitest";

import { getAvailableSlots } from "../server/availability/availability-engine";
import { localDateTimeToUtc } from "../server/availability/time";
import type { AvailabilityData, AvailabilityRequest } from "../server/availability/types";
import { shiftOverrideTypeEnum } from "../server/db/schema";
import { resolveBarberDay } from "./admin-utils";
import type {
    AdminBarberOption,
    AdminBlockedTime,
    AdminBlockedTimeScope,
    AdminSchedule,
    AdminShift,
    AdminShiftOverride,
    AdminShiftOverrideType,
} from "./types";

const TIME_ZONE = "America/Toronto";
const SERVICE_ID = "svc-haircut";
const SERVICE_DURATION_MINUTES = 30;
/** Far before the target week so the notice threshold never clips a slot. */
const NOW = new Date("2026-07-06T12:00:00.000Z");
const EGLINTON = "loc-eglinton";
const MILLWOOD = "loc-millwood";
const LOCATIONS: AdminSchedule["locations"] = [
    { id: EGLINTON, name: "Leaside Fades Eglinton", sortOrder: 1 },
    { id: MILLWOOD, name: "Leaside Fades Millwood", sortOrder: 2 },
];
/** Mon 2026-07-20 .. Sun 2026-07-26 - every weekday, no DST transition. */
const WEEK_MONDAY = "2026-07-20";
const WEEK_DATES = Array.from({ length: 7 }, (_, index) => addDaysLocal(WEEK_MONDAY, index));

/** DERIVED from the real shift_override_type pgEnum (never re-hardcoded) so this
 *  bridge cannot silently assume an order production doesn't have. Postgres sorts
 *  the public-booking repository's `asc(shiftOverrides.overrideType)` by this
 *  pgEnum's DEFINITION order, which is the sole mechanism guaranteeing `add` rows
 *  fold into the order-sensitive engine BEFORE `remove` rows. The "override row
 *  order" describe block pins that order so a regression to it fails HERE, where
 *  the parity test that depends on it can see it. */
const OVERRIDE_TYPE_ENUM_ORDER = Object.fromEntries(
    shiftOverrideTypeEnum.enumValues.map((value, index) => [value, index]),
) as Record<AdminShiftOverrideType, number>;

// ---------------------------------------------------------------------------
// Seeded PRNG - deterministic, reproducible failures.
// ---------------------------------------------------------------------------

type Rand = () => number;

function mulberry32(seed: number): Rand {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomInt(rand: Rand, maxExclusive: number) {
    return Math.floor(rand() * maxExclusive);
}

function pick<T>(rand: Rand, items: readonly T[]): T {
    return items[randomInt(rand, items.length)];
}

function chance(rand: Rand, probability: number) {
    return rand() < probability;
}

function shuffle<T>(items: readonly T[], rand: Rand): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = randomInt(rand, index + 1);
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
}

// ---------------------------------------------------------------------------
// Small date/time helpers (UTC-noon-free local date math, HH:MM conversions).
// ---------------------------------------------------------------------------

function addDaysLocal(localDate: string, days: number) {
    const [year, month, day] = localDate.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + days));
    const paddedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    const paddedDay = String(shifted.getUTCDate()).padStart(2, "0");
    return `${shifted.getUTCFullYear()}-${paddedMonth}-${paddedDay}`;
}

function weekdayOf(localDate: string) {
    const [year, month, day] = localDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function clockToMinutes(time: string) {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
}

function minutesToClock(totalMinutes: number) {
    const hour = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minute = String(totalMinutes % 60).padStart(2, "0");
    return `${hour}:${minute}`;
}

const torontoClockFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

/** Engine slot instant -> Toronto local minutes-from-midnight, mirroring the
 *  engine's own getLocalTime formatting. */
function torontoMinutesOf(instant: Date) {
    const parts = torontoClockFormatter.formatToParts(instant);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
}

/** 15-minute-aligned window inside the day, start 06:00-20:45, end <= 23:45. */
function randomWindow(rand: Rand) {
    const startMinutes = 6 * 60 + randomInt(rand, 60) * 15;
    const durationSteps = 2 + randomInt(rand, 24);
    const endMinutes = Math.min(startMinutes + durationSteps * 15, 23 * 60 + 45);
    return {
        startTime: minutesToClock(startMinutes),
        endTime: minutesToClock(Math.max(endMinutes, startMinutes + 15)),
    };
}

// ---------------------------------------------------------------------------
// World model: one neutral fixture projected into BOTH input shapes.
// ---------------------------------------------------------------------------

interface WorldBarber {
    id: string;
    locationIds: string[];
}

interface WorldShift {
    id: string;
    barberId: string;
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    active: boolean;
}

interface WorldOverride {
    id: string;
    barberId: string;
    locationId: string | null;
    overrideDate: string;
    overrideType: AdminShiftOverrideType;
    startTime: string | null;
    endTime: string | null;
}

interface WorldBlock {
    id: string;
    scope: AdminBlockedTimeScope;
    barberId: string | null;
    locationId: string | null;
    startTime: Date;
    endTime: Date;
}

interface WorldBooking {
    barberId: string;
    locationId: string;
    status: "confirmed" | "cancelled";
    startTime: Date;
    endTime: Date;
}

interface World {
    date: string;
    barbers: WorldBarber[];
    shifts: WorldShift[];
    overrides: WorldOverride[];
    blocks: WorldBlock[];
    bookings: WorldBooking[];
}

/** Client-grid projection. Overrides are optionally shuffled: the resolver
 *  must not care about array order. */
function projectSchedule(world: World, shuffleRand?: Rand): AdminSchedule {
    const overrides = shuffleRand ? shuffle(world.overrides, shuffleRand) : [...world.overrides];
    return {
        locations: LOCATIONS,
        barbers: world.barbers.map<AdminBarberOption>((barber, index) => ({
            id: barber.id,
            displayName: `Barber ${index + 1}`,
            locationIds: [...barber.locationIds],
            sortOrder: index + 1,
        })),
        shifts: world.shifts.map<AdminShift>((shift) => ({
            id: shift.id,
            barberId: shift.barberId,
            locationId: shift.locationId,
            dayOfWeek: shift.dayOfWeek,
            startTime: shift.startTime,
            endTime: shift.endTime,
            effectiveFrom: shift.effectiveFrom,
            effectiveTo: shift.effectiveTo,
            active: shift.active,
        })),
        shiftOverrides: overrides.map<AdminShiftOverride>((override) => ({
            id: override.id,
            barberId: override.barberId,
            locationId: override.locationId,
            overrideDate: override.overrideDate,
            overrideType: override.overrideType,
            startTime: override.startTime,
            endTime: override.endTime,
            reason: null,
        })),
        blockedTimes: world.blocks.map<AdminBlockedTime>((block) => ({
            id: block.id,
            scope: block.scope,
            barberId: block.barberId,
            locationId: block.locationId,
            startTime: block.startTime.toISOString(),
            endTime: block.endTime.toISOString(),
            reason: null,
            createdByUserId: null,
        })),
    };
}

/** Exactly the deterministic row order the public-booking repository feeds
 *  the engine: (override_date, override_type enum order, id). */
function sortOverridesLikeBookingRepository(overrides: readonly WorldOverride[]): WorldOverride[] {
    return [...overrides].sort(
        (a, b) =>
            a.overrideDate.localeCompare(b.overrideDate) ||
            OVERRIDE_TYPE_ENUM_ORDER[a.overrideType] - OVERRIDE_TYPE_ENUM_ORDER[b.overrideType] ||
            a.id.localeCompare(b.id),
    );
}

/** Server-engine projection ("booking truth"). */
function projectAvailabilityData(
    world: World,
    overrideOrder: "booking-repository" | "as-given" = "booking-repository",
): AvailabilityData {
    const orderedOverrides =
        overrideOrder === "booking-repository"
            ? sortOverridesLikeBookingRepository(world.overrides)
            : [...world.overrides];
    return {
        businessHours: LOCATIONS.flatMap((location) =>
            Array.from({ length: 7 }, (_, dayOfWeek) => ({
                locationId: location.id,
                dayOfWeek,
                openTime: "00:00",
                closeTime: "23:59",
                closed: false,
            })),
        ),
        barbers: world.barbers.map((barber, index) => ({
            id: barber.id,
            active: true,
            sortOrder: index + 1,
        })),
        barberLocations: world.barbers.flatMap((barber) =>
            barber.locationIds.map((locationId) => ({ barberId: barber.id, locationId })),
        ),
        services: [{ id: SERVICE_ID, durationMinutes: SERVICE_DURATION_MINUTES, active: true }],
        shifts: world.shifts.map((shift) => ({
            barberId: shift.barberId,
            locationId: shift.locationId,
            dayOfWeek: shift.dayOfWeek,
            startTime: shift.startTime,
            endTime: shift.endTime,
            active: shift.active,
            effectiveFrom: shift.effectiveFrom,
            effectiveTo: shift.effectiveTo,
        })),
        shiftOverrides: orderedOverrides.map((override) => ({
            barberId: override.barberId,
            overrideDate: override.overrideDate,
            overrideType: override.overrideType,
            locationId: override.locationId,
            startTime: override.startTime,
            endTime: override.endTime,
        })),
        bookings: world.bookings.map((booking) => ({
            barberId: booking.barberId,
            locationId: booking.locationId,
            status: booking.status,
            startTime: booking.startTime,
            endTime: booking.endTime,
        })),
        blockedTimes: world.blocks.map((block) => ({
            scope: block.scope,
            startTime: block.startTime,
            endTime: block.endTime,
            barberId: block.barberId,
            locationId: block.locationId,
        })),
    };
}

function engineRequest(date: string, locationId: string): AvailabilityRequest {
    return {
        locationId,
        serviceIds: [SERVICE_ID],
        date,
        now: NOW,
        timeZone: TIME_ZONE,
        slotIntervalMinutes: 15,
        minimumNoticeMinutes: 0,
        maxAdvanceDays: 365,
    };
}

// ---------------------------------------------------------------------------
// Random world generator.
// ---------------------------------------------------------------------------

type WorldShiftWindow = { startTime: string; endTime: string; locationId: string };

/** Mirror of the engine's shiftApplies (active + weekday + effective range) so
 *  the generator can aim overrides at windows that ACTUALLY apply on the target
 *  date - which is what deliberately exercises interior window splits (a remove
 *  carving the middle of a shift) and cover days, instead of leaving them to
 *  chance. */
function shiftAppliesOnDate(shift: WorldShift, localDate: string, weekday: number) {
    return (
        shift.active &&
        shift.dayOfWeek === weekday &&
        (!shift.effectiveFrom || localDate >= shift.effectiveFrom) &&
        (!shift.effectiveTo || localDate <= shift.effectiveTo)
    );
}

function generateWorld(rand: Rand, iteration: number): World {
    const date = pick(rand, WEEK_DATES);
    const targetWeekday = weekdayOf(date);
    const barberCount = 2 + (chance(rand, 0.5) ? 1 : 0);
    const barbers: WorldBarber[] = Array.from({ length: barberCount }, (_, index) => ({
        id: `barber-${index + 1}`,
        locationIds: chance(rand, 0.6)
            ? LOCATIONS.map((location) => location.id)
            : [pick(rand, LOCATIONS).id],
    }));

    let idCounter = 0;
    const nextId = (prefix: string) => `${prefix}-${iteration}-${(idCounter += 1)}`;

    const shifts: WorldShift[] = [];
    for (const barber of barbers) {
        const addShiftOn = (dayOfWeek: number) => {
            const window = randomWindow(rand);
            const effective = randomEffectiveRange(rand, date);
            shifts.push({
                id: nextId("shift"),
                barberId: barber.id,
                locationId: pick(rand, barber.locationIds),
                dayOfWeek,
                startTime: window.startTime,
                endTime: window.endTime,
                effectiveFrom: effective.effectiveFrom,
                effectiveTo: effective.effectiveTo,
                active: chance(rand, 0.93),
            });
        };
        if (chance(rand, 0.85)) {
            const windowCount = 1 + (chance(rand, 0.3) ? 1 : 0);
            for (let index = 0; index < windowCount; index += 1) {
                addShiftOn(targetWeekday);
            }
        }
        for (let noise = 0; noise < 2; noise += 1) {
            if (chance(rand, 0.5)) {
                addShiftOn(randomInt(rand, 7));
            }
        }
    }

    // Windows that actually apply on the target date (post effective-range) so
    // overrides can interact with real shift geometry rather than float at
    // random.
    const targetWindowsByBarber = new Map<string, WorldShiftWindow[]>();
    for (const barber of barbers) {
        targetWindowsByBarber.set(
            barber.id,
            shifts
                .filter((shift) => shift.barberId === barber.id && shiftAppliesOnDate(shift, date, targetWeekday))
                .map((shift) => ({ startTime: shift.startTime, endTime: shift.endTime, locationId: shift.locationId })),
        );
    }

    const overrides: WorldOverride[] = [];

    // Cover day: the exact add@cover + remove@home shape replaceAdminDayShift
    // writes - move a multi-location barber off one location's shift onto
    // another for the day. Both sides must land the barber at the cover
    // location and zero the home location.
    for (const barber of barbers) {
        if (barber.locationIds.length < 2 || !chance(rand, 0.45)) {
            continue;
        }
        const home = (targetWindowsByBarber.get(barber.id) ?? []).find((window) =>
            barber.locationIds.includes(window.locationId),
        );
        const coverLocation = home
            ? barber.locationIds.find((locationId) => locationId !== home.locationId)
            : undefined;
        if (!home || !coverLocation) {
            continue;
        }
        overrides.push({
            id: nextId("override"),
            barberId: barber.id,
            locationId: coverLocation,
            overrideDate: date,
            overrideType: "add",
            startTime: home.startTime,
            endTime: home.endTime,
        });
        overrides.push({
            id: nextId("override"),
            barberId: barber.id,
            locationId: home.locationId,
            overrideDate: date,
            overrideType: "remove",
            startTime: home.startTime,
            endTime: home.endTime,
        });
    }

    const overrideCount = pick(rand, [0, 1, 1, 2, 2, 3, 4] as const);
    for (let index = 0; index < overrideCount; index += 1) {
        const barber = pick(rand, barbers);
        overrides.push(
            randomOverrideFor(rand, barber, date, nextId, targetWindowsByBarber.get(barber.id) ?? []),
        );
    }
    // Overrides on neighbouring dates: both sides must ignore them entirely.
    const neighbourCount = randomInt(rand, 3);
    for (let index = 0; index < neighbourCount; index += 1) {
        const neighbourDate = addDaysLocal(date, chance(rand, 0.5) ? -1 : 1);
        overrides.push(randomOverrideFor(rand, pick(rand, barbers), neighbourDate, nextId, []));
    }

    const blocks: WorldBlock[] = [];
    const blockCount = pick(rand, [0, 0, 1, 1, 2, 3] as const);
    for (let index = 0; index < blockCount; index += 1) {
        blocks.push(randomBlockFor(rand, barbers, date, nextId));
    }
    if (chance(rand, 0.3)) {
        // A block on an unrelated date: both sides must ignore it.
        const window = randomWindow(rand);
        const farDate = addDaysLocal(date, -3);
        blocks.push({
            id: nextId("block"),
            scope: "business",
            barberId: null,
            locationId: null,
            startTime: localDateTimeToUtc(farDate, window.startTime, TIME_ZONE),
            endTime: localDateTimeToUtc(farDate, window.endTime, TIME_ZONE),
        });
    }

    const bookings: WorldBooking[] = [];
    const bookingCount = pick(rand, [0, 0, 1, 1, 2, 3] as const);
    for (let index = 0; index < bookingCount; index += 1) {
        const barber = pick(rand, barbers);
        const startMinutes = 8 * 60 + randomInt(rand, 48) * 15;
        const startTime = localDateTimeToUtc(date, minutesToClock(startMinutes), TIME_ZONE);
        bookings.push({
            barberId: barber.id,
            locationId: pick(rand, barber.locationIds),
            status: chance(rand, 0.75) ? "confirmed" : "cancelled",
            startTime,
            endTime: new Date(startTime.getTime() + SERVICE_DURATION_MINUTES * 60_000),
        });
    }

    return { date, barbers, shifts, overrides, blocks, bookings };
}

function randomEffectiveRange(rand: Rand, date: string): { effectiveFrom: string | null; effectiveTo: string | null } {
    const roll = rand();
    if (roll < 0.6) {
        return { effectiveFrom: null, effectiveTo: null };
    }
    if (roll < 0.72) {
        // Applies: starts on or before the target date (offset 0..10).
        return { effectiveFrom: addDaysLocal(date, -randomInt(rand, 11)), effectiveTo: null };
    }
    if (roll < 0.8) {
        // Excluded: starts after the target date.
        return { effectiveFrom: addDaysLocal(date, 1 + randomInt(rand, 5)), effectiveTo: null };
    }
    if (roll < 0.9) {
        // Applies: ends on or after the target date (offset 0..10).
        return { effectiveFrom: null, effectiveTo: addDaysLocal(date, randomInt(rand, 11)) };
    }
    // Excluded: ended before the target date.
    return { effectiveFrom: null, effectiveTo: addDaysLocal(date, -(1 + randomInt(rand, 5))) };
}

function randomOverrideFor(
    rand: Rand,
    barber: WorldBarber,
    overrideDate: string,
    nextId: (prefix: string) => string,
    applicableWindows: WorldShiftWindow[] = [],
): WorldOverride {
    const roll = rand();
    if (roll < 0.4) {
        // Adds require a concrete location (enforced by the schedule API).
        const window = randomWindow(rand);
        return {
            id: nextId("override"),
            barberId: barber.id,
            locationId: pick(rand, barber.locationIds),
            overrideDate,
            overrideType: "add",
            startTime: window.startTime,
            endTime: window.endTime,
        };
    }
    if (roll < 0.75) {
        // Prefer carving the INTERIOR of a real applicable window (a guaranteed
        // two-part split - the case subtractWindow's hardest branch handles)
        // over a floating random window.
        const splittable = applicableWindows.filter(
            (window) => clockToMinutes(window.endTime) - clockToMinutes(window.startTime) >= 45,
        );
        if (splittable.length > 0 && chance(rand, 0.7)) {
            const target = pick(rand, splittable);
            return {
                id: nextId("override"),
                barberId: barber.id,
                locationId: chance(rand, 0.3) ? null : target.locationId,
                overrideDate,
                overrideType: "remove",
                startTime: minutesToClock(clockToMinutes(target.startTime) + 15),
                endTime: minutesToClock(clockToMinutes(target.endTime) - 15),
            };
        }
        const window = randomWindow(rand);
        return {
            id: nextId("override"),
            barberId: barber.id,
            locationId: chance(rand, 0.25) ? null : pick(rand, barber.locationIds),
            overrideDate,
            overrideType: "remove",
            startTime: window.startTime,
            endTime: window.endTime,
        };
    }
    const withTimes = chance(rand, 0.2);
    const window = withTimes ? randomWindow(rand) : null;
    return {
        id: nextId("override"),
        barberId: barber.id,
        locationId: chance(rand, 0.5) ? null : pick(rand, barber.locationIds),
        overrideDate,
        overrideType: "not_working",
        startTime: window ? window.startTime : null,
        endTime: window ? window.endTime : null,
    };
}

function randomBlockFor(
    rand: Rand,
    barbers: readonly WorldBarber[],
    date: string,
    nextId: (prefix: string) => string,
): WorldBlock {
    const scopeRoll = rand();
    const scope: AdminBlockedTimeScope = scopeRoll < 0.5 ? "barber" : scopeRoll < 0.8 ? "location" : "business";
    const barber = scope === "barber" ? pick(rand, barbers) : null;
    const locationId =
        scope === "location"
            ? pick(rand, LOCATIONS).id
            : barber && chance(rand, 0.4)
              ? pick(rand, barber.locationIds)
              : null;

    let startTime: Date;
    let endTime: Date;
    const kindRoll = rand();
    if (kindRoll < 0.4) {
        // All-day (local midnight to local midnight), sometimes multi-day.
        const startDate = chance(rand, 0.25) ? addDaysLocal(date, -1) : date;
        const endDate = addDaysLocal(date, 1 + (chance(rand, 0.25) ? 1 : 0));
        startTime = localDateTimeToUtc(startDate, "00:00", TIME_ZONE);
        endTime = localDateTimeToUtc(endDate, "00:00", TIME_ZONE);
    } else if (kindRoll < 0.85) {
        // Partial block inside the target day.
        const window = randomWindow(rand);
        startTime = localDateTimeToUtc(date, window.startTime, TIME_ZONE);
        endTime = localDateTimeToUtc(date, window.endTime, TIME_ZONE);
    } else if (chance(rand, 0.5)) {
        // Spans past local midnight into the next day.
        startTime = localDateTimeToUtc(date, "18:00", TIME_ZONE);
        endTime = localDateTimeToUtc(addDaysLocal(date, 1), "11:00", TIME_ZONE);
    } else {
        // Started the previous evening, ends on the target morning.
        startTime = localDateTimeToUtc(addDaysLocal(date, -1), "18:00", TIME_ZONE);
        endTime = localDateTimeToUtc(date, "11:00", TIME_ZONE);
    }

    return { id: nextId("block"), scope, barberId: barber ? barber.id : null, locationId, startTime, endTime };
}

// ---------------------------------------------------------------------------
// Counterexample dump - a failure must be reproducible from the message alone.
// ---------------------------------------------------------------------------

function dumpCounterexample(
    world: World,
    schedule: AdminSchedule,
    data: AvailabilityData,
    detail: Record<string, unknown>,
): string {
    return JSON.stringify(
        {
            ...detail,
            date: world.date,
            schedule,
            engineShiftOverridesInOrder: data.shiftOverrides,
            engineBlockedTimes: data.blockedTimes,
            engineBookings: data.bookings,
        },
        null,
        2,
    );
}

// ---------------------------------------------------------------------------
// The property.
// ---------------------------------------------------------------------------

const ITERATIONS = 200;
const SEED = 0x1ea51de;
const PROPERTY_TEST_TIMEOUT_MS = 15_000;

describe("engine parity: Team Week grid vs availability engine", () => {
    test(`booking-safety and containment hold across ${ITERATIONS} seeded random worlds`, () => {
        const rand = mulberry32(SEED);
        let containmentChecks = 0;
        let offLocationChecks = 0;
        let overriddenOffDays = 0;
        let barberLocationsWithSlots = 0;
        let interiorSplitRemoves = 0;
        let coverDays = 0;

        for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
            const world = generateWorld(rand, iteration);
            const schedule = projectSchedule(world, rand);
            const data = projectAvailabilityData(world);
            const engineByLocation = new Map(
                LOCATIONS.map((location) => [
                    location.id,
                    getAvailableSlots(engineRequest(world.date, location.id), data),
                ]),
            );

            for (const barber of world.barbers) {
                const resolved = resolveBarberDay(schedule, barber.id, world.date);
                if (!resolved.working && resolved.baselineWindows.length > 0) {
                    overriddenOffDays += 1;
                }

                // Coverage tracking (Finding 4): prove the generator actually
                // exercises the subtle geometry the Team Week grid exists for -
                // removes that split the interior of a baseline window, and
                // cover days (add somewhere + remove somewhere, same barber/day).
                const targetOverrides = world.overrides.filter(
                    (override) => override.barberId === barber.id && override.overrideDate === world.date,
                );
                for (const removal of targetOverrides) {
                    if (removal.overrideType !== "remove" || !removal.startTime || !removal.endTime) {
                        continue;
                    }
                    const removeStart = clockToMinutes(removal.startTime);
                    const removeEnd = clockToMinutes(removal.endTime);
                    if (
                        resolved.baselineWindows.some(
                            (window) =>
                                clockToMinutes(window.startTime) < removeStart &&
                                removeEnd < clockToMinutes(window.endTime),
                        )
                    ) {
                        interiorSplitRemoves += 1;
                    }
                }
                if (
                    targetOverrides.some((override) => override.overrideType === "add") &&
                    targetOverrides.some((override) => override.overrideType === "remove")
                ) {
                    coverDays += 1;
                }

                for (const locationId of barber.locationIds) {
                    const slots =
                        engineByLocation
                            .get(locationId)
                            ?.barberSlots.find((group) => group.barberId === barber.id)?.slots ?? [];
                    const gridWindows = resolved.windows.filter(
                        (window) => window.locationId === locationId,
                    );

                    // Invariant 1a (day-level): grid says the barber is off ->
                    // the engine must not sell a single slot anywhere.
                    if (!resolved.working && slots.length > 0) {
                        expect.unreachable(
                            `BOOKING-SAFETY violated (day-level): grid says working=false but the engine offers ${slots.length} slot(s). ` +
                                dumpCounterexample(world, schedule, data, {
                                    iteration,
                                    barberId: barber.id,
                                    locationId,
                                    firstEngineSlot: slots[0],
                                    resolvedDay: resolved,
                                }),
                        );
                    }

                    // Invariant 1b (per-location): no grid window at this
                    // location -> zero engine slots at this location.
                    if (gridWindows.length === 0) {
                        offLocationChecks += 1;
                        if (slots.length > 0) {
                            expect.unreachable(
                                `BOOKING-SAFETY violated (per-location): grid shows no window at ${locationId} but the engine offers ${slots.length} slot(s). ` +
                                    dumpCounterexample(world, schedule, data, {
                                        iteration,
                                        barberId: barber.id,
                                        locationId,
                                        firstEngineSlot: slots[0],
                                        resolvedDay: resolved,
                                    }),
                            );
                        }
                        continue;
                    }

                    // Invariant 2: every engine slot starts inside a grid window.
                    for (const slot of slots) {
                        containmentChecks += 1;
                        const slotStartMinutes = torontoMinutesOf(slot.startTime);
                        const contained = gridWindows.some(
                            (window) =>
                                slotStartMinutes >= clockToMinutes(window.startTime) &&
                                slotStartMinutes < clockToMinutes(window.endTime),
                        );
                        if (!contained) {
                            expect.unreachable(
                                `CONTAINMENT violated: engine slot starts at ${minutesToClock(slotStartMinutes)} (Toronto) outside every grid window. ` +
                                    dumpCounterexample(world, schedule, data, {
                                        iteration,
                                        barberId: barber.id,
                                        locationId,
                                        slot,
                                        slotStartToronto: minutesToClock(slotStartMinutes),
                                        gridWindows,
                                    }),
                            );
                        }
                    }
                    if (slots.length > 0) {
                        barberLocationsWithSlots += 1;
                    }
                }
            }
        }

        // Non-vacuity: the generator must actually exercise both sides of the
        // invariants, or a bridge bug could silently turn this into a no-op.
        expect(containmentChecks).toBeGreaterThan(2000);
        expect(barberLocationsWithSlots).toBeGreaterThan(100);
        expect(offLocationChecks).toBeGreaterThan(100);
        expect(overriddenOffDays).toBeGreaterThan(20);
        // Finding 4: the geometry the grid exists to get right must be
        // exercised in bulk, not incidentally (the pre-strengthening generator
        // produced only ~6 interior splits and ~9 cover days across 200 worlds).
        expect(interiorSplitRemoves).toBeGreaterThan(20);
        expect(coverDays).toBeGreaterThan(20);
    }, PROPERTY_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// Deterministic parity cases - named, human-readable versions of the exact
// scenarios the Team Week grid exists to get right.
// ---------------------------------------------------------------------------

describe("engine parity: deterministic scenarios", () => {
    const date = "2026-07-20"; // Monday
    const baseBarber: WorldBarber = { id: "barber-1", locationIds: [EGLINTON, MILLWOOD] };
    const mondayShift: WorldShift = {
        id: "shift-1",
        barberId: "barber-1",
        locationId: EGLINTON,
        dayOfWeek: 1,
        startTime: "10:00",
        endTime: "19:00",
        effectiveFrom: null,
        effectiveTo: null,
        active: true,
    };

    function slotsFor(world: World, locationId: string) {
        const data = projectAvailabilityData(world);
        const result = getAvailableSlots(engineRequest(world.date, locationId), data);
        return result.barberSlots.find((group) => group.barberId === "barber-1")?.slots ?? [];
    }

    test("barber-wide not_working: grid says off and the engine sells nothing anywhere", () => {
        const world: World = {
            date,
            barbers: [baseBarber],
            shifts: [mondayShift],
            overrides: [
                {
                    id: "override-1",
                    barberId: "barber-1",
                    locationId: null,
                    overrideDate: date,
                    overrideType: "not_working",
                    startTime: null,
                    endTime: null,
                },
            ],
            blocks: [],
            bookings: [],
        };

        const resolved = resolveBarberDay(projectSchedule(world), "barber-1", date);
        expect(resolved.working).toBe(false);
        expect(resolved.windows).toHaveLength(0);
        expect(slotsFor(world, EGLINTON)).toHaveLength(0);
        expect(slotsFor(world, MILLWOOD)).toHaveLength(0);
    });

    test("all-day barber blocked time: grid says off and the engine sells nothing", () => {
        const world: World = {
            date,
            barbers: [baseBarber],
            shifts: [mondayShift],
            overrides: [],
            blocks: [
                {
                    id: "block-1",
                    scope: "barber",
                    barberId: "barber-1",
                    locationId: null,
                    startTime: localDateTimeToUtc(date, "00:00", TIME_ZONE),
                    endTime: localDateTimeToUtc(addDaysLocal(date, 1), "00:00", TIME_ZONE),
                },
            ],
            bookings: [],
        };

        const resolved = resolveBarberDay(projectSchedule(world), "barber-1", date);
        expect(resolved.working).toBe(false);
        expect(slotsFor(world, EGLINTON)).toHaveLength(0);
        expect(slotsFor(world, MILLWOOD)).toHaveLength(0);
    });

    test("cover day (add at cover location + remove at home): both sides move the barber", () => {
        // Exactly the rows replaceAdminDayShift writes for a cover day: the
        // add and remove are disjoint by construction (desired minus baseline
        // / baseline minus desired).
        const world: World = {
            date,
            barbers: [baseBarber],
            shifts: [mondayShift],
            overrides: [
                {
                    id: "override-1",
                    barberId: "barber-1",
                    locationId: MILLWOOD,
                    overrideDate: date,
                    overrideType: "add",
                    startTime: "10:00",
                    endTime: "19:00",
                },
                {
                    id: "override-2",
                    barberId: "barber-1",
                    locationId: EGLINTON,
                    overrideDate: date,
                    overrideType: "remove",
                    startTime: "10:00",
                    endTime: "19:00",
                },
            ],
            blocks: [],
            bookings: [],
        };

        const resolved = resolveBarberDay(projectSchedule(world), "barber-1", date);
        expect(resolved.working).toBe(true);
        expect(resolved.windows).toEqual([
            { locationId: MILLWOOD, startTime: "10:00", endTime: "19:00" },
        ]);

        expect(slotsFor(world, EGLINTON)).toHaveLength(0);

        const millwoodSlots = slotsFor(world, MILLWOOD);
        expect(millwoodSlots.length).toBeGreaterThan(0);
        for (const slot of millwoodSlots) {
            const startMinutes = torontoMinutesOf(slot.startTime);
            expect(startMinutes).toBeGreaterThanOrEqual(clockToMinutes("10:00"));
            expect(startMinutes).toBeLessThan(clockToMinutes("19:00"));
        }
    });
});

// ---------------------------------------------------------------------------
// DST transition days. The property test runs a July week to avoid DST edges;
// pin the two Toronto transitions explicitly so the local<->UTC math both sides
// depend on is proven exactly where it is most likely to break. Both 2027
// transitions fall on a Sunday.
// ---------------------------------------------------------------------------

describe("engine parity: DST transition days", () => {
    const cases = [
        { label: "spring forward (23h day)", date: "2027-03-14", now: new Date("2027-03-09T12:00:00.000Z") },
        { label: "fall back (25h day)", date: "2027-11-07", now: new Date("2027-11-02T12:00:00.000Z") },
    ] as const;

    function dstRequest(date: string, locationId: string, now: Date): AvailabilityRequest {
        return {
            locationId,
            serviceIds: [SERVICE_ID],
            date,
            now,
            timeZone: TIME_ZONE,
            slotIntervalMinutes: 15,
            minimumNoticeMinutes: 0,
            maxAdvanceDays: 365,
        };
    }

    function dstSlots(world: World, locationId: string, now: Date) {
        const data = projectAvailabilityData(world);
        return (
            getAvailableSlots(dstRequest(world.date, locationId, now), data).barberSlots.find(
                (group) => group.barberId === "barber-1",
            )?.slots ?? []
        );
    }

    for (const { label, date, now } of cases) {
        const shift: WorldShift = {
            id: "shift-1",
            barberId: "barber-1",
            locationId: EGLINTON,
            dayOfWeek: weekdayOf(date),
            startTime: "10:00",
            endTime: "19:00",
            effectiveFrom: null,
            effectiveTo: null,
            active: true,
        };
        const barber: WorldBarber = { id: "barber-1", locationIds: [EGLINTON, MILLWOOD] };

        test(`${label}: engine slots stay inside the grid window`, () => {
            const world: World = { date, barbers: [barber], shifts: [shift], overrides: [], blocks: [], bookings: [] };
            const resolved = resolveBarberDay(projectSchedule(world), "barber-1", date);
            expect(resolved.windows.filter((window) => window.locationId === EGLINTON)).toEqual([
                { locationId: EGLINTON, startTime: "10:00", endTime: "19:00" },
            ]);

            const slots = dstSlots(world, EGLINTON, now);
            expect(slots.length).toBeGreaterThan(0);
            for (const slot of slots) {
                const startMinutes = torontoMinutesOf(slot.startTime);
                expect(startMinutes).toBeGreaterThanOrEqual(clockToMinutes("10:00"));
                expect(startMinutes).toBeLessThan(clockToMinutes("19:00"));
            }
        });

        test(`${label}: an all-day barber block zeros the day on both sides`, () => {
            const world: World = {
                date,
                barbers: [barber],
                shifts: [shift],
                overrides: [],
                blocks: [
                    {
                        id: "block-1",
                        scope: "barber",
                        barberId: "barber-1",
                        locationId: null,
                        startTime: localDateTimeToUtc(date, "00:00", TIME_ZONE),
                        endTime: localDateTimeToUtc(addDaysLocal(date, 1), "00:00", TIME_ZONE),
                    },
                ],
                bookings: [],
            };
            const resolved = resolveBarberDay(projectSchedule(world), "barber-1", date);
            expect(resolved.working).toBe(false);
            expect(dstSlots(world, EGLINTON, now)).toHaveLength(0);
            expect(dstSlots(world, MILLWOOD, now)).toHaveLength(0);
        });
    }
});

// ---------------------------------------------------------------------------
// Override row order: a documented latent hazard.
//
// The engine folds shift overrides IN ARRAY ORDER (applyShiftOverrides in
// availability-engine.ts), while the grid applies all adds and then all
// removes (buildCalendarWorkingWindows in admin-utils.ts). When a remove row
// reaches the engine BEFORE an overlapping add row, the engine re-opens the
// removed range (windows = (shifts - remove) + add) while the grid keeps it
// closed (windows = (shifts + add) - remove).
//
// Production is protected from this ONLY by the deterministic ORDER BY in
// src/server/public-booking/repository.ts - (override_date, override_type,
// id) - combined with the shift_override_type pgEnum definition order
// ["add", "remove", "not_working"] in src/server/db/schema.ts, which together
// guarantee adds always precede removes for every engine call site. If either
// of those distant pieces changes, remove-before-add rows silently re-open
// booking for times the Team Week grid shows as off. Note that the ADMIN
// schedule repository orders overrides by (override_date, start_time), which
// can put a remove first - safe today only because it feeds the
// order-insensitive grid, never the engine.
//
// The test.fails case below is the pinned counterexample: it asserts the
// desired invariant and is EXPECTED TO FAIL while the engine stays
// order-sensitive. If it ever starts passing (vitest will flag it), the
// engine has become order-insensitive and the pin can be deleted.
// ---------------------------------------------------------------------------

describe("engine parity: override row order (documented latent hazard)", () => {
    const date = "2026-07-20"; // Monday
    const hazardWorld: World = {
        date,
        barbers: [{ id: "barber-1", locationIds: [EGLINTON] }],
        shifts: [],
        overrides: [
            // Deliberately remove-first: NOT the order production feeds the
            // engine, but reachable from any future call site that forgets
            // the canonical ORDER BY.
            {
                id: "override-1",
                barberId: "barber-1",
                locationId: EGLINTON,
                overrideDate: date,
                overrideType: "remove",
                startTime: "10:00",
                endTime: "12:00",
            },
            {
                id: "override-2",
                barberId: "barber-1",
                locationId: EGLINTON,
                overrideDate: date,
                overrideType: "add",
                startTime: "10:00",
                endTime: "12:00",
            },
        ],
        blocks: [],
        bookings: [],
    };

    function eglintonSlots(data: AvailabilityData) {
        const result = getAvailableSlots(engineRequest(date, EGLINTON), data);
        return result.barberSlots.find((group) => group.barberId === "barber-1")?.slots ?? [];
    }

    test("shift_override_type enum still orders add < remove < not_working (booking-safety load-bearing)", () => {
        // This is the ONE distant production mechanism the whole file leans on.
        // The public-booking repository (repository.ts) orders overrides by
        // `asc(overrideType)`, which Postgres resolves via this pgEnum's
        // DEFINITION order. That ordering is the sole guarantee that an `add`
        // folds into the order-sensitive engine (applyShiftOverrides in
        // availability-engine.ts) before an overlapping `remove`. If the enum is
        // ever reordered, remove-before-add can re-open slots the Team Week grid
        // shows as off — a live booking-safety bug. Pin it here so that
        // regression fails in the parity suite, not silently in production.
        expect(shiftOverrideTypeEnum.enumValues).toEqual(["add", "remove", "not_working"]);
        expect(OVERRIDE_TYPE_ENUM_ORDER.add).toBeLessThan(OVERRIDE_TYPE_ENUM_ORDER.remove);
        expect(OVERRIDE_TYPE_ENUM_ORDER.remove).toBeLessThan(OVERRIDE_TYPE_ENUM_ORDER.not_working);
    });

    test("production order (adds before removes) keeps the engine in lockstep with the grid", () => {
        const data = projectAvailabilityData(hazardWorld, "booking-repository");
        // The canonical sort really does put the add first, like Postgres does.
        expect(data.shiftOverrides?.[0]?.overrideType).toBe("add");

        const resolved = resolveBarberDay(projectSchedule(hazardWorld), "barber-1", date);
        expect(resolved.working).toBe(false);
        expect(eglintonSlots(data)).toHaveLength(0);
    });

    // POSSIBLE BUG (latent, not reachable through production repositories
    // today): with the same two rows in remove-before-add order the engine
    // offers 10:00-11:30 starts while the grid says the barber is off.
    test.fails(
        "KNOWN DIVERGENCE: remove-before-add row order re-opens slots the grid shows as off",
        () => {
            const data = projectAvailabilityData(hazardWorld, "as-given");
            const resolved = resolveBarberDay(projectSchedule(hazardWorld), "barber-1", date);

            // The grid is order-insensitive: still off.
            expect(resolved.working).toBe(false);

            // Desired invariant - engine sells nothing when the grid says off.
            // This is the assertion that FAILS today: the engine returns eight
            // 15-minute starts between 10:00 and 11:30 from the re-opened add
            // window.
            expect(eglintonSlots(data)).toHaveLength(0);
        },
    );
});
