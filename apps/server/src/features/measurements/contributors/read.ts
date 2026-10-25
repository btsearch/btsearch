import {
  contributorBlocks,
  contributors,
  deviceRevocations,
  deviceScores,
  deviceWeightsNow,
  devices,
  uploadFolds,
  uploads,
  users,
  vouches,
} from "@openbts/drizzle";
import type { MeasurementContributor, MeasurementContributorListQuery } from "@openbts/shared/contract";
import { type SQL, type SQLWrapper, and, asc, count, desc, eq, exists, inArray, isNull, min, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { toUserRef } from "../../users/userRef.js";
import { inForce } from "./eligibility.js";
import { findLatestAcceptances } from "./terms.js";

type DeviceWeight = { computed: number; effective: number; samples: number };
type ContributorFilters = Pick<MeasurementContributorListQuery, "isVouched" | "isBlocked" | "weightBelow">;

function rounded(weight: number): number {
  return Math.round(weight * 1000) / 1000;
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function meanWeight(weights: readonly DeviceWeight[], weightOf: (device: DeviceWeight) => number): number {
  if (weights.length === 0) return 0;
  const samples = weights.reduce((sum, device) => sum + device.samples, 0);
  if (samples === 0) return rounded(weights.reduce((sum, device) => sum + weightOf(device), 0) / weights.length);
  return rounded(weights.reduce((sum, device) => sum + weightOf(device) * device.samples, 0) / samples);
}

function selectDeviceWeights(condition?: SQL) {
  return db
    .select({
      userId: devices.userId,
      computed: deviceWeightsNow.computedWeight,
      effective: deviceWeightsNow.weight,
      samples: sql<number>`coalesce(sum(${uploadFolds.sampleCount}), 0)`.mapWith(Number).as("samples"),
    })
    .from(devices)
    .innerJoin(deviceWeightsNow, eq(deviceWeightsNow.deviceId, devices.id))
    .leftJoin(uploads, eq(uploads.deviceId, devices.id))
    .leftJoin(uploadFolds, and(eq(uploadFolds.uploadId, uploads.id), isNull(uploadFolds.unfoldedAt)))
    .where(condition)
    .groupBy(devices.id, deviceWeightsNow.computedWeight, deviceWeightsNow.weight);
}

function selectLatestScores(userIds: readonly string[]) {
  return db
    .selectDistinctOn([deviceScores.deviceId], {
      userId: devices.userId,
      readings: deviceScores.readings,
      taOnConfirmed: deviceScores.taOnConfirmed,
      taWithinTolerance: deviceScores.taWithinTolerance,
      droppedImplausible: deviceScores.droppedImplausible,
      mockReadings: deviceScores.mockReadings,
      phantomCells: deviceScores.phantomCells,
    })
    .from(deviceScores)
    .innerJoin(devices, eq(devices.id, deviceScores.deviceId))
    .where(inArray(devices.userId, [...userIds]))
    .orderBy(deviceScores.deviceId, desc(deviceScores.scoredOn));
}

type DeviceScore = Awaited<ReturnType<typeof selectLatestScores>>[number];

function toTrackRecord(scores: readonly DeviceScore[]): MeasurementContributor["trackRecord"] {
  const total = (valueOf: (score: DeviceScore) => number) => scores.reduce((sum, score) => sum + valueOf(score), 0);
  const readings = total((score) => score.readings);
  const taOnConfirmed = total((score) => score.taOnConfirmed);
  return {
    timingAdvanceAgreement: taOnConfirmed === 0 ? null : total((score) => score.taWithinTolerance) / taOnConfirmed,
    droppedShare: share(
      total((score) => score.droppedImplausible),
      readings,
    ),
    mockShare: share(
      total((score) => score.mockReadings),
      readings,
    ),
    phantomCells: total((score) => score.phantomCells),
  };
}

function selectContributors(userIds: readonly string[]) {
  const voucher = alias(users, "voucher");
  const blocker = alias(users, "blocker");
  return db
    .select({
      user: { id: users.id, username: users.username, name: users.name, image: users.image },
      vouch: vouches,
      vouchedBy: { id: voucher.id, username: voucher.username, name: voucher.name, image: voucher.image },
      block: contributorBlocks,
      blockedBy: { id: blocker.id, username: blocker.username, name: blocker.name, image: blocker.image },
    })
    .from(contributors)
    .innerJoin(users, eq(users.id, contributors.userId))
    .leftJoin(vouches, and(eq(vouches.userId, contributors.userId), inForce(vouches.until)))
    .leftJoin(voucher, eq(voucher.id, vouches.vouchedById))
    .leftJoin(contributorBlocks, and(eq(contributorBlocks.userId, contributors.userId), inForce(contributorBlocks.until)))
    .leftJoin(blocker, eq(blocker.id, contributorBlocks.blockedById))
    .where(inArray(contributors.userId, [...userIds]));
}

type ContributorRow = Awaited<ReturnType<typeof selectContributors>>[number];

function selectUploadTotals(condition?: SQL) {
  return db
    .select({ userId: devices.userId, firstUploadAt: min(uploads.receivedAt).as("first_upload_at"), uploadCount: count().as("upload_count") })
    .from(uploads)
    .innerJoin(devices, eq(devices.id, uploads.deviceId))
    .where(condition)
    .groupBy(devices.userId);
}

type UploadTotals = Awaited<ReturnType<typeof selectUploadTotals>>[number];

function selectDeviceCounts(condition: SQL) {
  return db
    .select({ userId: devices.userId, deviceCount: count(), revokedDeviceCount: count(deviceRevocations.deviceId) })
    .from(devices)
    .leftJoin(deviceRevocations, eq(deviceRevocations.deviceId, devices.id))
    .where(condition)
    .groupBy(devices.userId);
}

type DeviceCounts = Awaited<ReturnType<typeof selectDeviceCounts>>[number];

function selectContributorWeights() {
  const weights = selectDeviceWeights().as("device_weights");
  const weighted = sql`sum(${weights.computed} * ${weights.samples}) / sum(${weights.samples})`;
  return db
    .select({
      userId: weights.userId,
      weight: sql<number>`round((CASE WHEN sum(${weights.samples}) > 0 THEN ${weighted} ELSE avg(${weights.computed}) END)::numeric, 3)`.as("weight"),
    })
    .from(weights)
    .groupBy(weights.userId)
    .as("contributor_weights");
}

type ContributorWeights = ReturnType<typeof selectContributorWeights>;

function weightOrZero(weights: ContributorWeights): SQL<number> {
  return sql<number>`coalesce(${weights.weight}, 0)`;
}

function presence(subquery: SQLWrapper, isPresent: boolean | undefined): SQL | undefined {
  if (isPresent === undefined) return undefined;
  return isPresent ? exists(subquery) : notExists(subquery);
}

function contributorFilters({ isVouched, isBlocked, weightBelow }: ContributorFilters, weights: ContributorWeights): SQL | undefined {
  const vouch = db
    .select({ userId: vouches.userId })
    .from(vouches)
    .where(and(eq(vouches.userId, contributors.userId), inForce(vouches.until)));
  const block = db
    .select({ userId: contributorBlocks.userId })
    .from(contributorBlocks)
    .where(and(eq(contributorBlocks.userId, contributors.userId), inForce(contributorBlocks.until)));
  return and(
    presence(vouch, isVouched),
    presence(block, isBlocked),
    weightBelow === undefined ? undefined : sql`${weightOrZero(weights)} < ${weightBelow}`,
  );
}

export async function findRankedContributorIds(
  { sort, ...filters }: Pick<MeasurementContributorListQuery, "sort"> & ContributorFilters,
  limit: number,
  offset: number,
): Promise<string[]> {
  const direction = sort.startsWith("-") ? desc : asc;
  const weights = selectContributorWeights();
  const where = contributorFilters(filters, weights);
  if (sort === "weight" || sort === "-weight") {
    const rows = await db
      .select({ userId: contributors.userId })
      .from(contributors)
      .leftJoin(weights, eq(weights.userId, contributors.userId))
      .where(where)
      .orderBy(direction(weightOrZero(weights)), asc(contributors.userId))
      .limit(limit)
      .offset(offset);
    return rows.map((row) => row.userId);
  }

  const firstUploads = selectUploadTotals().as("first_uploads");
  const ranked = db
    .select({ userId: contributors.userId })
    .from(contributors)
    .leftJoin(firstUploads, eq(firstUploads.userId, contributors.userId))
    .$dynamic();
  const rows = await (filters.weightBelow === undefined ? ranked : ranked.leftJoin(weights, eq(weights.userId, contributors.userId)))
    .where(where)
    .orderBy(sql`${direction(firstUploads.firstUploadAt)} NULLS LAST`, asc(contributors.userId))
    .limit(limit)
    .offset(offset);
  return rows.map((row) => row.userId);
}

export async function countContributors(filters: ContributorFilters): Promise<number> {
  const weights = selectContributorWeights();
  const counted = db.select({ total: count() }).from(contributors).$dynamic();
  const [row] = await (filters.weightBelow === undefined ? counted : counted.leftJoin(weights, eq(weights.userId, contributors.userId))).where(
    contributorFilters(filters, weights),
  );
  return row?.total ?? 0;
}

type ContributorDetails = {
  acceptance: { version: number } | undefined;
  uploadTotals: UploadTotals | undefined;
  deviceCounts: DeviceCounts | undefined;
  weights: readonly DeviceWeight[];
  scores: readonly DeviceScore[];
};

function toContributor(row: ContributorRow, { acceptance, uploadTotals, deviceCounts, weights, scores }: ContributorDetails): MeasurementContributor {
  return {
    user: toUserRef(row.user),
    termsVersion: acceptance?.version ?? null,
    firstUploadAt: uploadTotals?.firstUploadAt?.toISOString() ?? null,
    deviceCount: deviceCounts?.deviceCount ?? 0,
    revokedDeviceCount: deviceCounts?.revokedDeviceCount ?? 0,
    uploadCount: uploadTotals?.uploadCount ?? 0,
    weight: { computed: meanWeight(weights, (device) => device.computed), effective: meanWeight(weights, (device) => device.effective) },
    trackRecord: toTrackRecord(scores),
    vouch:
      row.vouch === null
        ? null
        : {
            weight: rounded(row.vouch.weight),
            confirmsAlone: row.vouch.confirmsAlone,
            reason: row.vouch.reason,
            by: row.vouchedBy === null ? null : toUserRef(row.vouchedBy),
            at: row.vouch.vouchedAt.toISOString(),
            endsAt: row.vouch.until?.toISOString() ?? null,
          },
    block:
      row.block === null
        ? null
        : {
            reason: row.block.reason,
            by: row.blockedBy === null ? null : toUserRef(row.blockedBy),
            at: row.block.blockedAt.toISOString(),
            endsAt: row.block.until?.toISOString() ?? null,
          },
  };
}

export async function findContributors(userIds: readonly string[]): Promise<MeasurementContributor[]> {
  if (userIds.length === 0) return [];

  const ofUsers = inArray(devices.userId, [...userIds]);
  const [rows, acceptances, uploadTotals, deviceCounts, weights, scores] = await Promise.all([
    selectContributors(userIds),
    findLatestAcceptances(userIds),
    selectUploadTotals(ofUsers),
    selectDeviceCounts(ofUsers),
    selectDeviceWeights(ofUsers),
    selectLatestScores(userIds),
  ]);
  const rowsById = new Map(rows.map((row) => [row.user.id, row]));
  const uploadTotalsById = new Map(uploadTotals.map((totals) => [totals.userId, totals]));
  const deviceCountsById = new Map(deviceCounts.map((counts) => [counts.userId, counts]));
  const weightsById = Map.groupBy(weights, (weight) => weight.userId);
  const scoresById = Map.groupBy(scores, (score) => score.userId);

  return userIds.flatMap((userId) => {
    const row = rowsById.get(userId);
    if (!row) return [];
    return [
      toContributor(row, {
        acceptance: acceptances.get(userId),
        uploadTotals: uploadTotalsById.get(userId),
        deviceCounts: deviceCountsById.get(userId),
        weights: weightsById.get(userId) ?? [],
        scores: scoresById.get(userId) ?? [],
      }),
    ];
  });
}

export async function findContributor(userId: string): Promise<MeasurementContributor> {
  const [contributor] = await findContributors([userId]);
  if (!contributor) throw new ErrorResponse("NOT_FOUND");
  return contributor;
}
