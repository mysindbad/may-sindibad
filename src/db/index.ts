import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __mySindbadPgErrorListenerInstalled?: boolean;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    // node-postgres defaults to no connection timeout. Bound connection
    // establishment so an unavailable database fails as a controlled request
    // error instead of leaving server work waiting indefinitely.
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

if (!globalForDb.__mySindbadPgErrorListenerInstalled) {
  pool.on("error", (error) => {
    // An idle pooled client can emit an error after a network partition.
    // Without a listener Node treats this as an unhandled EventEmitter error.
    console.error("Unexpected PostgreSQL pool error", error instanceof Error ? error.message : "unknown_error");
  });
  globalForDb.__mySindbadPgErrorListenerInstalled = true;
}

export const db = drizzle(pool);
