import { createDatabaseClient } from "./db/client.ts";

type DatabaseHealthStatus = "ok" | "missing_configuration" | "unavailable";

export interface ApplicationHealthResult {
    ok: boolean;
    timestamp: string;
    checks: {
        database: {
            ok: boolean;
            status: DatabaseHealthStatus;
            message?: string;
        };
    };
}

type HealthCheckPool = {
    query: (queryText: string) => Promise<unknown>;
    end: () => Promise<unknown>;
};

interface CheckApplicationHealthInput {
    env?: Partial<Record<string, string | undefined>>;
    createClient?: (connectionString: string) => { pool: HealthCheckPool };
    now?: () => Date;
    timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2_500;

export async function checkApplicationHealth(
    input: CheckApplicationHealthInput = {},
): Promise<ApplicationHealthResult> {
    const env = input.env ?? process.env;
    const now = input.now ?? (() => new Date());
    const timestamp = now().toISOString();
    const connectionString = env.DATABASE_URL;

    if (!connectionString) {
        return {
            ok: false,
            timestamp,
            checks: {
                database: {
                    ok: false,
                    status: "missing_configuration",
                    message: "DATABASE_URL is not configured.",
                },
            },
        };
    }

    const createClient = input.createClient ?? createDatabaseClient;
    let pool: HealthCheckPool | undefined;

    try {
        pool = createClient(connectionString).pool;
        await withTimeout(pool.query("select 1"), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        return {
            ok: true,
            timestamp,
            checks: {
                database: {
                    ok: true,
                    status: "ok",
                },
            },
        };
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[health] database check failed", error);

        return {
            ok: false,
            timestamp,
            checks: {
                database: {
                    ok: false,
                    status: "unavailable",
                    message: "Database is unavailable.",
                },
            },
        };
    } finally {
        if (pool) {
            try {
                await pool.end();
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error("[health] failed to close database pool", error);
            }
        }
    }
}

export function healthHttpStatus(result: ApplicationHealthResult) {
    return result.ok ? 200 : 503;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
            reject(new Error(`Health check timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeout) {
            clearTimeout(timeout);
        }
    });
}
