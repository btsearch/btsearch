import { analyzerUsage } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { sql } from "drizzle-orm";

import { logger } from "../../utils/logger.ts";

export async function recordAnalyzerUsage(): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  try {
    await db
      .insert(analyzerUsage)
      .values({ date: day, count: 1 })
      .onConflictDoUpdate({
        target: analyzerUsage.date,
        set: { count: sql`${analyzerUsage.count} + 1` },
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to record analyzer usage", { error: message });
  }
}
