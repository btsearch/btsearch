import { roleGrantRegions, roleGrants, users } from "@openbts/drizzle";
import type { GrantRole } from "@openbts/shared/contract";
import { eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import { STAFF_ROLES } from "../../constants.js";
import db from "../../database/psql.js";

export type EditorGrant = { countryCode: string; isCountryWide: boolean; isMaintainer: boolean; regionIds: number[] };
export type ActorAccess = { userId: string; role: string; grants: EditorGrant[] };
export type ScopeTarget = { countryCode: string | null; regionId: number | null };
type GrantRow = { countryCode: string; grantRole: GrantRole; isCountryWide: boolean; regionId: number | null };

const accessByRequest = new WeakMap<FastifyRequest, Promise<ActorAccess | null>>();

export function actorIdFromRequest(req: FastifyRequest): string | null {
  return req.userSession?.user?.id ?? req.apiToken?.referenceId ?? null;
}

function addGrantRow(grants: EditorGrant[], row: GrantRow): void {
  let grant = grants.find((candidate) => candidate.countryCode === row.countryCode);
  if (!grant) {
    grant = { countryCode: row.countryCode, isCountryWide: false, isMaintainer: false, regionIds: [] };
    grants.push(grant);
  }
  if (row.isCountryWide) grant.isCountryWide = true;
  if (row.grantRole === "maintainer") grant.isMaintainer = true;
  if (row.regionId !== null) grant.regionIds.push(row.regionId);
}

async function loadActorAccess(userId: string): Promise<ActorAccess | null> {
  const [[user], grantRows] = await Promise.all([
    db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({
        countryCode: roleGrants.countryCode,
        grantRole: roleGrants.role,
        isCountryWide: roleGrants.isCountryWide,
        regionId: roleGrantRegions.regionId,
      })
      .from(roleGrants)
      .leftJoin(roleGrantRegions, eq(roleGrantRegions.grantId, roleGrants.id))
      .where(eq(roleGrants.userId, userId)),
  ]);
  if (!user) return null;
  if (user.role !== "editor") return { userId, role: user.role, grants: [] };

  const grants: EditorGrant[] = [];
  for (const row of grantRows) addGrantRow(grants, row);
  return { userId, role: user.role, grants };
}

export async function loadStaffAccess(): Promise<ActorAccess[]> {
  const rows = await db
    .select({
      userId: users.id,
      role: users.role,
      countryCode: roleGrants.countryCode,
      grantRole: roleGrants.role,
      isCountryWide: roleGrants.isCountryWide,
      regionId: roleGrantRegions.regionId,
    })
    .from(users)
    .leftJoin(roleGrants, eq(roleGrants.userId, users.id))
    .leftJoin(roleGrantRegions, eq(roleGrantRegions.grantId, roleGrants.id))
    .where(inArray(users.role, [...STAFF_ROLES]));

  const staff = new Map<string, ActorAccess>();
  for (const row of rows) {
    let access = staff.get(row.userId);
    if (!access) {
      access = { userId: row.userId, role: row.role, grants: [] };
      staff.set(row.userId, access);
    }

    const { countryCode, grantRole, isCountryWide, regionId } = row;
    if (access.role !== "editor" || countryCode === null || grantRole === null || isCountryWide === null) continue;
    addGrantRow(access.grants, { countryCode, grantRole, isCountryWide, regionId });
  }
  return [...staff.values()];
}

export function accessFromRequest(req: FastifyRequest): Promise<ActorAccess | null> {
  const cached = accessByRequest.get(req);
  if (cached) return cached;

  const actorId = actorIdFromRequest(req);
  const pending = actorId === null ? Promise.resolve(null) : loadActorAccess(actorId);
  accessByRequest.set(req, pending);
  return pending;
}

export function coversTarget(access: ActorAccess, target: ScopeTarget): boolean {
  if (access.role === "admin") return true;
  if (target.countryCode === null) return false;

  const grant = access.grants.find((candidate) => candidate.countryCode === target.countryCode);
  if (!grant) return false;
  if (grant.isCountryWide) return true;
  return target.regionId !== null && grant.regionIds.includes(target.regionId);
}

export function canSeeCountry(access: ActorAccess | null, countryCode: string): boolean {
  if (access === null) return false;
  return access.role === "admin" || access.grants.some((grant) => grant.countryCode === countryCode);
}
