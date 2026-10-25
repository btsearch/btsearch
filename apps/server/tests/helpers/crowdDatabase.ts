import type * as productionDatabase from "@openbts/drizzle/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, vi } from "vitest";

import type { DbTx } from "../../src/types/global.js";

const DATABASE_URL = process.env.ENGINE_TEST_DATABASE_URL ?? "";

const open: { transaction: DbTx | null } = { transaction: null };

export function databaseOfOpenTransaction() {
  const db = new Proxy(
    {},
    {
      get(_target, property) {
        if (open.transaction === null) return undefined;

        const member: unknown = Reflect.get(open.transaction, property);
        return typeof member === "function" ? member.bind(open.transaction) : member;
      },
    },
  );
  return { db, default: db };
}

let database: typeof productionDatabase;

export function describeOnCrowdDatabase(title: string, cases: () => void): void {
  describe.skipIf(DATABASE_URL === "")(`${title}, on PostgreSQL (every case is rolled back)`, { timeout: 120_000 }, () => {
    beforeAll(async () => {
      vi.stubEnv("DATABASE_URL", DATABASE_URL);
      database = await vi.importActual<typeof productionDatabase>("@openbts/drizzle/db");

      const [migrated] = await database.db.execute<{ found: string | null }>(
        sql`SELECT to_regclass('observations.observation_flags')::text AS found`,
      );
      if (!migrated?.found) throw new Error("ENGINE_TEST_DATABASE_URL must name a database with every migration of packages/drizzle applied");
    });

    afterAll(async () => {
      await database.sql.end();
    });

    cases();
  });
}

class RolledBack extends Error {}

export async function rolledBack(work: (tx: DbTx) => Promise<void>): Promise<void> {
  try {
    await database.db.transaction(async (tx) => {
      open.transaction = tx;
      await work(tx);
      throw new RolledBack();
    });
  } catch (error) {
    if (!(error instanceof RolledBack)) throw error;
  } finally {
    open.transaction = null;
  }
}
