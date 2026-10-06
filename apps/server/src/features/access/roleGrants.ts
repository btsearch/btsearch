import { countries, regions, roleGrantRegions, roleGrants, users } from "@openbts/drizzle";
import type { RoleGrant, RoleGrantCreate, UserRef } from "@openbts/shared/contract";
import { and, eq, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../constants.js";
import db from "../../database/psql.js";
import type { Database } from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import type { AuditMetadata, AuditRecorder } from "../audit/index.js";

const roleGrantSelectSchema = createSelectSchema(roleGrants);

type RoleGrantRow = z.infer<typeof roleGrantSelectSchema>;

export type RoleGrantWithRegions = { row: RoleGrantRow; regionIds: number[] };
export type RoleGrantInput = RoleGrantCreate & { grantedById: string | null };
type RoleSync = { userId: string; previousRole?: string; earlierGrantIds: readonly string[]; grantedById: string | null };

const STALE_GRANT: AuditMetadata = { stale: true };

function grantSnapshot({ row, regionIds }: RoleGrantWithRegions) {
  return { ...row, regionIds: regionIds.toSorted((left, right) => left - right) };
}

export function toRoleGrant({ row, regionIds }: RoleGrantWithRegions, user?: UserRef): RoleGrant {
  const grant: RoleGrant = {
    id: row.id,
    userId: row.userId,
    role: row.role,
    countryCode: row.countryCode,
    regionIds: row.isCountryWide ? null : regionIds.toSorted((left, right) => left - right),
    grantedById: row.grantedById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (user) grant.user = user;
  return grant;
}

export async function findRoleGrant(grantId: string): Promise<RoleGrantRow> {
  const [row] = await db.select().from(roleGrants).where(eq(roleGrants.id, grantId)).limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  return row;
}

export async function loadRegionIdsByGrant(handle: Database | DbTx, grantIds: readonly string[]): Promise<Map<string, number[]>> {
  const regionIdsByGrant = new Map<string, number[]>(grantIds.map((grantId) => [grantId, []]));
  if (grantIds.length === 0) return regionIdsByGrant;

  const rows = await handle
    .select({ grantId: roleGrantRegions.grantId, regionId: roleGrantRegions.regionId })
    .from(roleGrantRegions)
    .where(inArray(roleGrantRegions.grantId, [...grantIds]));
  for (const row of rows) regionIdsByGrant.get(row.grantId)?.push(row.regionId);
  return regionIdsByGrant;
}

async function assertRegionsInCountry(tx: DbTx, regionIds: readonly number[] | null, countryCode: string): Promise<void> {
  if (regionIds === null) return;

  const rows = await tx
    .select({ id: regions.id })
    .from(regions)
    .where(and(inArray(regions.id, [...regionIds]), eq(regions.countryCode, countryCode)));
  if (rows.length !== regionIds.length) throw new ErrorResponse("BAD_REQUEST", { message: "Every region must belong to the grant's country" });
}

async function replaceRegions(tx: DbTx, grantId: string, regionIds: readonly number[]): Promise<void> {
  await tx.delete(roleGrantRegions).where(eq(roleGrantRegions.grantId, grantId));
  if (regionIds.length > 0) await tx.insert(roleGrantRegions).values(regionIds.map((regionId) => ({ grantId, regionId })));
}

async function removeGrants(tx: DbTx, audit: AuditRecorder, rows: readonly RoleGrantRow[], metadata: AuditMetadata): Promise<void> {
  if (rows.length === 0) return;

  const grantIds = rows.map((row) => row.id);
  const regionIdsByGrant = await loadRegionIdsByGrant(tx, grantIds);
  await tx.delete(roleGrants).where(inArray(roleGrants.id, grantIds));
  await audit.logMany(
    rows.map((row) => ({
      entity: "role_grants",
      op: "delete",
      recordId: row.id,
      old: grantSnapshot({ row, regionIds: regionIdsByGrant.get(row.id) ?? [] }),
      metadata,
    })),
  );
}

export async function createRoleGrant(
  tx: DbTx,
  audit: AuditRecorder,
  input: RoleGrantInput,
): Promise<RoleGrantWithRegions & { roleChanged: boolean }> {
  const [user] = await tx.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).for("update").limit(1);
  if (!user) throw new ErrorResponse("BAD_REQUEST", { message: "User not found" });
  if (user.role === "admin") throw new ErrorResponse("CONFLICT", { message: "Administrators already have access everywhere" });

  const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, input.countryCode)).limit(1);
  if (!country) throw new ErrorResponse("BAD_REQUEST", { message: "Country not found" });

  const promoted = user.role !== "editor";
  if (promoted) await removeGrants(tx, audit, await tx.select().from(roleGrants).where(eq(roleGrants.userId, input.userId)), STALE_GRANT);

  const [existing] = await tx
    .select({ id: roleGrants.id })
    .from(roleGrants)
    .where(and(eq(roleGrants.userId, input.userId), eq(roleGrants.role, input.role), eq(roleGrants.countryCode, input.countryCode)))
    .limit(1);
  if (existing) throw new ErrorResponse("CONFLICT", { message: "This user already has this grant for this country" });

  await assertRegionsInCountry(tx, input.regionIds, input.countryCode);

  const [row] = await tx
    .insert(roleGrants)
    .values({
      userId: input.userId,
      role: input.role,
      countryCode: input.countryCode,
      isCountryWide: input.regionIds === null,
      grantedById: input.grantedById,
    })
    .returning();
  if (!row) throw new ErrorResponse("FAILED_TO_CREATE");

  const grant = { row, regionIds: input.regionIds ?? [] };
  await replaceRegions(tx, row.id, grant.regionIds);

  if (promoted) await tx.update(users).set({ role: "editor", updatedAt: new Date() }).where(eq(users.id, input.userId));

  await audit.log({
    entity: "role_grants",
    op: "create",
    recordId: row.id,
    new: grantSnapshot(grant),
    metadata: promoted ? { role_changed: { from: user.role, to: "editor" } } : null,
  });
  return { ...grant, roleChanged: promoted };
}

export async function updateRoleGrantRegions(
  tx: DbTx,
  audit: AuditRecorder,
  grantId: string,
  regionIds: number[] | null,
): Promise<RoleGrantWithRegions> {
  const [row] = await tx.select().from(roleGrants).where(eq(roleGrants.id, grantId)).for("update").limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  if (row.role === "maintainer" && regionIds !== null) {
    throw new ErrorResponse("BAD_REQUEST", { message: "A maintainer grant covers the whole country" });
  }

  await assertRegionsInCountry(tx, regionIds, row.countryCode);

  const previous = { row, regionIds: (await loadRegionIdsByGrant(tx, [grantId])).get(grantId) ?? [] };
  const [updated] = await tx
    .update(roleGrants)
    .set({ isCountryWide: regionIds === null, updatedAt: new Date() })
    .where(eq(roleGrants.id, grantId))
    .returning();
  if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");

  const grant = { row: updated, regionIds: regionIds ?? [] };
  await replaceRegions(tx, grantId, grant.regionIds);

  await audit.log({ entity: "role_grants", op: "update", recordId: grantId, old: grantSnapshot(previous), new: grantSnapshot(grant) });
  return grant;
}

export async function syncGrantsWithRole(
  tx: DbTx,
  audit: AuditRecorder,
  { userId, previousRole, earlierGrantIds, grantedById }: RoleSync,
): Promise<void> {
  const [user] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).for("update").limit(1);
  if (!user) return;

  const rows = await tx.select().from(roleGrants).where(eq(roleGrants.userId, userId));
  if (user.role !== "editor") return removeGrants(tx, audit, rows, { role_changed: { to: user.role } });

  const isPromotion = previousRole !== undefined && previousRole !== "editor";
  if (rows.length > 0 && !isPromotion) return;
  const stale = rows.filter((row) => earlierGrantIds.includes(row.id));
  await removeGrants(tx, audit, stale, STALE_GRANT);
  if (stale.length < rows.length) return;

  const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, LEGACY_COUNTRY_CODE)).limit(1);
  if (country) await createRoleGrant(tx, audit, { userId, role: "editor", countryCode: LEGACY_COUNTRY_CODE, regionIds: null, grantedById });
}

export async function deleteRoleGrant(tx: DbTx, audit: AuditRecorder, grantId: string): Promise<{ userId: string; roleChanged: boolean }> {
  const [row] = await tx.select().from(roleGrants).where(eq(roleGrants.id, grantId)).limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");

  const [user] = await tx.select({ role: users.role }).from(users).where(eq(users.id, row.userId)).for("update").limit(1);
  const regionIds = (await loadRegionIdsByGrant(tx, [grantId])).get(grantId) ?? [];

  const [deleted] = await tx.delete(roleGrants).where(eq(roleGrants.id, grantId)).returning({ id: roleGrants.id });
  if (!deleted) throw new ErrorResponse("NOT_FOUND");

  const [remaining] = await tx.select({ id: roleGrants.id }).from(roleGrants).where(eq(roleGrants.userId, row.userId)).limit(1);
  const demoted = !remaining && user?.role === "editor";
  if (demoted) await tx.update(users).set({ role: "user", updatedAt: new Date() }).where(eq(users.id, row.userId));

  await audit.log({
    entity: "role_grants",
    op: "delete",
    recordId: grantId,
    old: grantSnapshot({ row, regionIds }),
    metadata: demoted ? { role_changed: { from: "editor", to: "user" } } : null,
  });
  return { userId: row.userId, roleChanged: demoted };
}
