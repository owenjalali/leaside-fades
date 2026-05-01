import { describe, expect, test } from "vitest";

import {
    assertLocalDevOwnerBootstrapAllowed,
    buildDevOwnerSeedInput,
} from "./seed-dev-owner.ts";

describe("local dev owner bootstrap", () => {
    test("allows localhost database URLs outside production", () => {
        expect(() =>
            assertLocalDevOwnerBootstrapAllowed({
                databaseUrl: "postgres://postgres:postgres@localhost:5432/leaside_fades",
                nodeEnv: "development",
            }),
        ).not.toThrow();
        expect(() =>
            assertLocalDevOwnerBootstrapAllowed({
                databaseUrl: "postgres://postgres:postgres@127.0.0.1:5432/leaside_fades",
                nodeEnv: "test",
            }),
        ).not.toThrow();
        expect(() =>
            assertLocalDevOwnerBootstrapAllowed({
                databaseUrl: "postgres://postgres:postgres@[::1]:5432/leaside_fades",
                nodeEnv: undefined,
            }),
        ).not.toThrow();
    });

    test("rejects production mode and non-local database URLs", () => {
        expect(() =>
            assertLocalDevOwnerBootstrapAllowed({
                databaseUrl: "postgres://postgres:postgres@localhost:5432/leaside_fades",
                nodeEnv: "production",
            }),
        ).toThrow(/must not run in production/i);
        expect(() =>
            assertLocalDevOwnerBootstrapAllowed({
                databaseUrl: "postgres://postgres:postgres@db.example.com:5432/leaside_fades",
                nodeEnv: "development",
            }),
        ).toThrow(/local development databases/i);
    });

    test("requires explicit email and password without defaults", () => {
        expect(() =>
            buildDevOwnerSeedInput({
                DEV_OWNER_EMAIL: "",
                DEV_OWNER_PASSWORD: "",
            }),
        ).toThrow(/DEV_OWNER_EMAIL/);
        expect(() =>
            buildDevOwnerSeedInput({
                DEV_OWNER_EMAIL: "owner@example.com",
            }),
        ).toThrow(/DEV_OWNER_PASSWORD/);

        expect(
            buildDevOwnerSeedInput({
                DEV_OWNER_EMAIL: " OWNER@EXAMPLE.COM ",
                DEV_OWNER_PASSWORD: "not-a-default",
                DEV_OWNER_NAME: " Shop Owner ",
            }),
        ).toEqual({
            email: "owner@example.com",
            password: "not-a-default",
            displayName: "Shop Owner",
        });
    });
});
