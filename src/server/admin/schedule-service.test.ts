import { describe, expect, test } from "vitest";

import type { SafeAdminUser } from "../auth/index.ts";
import {
    AdminScheduleRequestError,
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
    type AdminBlockedTimeRecord,
    type AdminScheduleRepository,
    type AdminShiftOverrideRecord,
    type AdminShiftRecord,
} from "./schedule-service.ts";

const owner: SafeAdminUser = {
    id: "owner-user",
    email: "owner@example.com",
    displayName: "Owner",
    role: "owner",
    barberId: null,
};

const barberUser: SafeAdminUser = {
    id: "barber-user",
    email: "sam@example.com",
    displayName: "Sam",
    role: "barber",
    barberId: "barber-a",
};

const locationA = "location-a";
const locationB = "location-b";
const now = new Date("2026-04-27T15:00:00.000Z");

class InMemoryScheduleRepository implements AdminScheduleRepository {
    shifts: AdminShiftRecord[] = [];
    shiftOverrides: AdminShiftOverrideRecord[] = [];
    blockedTimes: AdminBlockedTimeRecord[] = [];
    confirmedBookings: Array<{
        barberId: string;
        locationId: string;
        startTime: Date;
        endTime: Date;
    }> = [];
    activeBarbers = [
        { id: "barber-a", displayName: "Sam To", sortOrder: 10, locationIds: [locationA, locationB] },
        { id: "barber-b", displayName: "Laura Nguyen", sortOrder: 20, locationIds: [locationA] },
    ];
    activeLocations = [
        { id: locationA, name: "Leaside Fades Eglinton", sortOrder: 10 },
        { id: locationB, name: "Leaside Fades Millwood", sortOrder: 20 },
    ];

    async listSchedule(scope: { barberId?: string }) {
        const barber = scope.barberId
            ? this.activeBarbers.find((candidate) => candidate.id === scope.barberId)
            : undefined;
        const locationIds = new Set(barber?.locationIds ?? this.activeLocations.map((location) => location.id));

        return {
            locations: this.activeLocations.filter((location) => locationIds.has(location.id)),
            barbers: scope.barberId
                ? this.activeBarbers.filter((candidate) => candidate.id === scope.barberId)
                : this.activeBarbers,
            shifts: this.shifts.filter((shift) => !scope.barberId || shift.barberId === scope.barberId),
            shiftOverrides: this.shiftOverrides.filter(
                (override) => !scope.barberId || override.barberId === scope.barberId,
            ),
            blockedTimes: this.blockedTimes.filter((blockedTime) => {
                if (!scope.barberId) return true;
                if (blockedTime.scope === "business") return true;
                if (blockedTime.scope === "location") return Boolean(blockedTime.locationId && locationIds.has(blockedTime.locationId));
                return blockedTime.barberId === scope.barberId;
            }),
        };
    }

    async findActiveBarber(barberId: string) {
        return this.activeBarbers.find((barber) => barber.id === barberId) ?? null;
    }

    async findActiveLocation(locationId: string) {
        return this.activeLocations.find((location) => location.id === locationId) ?? null;
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

    async hasOverlappingShift(candidate: Omit<AdminShiftRecord, "id" | "active"> & { excludeShiftId?: string }) {
        return this.shifts.some((shift) => {
            if (!shift.active || shift.id === candidate.excludeShiftId) return false;
            if (shift.barberId !== candidate.barberId || shift.dayOfWeek !== candidate.dayOfWeek) return false;
            return (
                candidate.startTime < shift.endTime &&
                candidate.endTime > shift.startTime &&
                dateRangesOverlap(
                    candidate.effectiveFrom,
                    candidate.effectiveTo,
                    shift.effectiveFrom,
                    shift.effectiveTo,
                )
            );
        });
    }

    async hasConfirmedBookingOverlapForBlockedTime(candidate: {
        scope: AdminBlockedTimeRecord["scope"];
        barberId: string | null;
        locationId: string | null;
        startTime: Date;
        endTime: Date;
        excludeBlockedTimeId?: string;
    }) {
        return this.confirmedBookings.some((booking) => {
            const overlaps = candidate.startTime < booking.endTime && candidate.endTime > booking.startTime;
            if (!overlaps) return false;
            if (candidate.scope === "business") return true;
            if (candidate.scope === "location") return booking.locationId === candidate.locationId;
            if (candidate.locationId) {
                return booking.barberId === candidate.barberId && booking.locationId === candidate.locationId;
            }
            return booking.barberId === candidate.barberId;
        });
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

function dateRangesOverlap(
    startA: string | null,
    endA: string | null,
    startB: string | null,
    endB: string | null,
) {
    return (!endA || !startB || endA >= startB) && (!endB || !startA || endB >= startA);
}

describe("Phase 7 admin schedule service", () => {
    test("owner creates recurring split shifts and adjacent windows are allowed", async () => {
        const repository = new InMemoryScheduleRepository();

        const morning = await createAdminShift(
            owner,
            {
                barberId: "barber-a",
                locationId: locationA,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "13:00",
                effectiveFrom: "2026-05-01",
                effectiveTo: "2026-05-31",
            },
            repository,
            { now },
        );
        const afternoon = await createAdminShift(
            owner,
            {
                barberId: "barber-a",
                locationId: locationB,
                dayOfWeek: 1,
                startTime: "13:00",
                endTime: "19:00",
                effectiveFrom: "2026-05-01",
                effectiveTo: "2026-05-31",
            },
            repository,
            { now },
        );

        expect(morning).toMatchObject({ active: true, startTime: "10:00", endTime: "13:00" });
        expect(afternoon).toMatchObject({ active: true, startTime: "13:00", endTime: "19:00" });
        expect(repository.shifts).toHaveLength(2);
    });

    test("overlapping same-barber shifts are rejected only when effective date ranges overlap", async () => {
        const repository = new InMemoryScheduleRepository();
        await createAdminShift(
            owner,
            {
                barberId: "barber-a",
                locationId: locationA,
                dayOfWeek: 2,
                startTime: "10:00",
                endTime: "14:00",
                effectiveFrom: "2026-05-01",
                effectiveTo: "2026-05-31",
            },
            repository,
            { now },
        );

        await expect(
            createAdminShift(
                owner,
                {
                    barberId: "barber-a",
                    locationId: locationB,
                    dayOfWeek: 2,
                    startTime: "13:45",
                    endTime: "18:00",
                    effectiveFrom: "2026-05-15",
                    effectiveTo: "2026-06-15",
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({
            status: 409,
            message: "This barber already has an overlapping active shift.",
        });

        await expect(
            createAdminShift(
                owner,
                {
                    barberId: "barber-a",
                    locationId: locationB,
                    dayOfWeek: 2,
                    startTime: "13:45",
                    endTime: "18:00",
                    effectiveFrom: "2026-06-01",
                    effectiveTo: "2026-06-30",
                },
                repository,
                { now },
            ),
        ).resolves.toMatchObject({ effectiveFrom: "2026-06-01" });
    });

    test("shift updates and deactivation stay owner/admin only", async () => {
        const repository = new InMemoryScheduleRepository();
        const shift = await createAdminShift(
            owner,
            {
                barberId: "barber-a",
                locationId: locationA,
                dayOfWeek: 3,
                startTime: "10:00",
                endTime: "18:00",
            },
            repository,
            { now },
        );

        await expect(updateAdminShift(barberUser, shift.id, { ...shift, endTime: "19:00" }, repository, { now }))
            .rejects.toMatchObject({ status: 403 });
        await expect(deactivateAdminShift(barberUser, shift.id, repository, { now }))
            .rejects.toMatchObject({ status: 403 });

        await expect(updateAdminShift(owner, shift.id, { ...shift, endTime: "19:00" }, repository, { now }))
            .resolves.toMatchObject({ endTime: "19:00" });
        await expect(deactivateAdminShift(owner, shift.id, repository, { now }))
            .resolves.toMatchObject({ active: false });
    });

    test("one-off overrides validate type-specific time and location rules", async () => {
        const repository = new InMemoryScheduleRepository();

        await expect(
            createAdminShiftOverride(
                owner,
                {
                    barberId: "barber-a",
                    overrideType: "add",
                    overrideDate: "2026-05-04",
                    startTime: "10:00",
                    endTime: "14:00",
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 400, message: "Added shifts require a location." });

        await expect(
            createAdminShiftOverride(
                owner,
                {
                    barberId: "barber-a",
                    overrideType: "not_working",
                    overrideDate: "2026-05-04",
                    startTime: "10:00",
                    endTime: "14:00",
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 400, message: "Not-working overrides must not include start or end times." });

        const override = await createAdminShiftOverride(
            owner,
            {
                barberId: "barber-a",
                locationId: locationA,
                overrideType: "add",
                overrideDate: "2026-05-04",
                startTime: "10:00",
                endTime: "14:00",
                reason: "One-off coverage",
            },
            repository,
            { now },
        );

        expect(override).toMatchObject({ overrideType: "add", locationId: locationA });
        await expect(
            updateAdminShiftOverride(owner, override.id, { ...override, reason: "Updated" }, repository, { now }),
        ).resolves.toMatchObject({ reason: "Updated" });
        await expect(deleteAdminShiftOverride(owner, override.id, repository, { now })).resolves.toEqual({
            deleted: true,
        });
    });

    test("barber users can manage only their own barber-scoped blocked time", async () => {
        const repository = new InMemoryScheduleRepository();

        const ownBlock = await createAdminBlockedTime(
            barberUser,
            {
                scope: "barber",
                barberId: "barber-a",
                locationId: locationA,
                startDate: "2026-05-04",
                startTime: "12:00",
                endDate: "2026-05-04",
                endTime: "13:00",
                reason: "Lunch",
            },
            repository,
            { now },
        );

        expect(ownBlock).toMatchObject({
            scope: "barber",
            barberId: "barber-a",
            locationId: locationA,
            createdByUserId: barberUser.id,
        });

        await expect(
            createAdminBlockedTime(
                barberUser,
                {
                    scope: "barber",
                    barberId: "barber-b",
                    startDate: "2026-05-04",
                    startTime: "13:00",
                    endDate: "2026-05-04",
                    endTime: "14:00",
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 403 });

        await expect(
            createAdminBlockedTime(
                barberUser,
                {
                    scope: "location",
                    locationId: locationA,
                    startDate: "2026-05-04",
                    startTime: "13:00",
                    endDate: "2026-05-04",
                    endTime: "14:00",
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 403 });

        await expect(
            updateAdminBlockedTime(barberUser, ownBlock.id, { ...ownBlock, reason: "Break" }, repository, { now }),
        ).resolves.toMatchObject({ reason: "Break" });
        await expect(deleteAdminBlockedTime(barberUser, ownBlock.id, repository, { now })).resolves.toEqual({
            deleted: true,
        });
    });

    test("owner creates location and business closures but confirmed booking overlaps are rejected", async () => {
        const repository = new InMemoryScheduleRepository();
        repository.confirmedBookings.push({
            barberId: "barber-a",
            locationId: locationA,
            startTime: new Date("2026-05-04T16:00:00.000Z"),
            endTime: new Date("2026-05-04T16:30:00.000Z"),
        });

        await expect(
            createAdminBlockedTime(
                owner,
                {
                    scope: "location",
                    locationId: locationA,
                    startDate: "2026-05-04",
                    startTime: "11:30",
                    endDate: "2026-05-04",
                    endTime: "12:30",
                    reason: "Private event",
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({
            status: 409,
            message: "Blocked time overlaps an existing confirmed booking.",
        });

        const businessClosure = await createAdminBlockedTime(
            owner,
            {
                scope: "business",
                startDate: "2026-05-05",
                startTime: "00:00",
                endDate: "2026-05-06",
                endTime: "00:00",
                reason: "Staff training",
            },
            repository,
            { now },
        );

        expect(businessClosure).toMatchObject({
            scope: "business",
            barberId: null,
            locationId: null,
            reason: "Staff training",
        });
    });

    test("list schedule scopes barber users to their own operational data", async () => {
        const repository = new InMemoryScheduleRepository();
        await createAdminShift(
            owner,
            {
                barberId: "barber-a",
                locationId: locationA,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
            },
            repository,
            { now },
        );
        await createAdminShift(
            owner,
            {
                barberId: "barber-b",
                locationId: locationA,
                dayOfWeek: 2,
                startTime: "10:00",
                endTime: "19:00",
            },
            repository,
            { now },
        );
        await createAdminBlockedTime(
            owner,
            {
                scope: "business",
                startDate: "2026-05-05",
                startTime: "00:00",
                endDate: "2026-05-06",
                endTime: "00:00",
            },
            repository,
            { now },
        );

        const schedule = await listAdminSchedule(barberUser, repository, {});

        expect(schedule.barbers.map((barber) => barber.id)).toEqual(["barber-a"]);
        expect(schedule.shifts.map((shift) => shift.barberId)).toEqual(["barber-a"]);
        expect(schedule.blockedTimes.map((blockedTime) => blockedTime.scope)).toEqual(["business"]);
    });

    test("barber replaces their own one-day location shift by diffing overrides against the recurring baseline", async () => {
        const repository = new InMemoryScheduleRepository();
        await createAdminShift(
            owner,
            {
                barberId: "barber-a",
                locationId: locationA,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
            },
            repository,
            { now },
        );
        repository.shiftOverrides.push({
            id: "old-same-day",
            barberId: "barber-a",
            locationId: locationA,
            overrideDate: "2026-05-04",
            overrideType: "add",
            startTime: "09:00",
            endTime: "10:00",
            reason: "old edit",
        });

        const result = await replaceAdminDayShift(
            barberUser,
            {
                barberId: "barber-a",
                locationId: locationA,
                date: "2026-05-04",
                windows: [
                    { startTime: "09:00", endTime: "12:00" },
                    { startTime: "13:00", endTime: "18:00" },
                ],
            },
            repository,
            { now },
        );

        expect(result).toMatchObject({
            barberId: "barber-a",
            locationId: locationA,
            date: "2026-05-04",
            windows: [
                { startTime: "09:00", endTime: "12:00" },
                { startTime: "13:00", endTime: "18:00" },
            ],
        });
        expect(repository.shiftOverrides).toHaveLength(3);
        expect(
            repository.shiftOverrides
                .map(({ overrideType, startTime, endTime, reason }) => ({ overrideType, startTime, endTime, reason }))
                .sort((left, right) => `${left.overrideType}${left.startTime}`.localeCompare(`${right.overrideType}${right.startTime}`)),
        ).toEqual([
            { overrideType: "add", startTime: "09:00", endTime: "10:00", reason: "One-day shift edit" },
            { overrideType: "remove", startTime: "12:00", endTime: "13:00", reason: "One-day shift edit" },
            { overrideType: "remove", startTime: "18:00", endTime: "19:00", reason: "One-day shift edit" },
        ]);
    });

    test("owner can clear another barber's selected-day location shift and barber users cannot edit someone else's day shift", async () => {
        const repository = new InMemoryScheduleRepository();
        await createAdminShift(
            owner,
            {
                barberId: "barber-b",
                locationId: locationA,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
            },
            repository,
            { now },
        );

        await expect(
            replaceAdminDayShift(
                barberUser,
                {
                    barberId: "barber-b",
                    locationId: locationA,
                    date: "2026-05-04",
                    windows: [],
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 403 });

        await expect(
            replaceAdminDayShift(
                owner,
                {
                    barberId: "barber-b",
                    locationId: locationA,
                    date: "2026-05-04",
                    windows: [],
                },
                repository,
                { now },
            ),
        ).resolves.toMatchObject({ barberId: "barber-b", windows: [] });
        expect(repository.shiftOverrides).toEqual([
            expect.objectContaining({
                barberId: "barber-b",
                locationId: locationA,
                overrideDate: "2026-05-04",
                overrideType: "remove",
                startTime: "10:00",
                endTime: "19:00",
            }),
        ]);
    });
});
