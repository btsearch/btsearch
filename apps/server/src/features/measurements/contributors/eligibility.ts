import { contributorBlocks } from "@openbts/drizzle";
import { type Column, type SQL, and, eq, gt, isNull, or } from "drizzle-orm";

import db from "../../../database/psql.js";
import { DetailedErrorResponse, ErrorResponse } from "../../../errors.js";
import { type CrowdSettings, assertMeasurementUploadsEnabled, loadCrowdSettings } from "../settings.js";
import { findLatestAcceptance } from "./terms.js";

type ContributorBlock = { until: Date | null };

export function inForce(until: Column): SQL | undefined {
  return or(isNull(until), gt(until, new Date()));
}

export async function findActiveBlock(userId: string): Promise<ContributorBlock | undefined> {
  const [block] = await db
    .select({ until: contributorBlocks.until })
    .from(contributorBlocks)
    .where(and(eq(contributorBlocks.userId, userId), inForce(contributorBlocks.until)))
    .limit(1);
  return block;
}

export async function assertMayContribute(userId: string, appVersionCode: number): Promise<CrowdSettings> {
  assertMeasurementUploadsEnabled();
  const [settings, acceptance, block] = await Promise.all([loadCrowdSettings(), findLatestAcceptance(userId), findActiveBlock(userId)]);
  if (appVersionCode < settings.minAppVersionCode) throw new ErrorResponse("APP_UPDATE_REQUIRED");
  if (acceptance?.version !== settings.termsVersion) throw new ErrorResponse("TERMS_NOT_ACCEPTED");
  if (block) throw new DetailedErrorResponse("CONTRIBUTOR_BLOCKED", [{ endsAt: block.until?.toISOString() ?? null }]);
  return settings;
}
