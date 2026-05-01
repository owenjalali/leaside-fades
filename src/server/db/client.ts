import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.ts";

export function createDatabaseClient(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) {
        throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
    }

    const pool = new Pool({ connectionString });
    const db = drizzle(pool, { schema });

    return { db, pool };
}
