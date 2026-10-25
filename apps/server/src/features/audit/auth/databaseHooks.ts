import type { GenericEndpointContext } from "better-auth";
import { verifyJWT } from "better-auth/crypto";

import { logger } from "../../../utils/logger.js";
import { systemAuditContext } from "../context.js";
import { runAuditedOperation } from "../operation.js";
import {
  type AccountUser,
  type AuthEvent,
  SECRET_CHANGED,
  created,
  fieldsOf,
  ownEmailChanged,
  ownPasswordChanged,
  twoFactorChanged,
  usernameOf,
} from "./events.js";
import { authAuditContext, recordAuthEvent, requestAuditContext } from "./record.js";
import { accountSnapshots } from "./snapshots.js";
import { auditsUserFields } from "./userAdministration.js";

type HookCtx = GenericEndpointContext;

const VERIFY_EMAIL_PATH = "/verify-email";
const RESET_PASSWORD_PATH = "/reset-password";
const CREDENTIAL_PROVIDER_ID = "credential";

const pendingBanLifts = new WeakSet<object>();
const pendingSecurityChanges = new WeakMap<object, (user: AccountUser) => AuthEvent>();
const contextsWithNewUser = new WeakSet<object>();

async function emailInVerificationToken(ctx: HookCtx): Promise<string | null> {
  const token: unknown = ctx.query?.token;
  const payload: unknown = typeof token === "string" ? await verifyJWT(token, ctx.context.secret) : null;
  const { email } = fieldsOf(payload);
  return typeof email === "string" ? email : null;
}

export function rememberLiftedBan(data: Record<string, unknown>, ctx: HookCtx | null): void {
  if (ctx && data.banned === false && !auditsUserFields(ctx.path)) pendingBanLifts.add(ctx);
}

export async function auditLiftedBan(user: AccountUser | null, ctx: HookCtx | null): Promise<void> {
  if (!ctx || !pendingBanLifts.delete(ctx) || !user) return;

  const metadata = { username: usernameOf(user) };
  try {
    await runAuditedOperation(systemAuditContext(), { kind: "user.unban", metadata }, (_tx, audit) =>
      audit.log({ entity: "users", op: "update", recordId: user.id, old: { banned: true }, new: { banned: false }, metadata }),
    );
  } catch (error) {
    logger.error("auth.userAudit.record", { error });
  }
}

export async function rememberUserSecurityChange(data: Record<string, unknown>, ctx: HookCtx | null): Promise<void> {
  if (!ctx || auditsUserFields(ctx.path)) return;

  const { twoFactorEnabled, email } = data;
  if (typeof twoFactorEnabled === "boolean" && twoFactorEnabled !== ctx.context.session?.user.twoFactorEnabled) {
    pendingSecurityChanges.set(ctx, (user) => twoFactorChanged(user, twoFactorEnabled));
  }
  if (ctx.path === VERIFY_EMAIL_PATH && typeof email === "string") {
    const previous = await emailInVerificationToken(ctx);
    pendingSecurityChanges.set(ctx, (user) => ownEmailChanged(user, previous, email));
  }
}

export async function auditUserSecurityChange(user: AccountUser | null, ctx: HookCtx | null): Promise<void> {
  if (!ctx || !user) return;

  const describe = pendingSecurityChanges.get(ctx);
  if (describe === undefined) return;

  pendingSecurityChanges.delete(ctx);
  await recordAuthEvent(ctx.path, authAuditContext(ctx, user.id), () => describe(user));
}

export function rememberCreatedUser(ctx: HookCtx | null): void {
  if (ctx) contextsWithNewUser.add(ctx);
}

export async function auditLinkedAccount(account: { id: string; userId: string; providerId: string }, ctx: HookCtx | null): Promise<void> {
  if (!ctx || account.providerId === CREDENTIAL_PROVIDER_ID || contextsWithNewUser.has(ctx)) return;

  const describe = async () => created("user.account_link", "accounts", await accountSnapshots(account.id));
  await recordAuthEvent(ctx.path, authAuditContext(ctx, account.userId), describe);
}

export async function auditPasswordReset(user: AccountUser, request: Request | undefined): Promise<void> {
  const describe = () => ownPasswordChanged(user, SECRET_CHANGED, { reset: true });
  await recordAuthEvent(RESET_PASSWORD_PATH, requestAuditContext(request?.headers, user.id), describe);
}
