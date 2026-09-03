import { extraIdentificators } from "@openbts/drizzle";
import { inArray } from "drizzle-orm/sql/expressions/conditions";

import { DATABASE_STATEMENT_BATCH_SIZE, DATABASE_WRITE_CONCURRENCY, runInConcurrentBatches } from "../database-batching.js";
import { db } from "../database.js";
import { chunk } from "../utils.js";
import type { OperatorPlan } from "./types.js";

interface MnoNameUpdate {
  extraIdentifierIds: number[];
  mnoName: string;
}

async function applyOperatorPlan(plan: OperatorPlan): Promise<void> {
  const now = new Date();

  for (const insertGroup of chunk(plan.inserts, DATABASE_STATEMENT_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- insert batches preserve the existing database write order
    await db.insert(extraIdentificators).values(
      insertGroup.map((target) => ({
        station_id: target.stationPk,
        mno_name: target.mnoName,
      })),
    );
  }

  const updates: MnoNameUpdate[] = plan.updates.flatMap((target) =>
    chunk(target.extraIdentifierIds, DATABASE_STATEMENT_BATCH_SIZE).map((extraIdentifierIds) => ({
      extraIdentifierIds,
      mnoName: target.mnoName,
    })),
  );

  await runInConcurrentBatches(updates, DATABASE_WRITE_CONCURRENCY, (update) =>
    db
      .update(extraIdentificators)
      .set({ mno_name: update.mnoName, updatedAt: now })
      .where(inArray(extraIdentificators.id, update.extraIdentifierIds)),
  );
}

export async function applyOperatorPlans(plans: OperatorPlan[]): Promise<void> {
  for (const plan of plans) {
    // oxlint-disable-next-line no-await-in-loop -- operator plans preserve timestamp and write ordering
    await applyOperatorPlan(plan);
  }
}
