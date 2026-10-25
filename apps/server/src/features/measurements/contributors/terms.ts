import { contributors, termsAcceptances } from "@openbts/drizzle";
import type { MeasurementTerms } from "@openbts/shared/contract";
import { desc, inArray } from "drizzle-orm";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { loadCrowdSettings } from "../settings.js";

type Acceptance = { version: number; acceptedAt: Date };

export async function findLatestAcceptances(userIds: readonly string[]): Promise<Map<string, Acceptance>> {
  const rows = await db
    .selectDistinctOn([termsAcceptances.userId], {
      userId: termsAcceptances.userId,
      version: termsAcceptances.version,
      acceptedAt: termsAcceptances.acceptedAt,
    })
    .from(termsAcceptances)
    .where(inArray(termsAcceptances.userId, [...userIds]))
    .orderBy(termsAcceptances.userId, desc(termsAcceptances.version));
  return new Map(rows.map(({ userId, ...acceptance }) => [userId, acceptance]));
}

export async function findLatestAcceptance(userId: string): Promise<Acceptance | undefined> {
  return (await findLatestAcceptances([userId])).get(userId);
}

function toTerms(currentVersion: number, accepted: Acceptance | undefined): MeasurementTerms {
  return { currentVersion, acceptedVersion: accepted?.version ?? null, acceptedAt: accepted?.acceptedAt.toISOString() ?? null };
}

export async function findTerms(userId: string): Promise<MeasurementTerms> {
  const [{ termsVersion }, accepted] = await Promise.all([loadCrowdSettings(), findLatestAcceptance(userId)]);
  return toTerms(termsVersion, accepted);
}

export async function acceptTerms(userId: string, version: number): Promise<MeasurementTerms> {
  const { termsVersion } = await loadCrowdSettings();
  if (version !== termsVersion) throw new ErrorResponse("CONFLICT", { message: `The current contributor terms are version ${termsVersion}` });

  await db.transaction(async (tx) => {
    await tx.insert(contributors).values({ userId }).onConflictDoNothing();
    await tx.insert(termsAcceptances).values({ userId, version }).onConflictDoNothing();
  });
  return toTerms(termsVersion, await findLatestAcceptance(userId));
}
