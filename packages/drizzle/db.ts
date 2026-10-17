import { refineCodecs } from "drizzle-orm/codecs";
import { textToDate, textToDateWithTz } from "drizzle-orm/pg-core/codecs";
import { drizzle } from "drizzle-orm/postgres-js";
import { postgresJsCodecs } from "drizzle-orm/postgres-js/codecs";
import postgres from "postgres";

import { relations } from "./schemas/relations.ts";

export function connectDatabase(connection: Partial<postgres.ConnectionParameters> = {}) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL environment variable is not set");

  const client = postgres(connectionString, {
    prepare: false,
    max: 10,
    idle_timeout: 100,
    connect_timeout: 10,
    connection,
  });

  return {
    sql: client,
    db: drizzle({
      client,
      relations,
      jit: true,
      codecs: refineCodecs(postgresJsCodecs, {
        timestamp: { normalize: textToDate },
        timestamptz: { normalize: textToDateWithTz },
      }),
    }),
  };
}

export const { sql, db } = connectDatabase();

export type Database = typeof db;
export default db;
