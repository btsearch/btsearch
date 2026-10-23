import { contributors, termsAcceptances } from "@openbts/drizzle";
import type { MeasurementTerms } from "@openbts/shared/contract";
import { desc, eq } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { loadCrowdSettings } from "./settings.js";

export async function findLatestAcceptance(userId: string): Promise<{ version: number; acceptedAt: Date } | undefined> {
  const [accepted] = await db
    .select({ version: termsAcceptances.version, acceptedAt: termsAcceptances.acceptedAt })
    .from(termsAcceptances)
    .where(eq(termsAcceptances.userId, userId))
    .orderBy(desc(termsAcceptances.version))
    .limit(1);
  return accepted;
}

export async function findTerms(userId: string): Promise<MeasurementTerms> {
  const [{ termsVersion }, accepted] = await Promise.all([loadCrowdSettings(), findLatestAcceptance(userId)]);
  return { currentVersion: termsVersion, acceptedVersion: accepted?.version ?? null, acceptedAt: accepted?.acceptedAt.toISOString() ?? null };
}

export async function acceptTerms(userId: string, version: number): Promise<void> {
  const { termsVersion } = await loadCrowdSettings();
  if (version !== termsVersion) throw new ErrorResponse("CONFLICT", { message: `The current contributor terms are version ${termsVersion}` });

  await db.transaction(async (tx) => {
    await tx.insert(contributors).values({ userId }).onConflictDoNothing();
    await tx.insert(termsAcceptances).values({ userId, version }).onConflictDoNothing();
  });
}
