import { describe, expect, test } from "vitest";

import {
    createDrizzleAdminScheduleRepository,
    formatScheduleRows,
    scheduleEffectiveRangesOverlap,
} from "./schedule-repository.ts";
import type { AdminScheduleRepository } from "./schedule-service.ts";

const barberId = "11111111-1111-1111-1111-111111111111";
const locationId = "22222222-2222-2222-2222-222222222222";

describe("Phase 7 admin schedule repository mapping", () => {
    test("normalizes shift and override times plus date-only fields", () => {
        const schedule = formatScheduleRows({
            locations: [{ id: locationId, name: "Leaside Fades Eglinton", sortOrder: 10 }],
            barbers: [{ id: barberId, displayName: "Sam To", sortOrder: 10 }],
            barberLocations: [{ barberId, locationId }],
            shifts: [
                {
                    id: "shift-a",
                    barberId,
                    locationId,
                    dayOfWeek: 1,
                    startTime: "10:00:00",
                    endTime: "19:00:00",
                    effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
                    effectiveTo: "2026-05-31",
                    active: true,
                },
            ],
            shiftOverrides: [
                {
                    id: "override-a",
                    barberId,
                    locationId,
                    overrideDate: new Date("2026-05-04T00:00:00.000Z"),
                    overrideType: "add" as const,
                    startTime: "11:15:00",
                    endTime: "15:45:00",
                    reason: "Coverage",
                },
            ],
            blockedTimes: [
                {
                    id: "blocked-a",
                    scope: "location" as const,
                    barberId: null,
                    locationId,
                    startTime: new Date("2026-05-04T15:00:00.000Z"),
                    endTime: new Date("2026-05-04T16:00:00.000Z"),
                    reason: "Private event",
                    createdByUserId: "owner",
                },
            ],
        });

        expect(schedule.barbers[0]).toMatchObject({ id: barberId, locationIds: [locationId] });
        expect(schedule.shifts[0]).toMatchObject({
            startTime: "10:00",
            endTime: "19:00",
            effectiveFrom: "2026-05-01",
            effectiveTo: "2026-05-31",
        });
        expect(schedule.shiftOverrides[0]).toMatchObject({
            overrideDate: "2026-05-04",
            startTime: "11:15",
            endTime: "15:45",
        });
        expect(schedule.blockedTimes[0].startTime).toEqual(new Date("2026-05-04T15:00:00.000Z"));
    });

    test("detects overlap between bounded and unbounded effective date ranges", () => {
        expect(scheduleEffectiveRangesOverlap(null, null, "2026-05-01", "2026-05-31")).toBe(true);
        expect(scheduleEffectiveRangesOverlap("2026-05-01", "2026-05-31", "2026-06-01", "2026-06-30")).toBe(false);
        expect(scheduleEffectiveRangesOverlap("2026-05-01", "2026-05-31", "2026-05-31", "2026-06-30")).toBe(true);
    });
});

describe("Admin schedule repository transactions", () => {
    test("withTransaction wraps a transaction-scoped repository when the database supports transactions", async () => {
        const transactionExecutors: unknown[] = [];
        const database = {
            transaction: async <T>(callback: (tx: Record<string, unknown>) => Promise<T>) => {
                const executor = { transactional: true };
                transactionExecutors.push(executor);
                return callback(executor);
            },
        };
        const repository = createDrizzleAdminScheduleRepository(database);
        const seenRepositories: AdminScheduleRepository[] = [];

        const result = await repository.withTransaction?.(async (transaction) => {
            seenRepositories.push(transaction);
            return "committed";
        });

        expect(result).toBe("committed");
        expect(transactionExecutors).toHaveLength(1);
        expect(seenRepositories[0]).not.toBe(repository);
        expect(seenRepositories[0]?.withTransaction).toBeDefined();
    });

    test("withTransaction falls back to the same repository when the database has no transaction support", async () => {
        const repository = createDrizzleAdminScheduleRepository({});
        const seenRepositories: AdminScheduleRepository[] = [];

        const result = await repository.withTransaction?.(async (transaction) => {
            seenRepositories.push(transaction);
            return 7;
        });

        expect(result).toBe(7);
        expect(seenRepositories[0]).toBe(repository);
    });

    test("withTransaction rethrows callback failures so the transaction can roll back", async () => {
        const database = {
            transaction: async <T>(callback: (tx: Record<string, unknown>) => Promise<T>) => callback({}),
        };
        const repository = createDrizzleAdminScheduleRepository(database);

        await expect(
            repository.withTransaction?.(async () => {
                throw new Error("Rollback me");
            }),
        ).rejects.toThrow("Rollback me");
    });
});
