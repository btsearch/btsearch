import { contributorBlocks, contributors, deviceScores, devices, observationFlags } from "@openbts/drizzle";
import { and, desc, eq, exists } from "drizzle-orm";

import db from "../../../database/psql.js";
import { inForce } from "../../measurements/contributors/eligibility.js";
import type { RaisedFlag } from "./kinds.js";
import { userSubject } from "./subjects.js";
import { type FlagSyncCounts, syncFlags } from "./sync.js";

const TRUSTED_SHARE_OF_EVERYONE = 0.7;
const MIN_READINGS = 100;

export type LatestDeviceScore = { deviceId: string; userId: string | null; isBlocked: boolean; taOnConfirmed: number; taWithinTolerance: number };

function agreementOf(scores: readonly LatestDeviceScore[]): { agreement: number | null; readings: number } {
  const readings = scores.reduce((total, score) => total + score.taOnConfirmed, 0);
  const agreed = scores.reduce((total, score) => total + score.taWithinTolerance, 0);
  return { agreement: readings === 0 ? null : agreed / readings, readings };
}

export function raiseContributorFlags(scores: readonly LatestDeviceScore[]): RaisedFlag<"untrustedContributor">[] {
  const everyone = agreementOf(scores).agreement;
  if (everyone === null) return [];

  const unblocked = scores.filter((score) => !score.isBlocked);
  return [...Map.groupBy(unblocked, (score) => score.userId)].flatMap(([userId, own]): RaisedFlag<"untrustedContributor">[] => {
    const { agreement, readings } = agreementOf(own);
    if (userId === null || agreement === null || readings < MIN_READINGS || agreement >= TRUSTED_SHARE_OF_EVERYONE * everyone) return [];
    return [
      {
        kind: "untrustedContributor",
        subjectKey: userSubject(userId),
        refs: { userId },
        evidence: { agreement, everyoneAgreement: everyone, readings },
        suggestion: null,
        measure: { deviceIds: own.map((score) => score.deviceId).toSorted() },
      },
    ];
  });
}

async function loadLatestScores(): Promise<LatestDeviceScore[]> {
  const rows = await db
    .selectDistinctOn([deviceScores.deviceId], {
      deviceId: deviceScores.deviceId,
      userId: contributors.userId,
      blockedUserId: contributorBlocks.userId,
      taOnConfirmed: deviceScores.taOnConfirmed,
      taWithinTolerance: deviceScores.taWithinTolerance,
    })
    .from(deviceScores)
    .innerJoin(devices, eq(devices.id, deviceScores.deviceId))
    .leftJoin(contributors, eq(contributors.userId, devices.userId))
    .leftJoin(contributorBlocks, and(eq(contributorBlocks.userId, devices.userId), inForce(contributorBlocks.until)))
    .orderBy(deviceScores.deviceId, desc(deviceScores.scoredOn));
  return rows.map(({ blockedUserId, ...score }) => ({ ...score, isBlocked: blockedUserId !== null }));
}

export async function syncContributorFlags(): Promise<FlagSyncCounts> {
  const raised = raiseContributorFlags(await loadLatestScores());
  const isBlocked = db
    .select({ userId: contributorBlocks.userId })
    .from(contributorBlocks)
    .where(and(eq(contributorBlocks.userId, observationFlags.userId), inForce(contributorBlocks.until)));
  return db.transaction((tx) => syncFlags(tx, { kinds: ["untrustedContributor"], raised, fixed: exists(isBlocked) }));
}
