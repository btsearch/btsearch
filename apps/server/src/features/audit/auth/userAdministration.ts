import { roleGrants, users } from "@openbts/drizzle";
import type { AuditOperationKind } from "@openbts/shared/audit";
import type { GenericEndpointContext } from "better-auth";
import { getAuthoritativeSessionFromCtx, getSessionFromCtx } from "better-auth/api";
import { eq, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import { db } from "../../../database/psql.js";
import { logger } from "../../../utils/logger.js";
import { syncGrantsWithRole } from "../../access/roleGrants.js";
import { runAuditedOperation } from "../operation.js";
import type { AuditEntryInput } from "../types.js";
import { SECRET_CHANGED, changedKeys, fieldsOf, pick } from "./events.js";
import { authAuditContext } from "./record.js";

const userSnapshotSchema = createSelectSchema(users).pick({
  id: true,
  username: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  bio: true,
  forceTotp: true,
  twoFactorEnabled: true,
  role: true,
  banReason: true,
  banExpires: true,
  createdAt: true,
});

type HookCtx = GenericEndpointContext;
type UserSnapshot = z.infer<typeof userSnapshotSchema> & { banned: boolean; grantIds: string[] };
type AuditedUserField = (typeof AUDITED_USER_FIELDS)[number];
type UserChange = { kind: AuditOperationKind; entry: AuditEntryInput };
type UserRemover = "self" | "impersonator" | "admin";
type PendingUserAudit = { before: UserSnapshot; impersonatedBy: string | null };

const SET_ROLE_PATH = "/admin/set-role";
const UPDATE_USER_PATH = "/admin/update-user";
const SET_PASSWORD_PATH = "/admin/set-user-password";
const CREATE_USER_PATH = "/admin/create-user";
const REMOVE_USER_PATH = "/admin/remove-user";
export const SELF_DELETE_PATH = "/delete-user";
const BAN_FIELDS = ["banned", "banReason", "banExpires"] as const;
const PROFILE_FIELDS = ["name", "username", "bio", "emailVerified", "forceTotp", "image"] as const;
const AUDITED_USER_FIELDS = ["role", "email", "twoFactorEnabled", ...BAN_FIELDS, ...PROFILE_FIELDS] as const;
const AUDITED_FIELDS_BY_PATH: Record<string, readonly AuditedUserField[]> = {
  [SET_ROLE_PATH]: ["role"],
  [UPDATE_USER_PATH]: AUDITED_USER_FIELDS,
  "/admin/ban-user": BAN_FIELDS,
  "/admin/unban-user": BAN_FIELDS,
};
export const ADMINISTERED_USER_PATHS = [...Object.keys(AUDITED_FIELDS_BY_PATH), SET_PASSWORD_PATH, REMOVE_USER_PATH];
const REMOVAL_METADATA = { self: { self: true }, impersonator: { impersonated: true }, admin: null } as const;
const DEFAULT_ROLE = "user";

const pendingUserAudits = new WeakMap<object, PendingUserAudit>();

export function auditsUserFields(path: string): boolean {
  return Object.hasOwn(AUDITED_FIELDS_BY_PATH, path);
}

async function loadUserSnapshot(userId: string): Promise<UserSnapshot | undefined> {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      image: users.image,
      bio: users.bio,
      forceTotp: users.forceTotp,
      twoFactorEnabled: users.twoFactorEnabled,
      role: users.role,
      banned: users.banned,
      banReason: users.banReason,
      banExpires: users.banExpires,
      createdAt: users.createdAt,
      grantIds: sql<string[]>`ARRAY(SELECT ${roleGrants.id} FROM ${roleGrants} WHERE ${roleGrants.userId} = ${userId})`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ? { ...user, banned: user.banned === true } : undefined;
}

export async function rememberAdministeredUser(ctx: HookCtx, userId: string): Promise<void> {
  const before = await loadUserSnapshot(userId);
  if (before) pendingUserAudits.set(ctx.context, { before, impersonatedBy: null });
}

export async function rememberDeletingUser(ctx: HookCtx): Promise<void> {
  try {
    const session = await getAuthoritativeSessionFromCtx(ctx);
    if (!session) return;

    const impersonatedBy: unknown = session.session.impersonatedBy;
    const before = await loadUserSnapshot(session.user.id);
    if (before) pendingUserAudits.set(ctx.context, { before, impersonatedBy: typeof impersonatedBy === "string" ? impersonatedBy : null });
  } catch (error) {
    logger.error("auth.userAudit.snapshot", { error });
  }
}

function auditedFields(ctx: HookCtx): readonly AuditedUserField[] {
  const fields = AUDITED_FIELDS_BY_PATH[ctx.path] ?? [];
  if (ctx.path !== UPDATE_USER_PATH) return fields;

  const data: unknown = ctx.body?.data;
  return typeof data === "object" && data !== null ? fields.filter((field) => field in data) : [];
}

function userChangeKind(fields: readonly AuditedUserField[], after: UserSnapshot): AuditOperationKind | null {
  if (fields.includes("role")) return "user.role";
  if (fields.includes("banned")) return after.banned ? "user.ban" : "user.unban";
  if (fields.includes("email")) return "user.email";
  if (fields.includes("twoFactorEnabled")) return after.twoFactorEnabled === true ? "user.two_factor_enable" : "user.two_factor_disable";
  if (after.banned && (fields.includes("banReason") || fields.includes("banExpires"))) return "user.ban";
  return fields.some((field) => field !== "banReason" && field !== "banExpires") ? "user.update" : null;
}

function describeUserUpdate(before: UserSnapshot, after: UserSnapshot, audited: readonly AuditedUserField[]): UserChange | null {
  const fields = changedKeys(audited, before, after);
  const kind = userChangeKind(fields, after);
  if (kind === null) return null;

  return {
    kind,
    entry: {
      entity: "users",
      op: "update",
      recordId: before.id,
      old: pick(before, fields),
      new: pick(after, fields),
      metadata: { username: after.username },
    },
  };
}

function describeUserRemoval({ id, username, role, banned, createdAt }: UserSnapshot, removedBy: UserRemover): UserChange {
  const old = removedBy === "self" ? { id, role, createdAt } : { id, username, role, banned, createdAt };
  return { kind: "user.delete", entry: { entity: "users", op: "delete", recordId: id, old, metadata: REMOVAL_METADATA[removedBy] } };
}

function describePasswordChange({ id, username }: UserSnapshot): UserChange {
  return { kind: "user.password", entry: { entity: "users", op: "update", recordId: id, new: { password: SECRET_CHANGED }, metadata: { username } } };
}

function describeUserChange(ctx: HookCtx, { before, impersonatedBy }: PendingUserAudit, after: UserSnapshot | undefined): UserChange | null {
  if (ctx.path.startsWith(SELF_DELETE_PATH)) {
    if (after) return null;
    return describeUserRemoval(before, impersonatedBy === null ? "self" : "impersonator");
  }
  if (ctx.path === REMOVE_USER_PATH) return after ? null : describeUserRemoval(before, "admin");
  if (ctx.path === SET_PASSWORD_PATH) return after ? describePasswordChange(after) : null;
  return after ? describeUserUpdate(before, after, auditedFields(ctx)) : null;
}

function takePendingUserAudit(ctx: HookCtx): PendingUserAudit | undefined {
  const pending = pendingUserAudits.get(ctx.context);
  pendingUserAudits.delete(ctx.context);
  return pending;
}

async function auditUserChange(ctx: HookCtx, pending: PendingUserAudit, returned: unknown): Promise<void> {
  const isSelfDelete = ctx.path.startsWith(SELF_DELETE_PATH);
  if (returned instanceof Error) {
    const isRedirect = "status" in returned && returned.status === "FOUND";
    if (!(isSelfDelete && isRedirect)) return;
  }

  try {
    const change = describeUserChange(ctx, pending, await loadUserSnapshot(pending.before.id));
    if (!change) return;

    const isOwnDeletion = isSelfDelete && pending.impersonatedBy === null;
    const actorId = isSelfDelete ? pending.impersonatedBy : ((await getSessionFromCtx(ctx))?.user.id ?? null);
    const context = authAuditContext(ctx, actorId);
    if (isOwnDeletion) Object.assign(context, { ipAddress: null, userAgent: null });

    await runAuditedOperation(context, { kind: change.kind, metadata: change.entry.metadata }, (_tx, audit) => audit.log(change.entry));
  } catch (error) {
    logger.error("auth.userAudit.record", { error });
  }
}

async function auditCreatedUser(ctx: HookCtx, userId: string): Promise<void> {
  try {
    const [user, session] = await Promise.all([loadUserSnapshot(userId), getSessionFromCtx(ctx)]);
    if (!user || (user.role === DEFAULT_ROLE && !user.banned)) return;

    const { id, username, role, banned, banReason, banExpires } = user;
    const kind: AuditOperationKind = role === DEFAULT_ROLE ? "user.ban" : "user.role";
    await runAuditedOperation(authAuditContext(ctx, session?.user.id ?? null), { kind, metadata: { username } }, (_tx, audit) =>
      audit.log({ entity: "users", op: "create", recordId: id, new: { role, banned, banReason, banExpires }, metadata: { username } }),
    );
  } catch (error) {
    logger.error("auth.userAudit.record", { error });
  }
}

async function syncRoleGrants(ctx: HookCtx, userId: string, before?: UserSnapshot): Promise<void> {
  try {
    const [user, session] = await Promise.all([loadUserSnapshot(userId), getSessionFromCtx(ctx)]);
    if (!user) return;

    const actorId = session?.user.id ?? null;
    const kind = user.role === "editor" ? "grant.create" : "grant.delete";
    const sync = { userId: user.id, previousRole: before?.role, earlierGrantIds: before?.grantIds ?? [], grantedById: actorId };
    await runAuditedOperation(authAuditContext(ctx, actorId), { kind }, (tx, audit) => syncGrantsWithRole(tx, audit, sync));
  } catch (error) {
    logger.error("auth.setRole.syncGrants", { error });
  }
}

function isRoleWrite(ctx: HookCtx): boolean {
  return ctx.path === SET_ROLE_PATH || (ctx.path === UPDATE_USER_PATH && ctx.body?.data?.role !== undefined);
}

export async function auditUserAdministration(ctx: HookCtx, returned: unknown): Promise<void> {
  const pending = takePendingUserAudit(ctx);
  if (pending) await auditUserChange(ctx, pending, returned);
  if (returned instanceof Error) return;

  if (ctx.path === CREATE_USER_PATH) {
    const { id } = fieldsOf(fieldsOf(returned).user);
    if (typeof id !== "string") return;

    await auditCreatedUser(ctx, id);
    await syncRoleGrants(ctx, id);
    return;
  }
  if (pending && isRoleWrite(ctx)) await syncRoleGrants(ctx, pending.before.id, pending.before);
}
