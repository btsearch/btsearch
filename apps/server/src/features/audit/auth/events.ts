import type { AuditEntity, AuditOperationKind } from "@openbts/shared/audit";

import { toAuditMetadata } from "../metadata.js";
import type { AuditEntryInput, AuditMetadata } from "../types.js";
import type { AuthSnapshot, Owner } from "./snapshots.js";

export type Fields = Record<string, unknown>;
export type AccountUser = { id: string; username?: unknown };
export type SignedIn = { user: AccountUser; session: { id: string; expiresAt: Date; impersonatedBy?: unknown } };
export type AuthEvent = { kind: AuditOperationKind; entries: AuditEntryInput[] };

export const SECRET_CHANGED = "[changed]";

export function fieldsOf(value: unknown): Fields {
  return toAuditMetadata(value) ?? {};
}

export function usernameOf(user: AccountUser): string | null {
  return typeof user.username === "string" ? user.username : null;
}

export function ownerOf(user: AccountUser): Owner {
  return { user_id: user.id, username: usernameOf(user) };
}

export function pick(values: Fields, keys: readonly string[]): Fields {
  return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

export function changedKeys<Key extends string>(keys: readonly Key[], previous: Record<Key, unknown>, next: Record<Key, unknown>): Key[] {
  return keys.filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
}

export function created(kind: AuditOperationKind, entity: AuditEntity, rows: AuthSnapshot[]): AuthEvent {
  return { kind, entries: rows.map(({ recordId, owner, values }) => ({ entity, op: "create", recordId, new: values, metadata: owner })) };
}

export function deleted(kind: AuditOperationKind, entity: AuditEntity, rows: AuthSnapshot[]): AuthEvent {
  return { kind, entries: rows.map(({ recordId, owner, values }) => ({ entity, op: "delete", recordId, old: values, metadata: owner })) };
}

export function updated(kind: AuditOperationKind, entity: AuditEntity, before: AuthSnapshot[], after: AuthSnapshot[]): AuthEvent {
  const entries = after.flatMap(({ recordId, owner, values }): AuditEntryInput[] => {
    const previous = before.find((row) => row.recordId === recordId)?.values;
    if (previous === undefined) return [{ entity, op: "update", recordId, new: values, metadata: owner }];

    const changed = changedKeys(Object.keys(values), previous, values);
    if (changed.length === 0) return [];
    return [{ entity, op: "update", recordId, old: pick(previous, changed), new: pick(values, changed), metadata: owner }];
  });
  return { kind, entries };
}

function ownAccountChange(
  kind: AuditOperationKind,
  user: AccountUser,
  values: { old?: Fields; new: Fields },
  details: AuditMetadata = {},
): AuthEvent {
  const metadata = { username: usernameOf(user), self: true, ...details };
  return { kind, entries: [{ entity: "users", op: "update", recordId: user.id, ...values, metadata }] };
}

export function ownPasswordChanged(user: AccountUser, password: string | null, details?: AuditMetadata): AuthEvent {
  return ownAccountChange("user.password", user, { new: { password } }, details);
}

export function ownEmailChanged(user: AccountUser, previous: string | null, next: string): AuthEvent {
  return ownAccountChange("user.email", user, { old: { email: previous }, new: { email: next } });
}

export function twoFactorChanged(user: AccountUser, enabled: boolean): AuthEvent {
  const kind = enabled ? "user.two_factor_enable" : "user.two_factor_disable";
  return ownAccountChange(kind, user, { old: { twoFactorEnabled: !enabled }, new: { twoFactorEnabled: enabled } });
}

export function backupCodesRegenerated(user: AccountUser): AuthEvent {
  return ownAccountChange("user.backup_codes", user, { new: { backupCodes: SECRET_CHANGED } });
}

export function secretRotated(clients: AuthSnapshot[]): AuthEvent {
  const entries = clients.map(({ recordId, owner }): AuditEntryInput => ({
    entity: "oauth_clients",
    op: "update",
    recordId,
    new: { clientSecret: SECRET_CHANGED },
    metadata: owner,
  }));
  return { kind: "oauth_client.rotate_secret", entries };
}

export function consentGiven(before: AuthSnapshot[], after: AuthSnapshot[]): AuthEvent {
  const added = after.filter((consent) => !before.some((earlier) => earlier.recordId === consent.recordId));
  if (added.length > 0) return created("oauth_consent.create", "oauth_consents", added);
  return updated("oauth_consent.update", "oauth_consents", before, after);
}

export function impersonationStarted(returned: Fields): AuthEvent | null {
  const { id: sessionId, impersonatedBy, expiresAt } = fieldsOf(returned.session);
  const { id: userId, username } = fieldsOf(returned.user);
  if (typeof sessionId !== "string" || typeof userId !== "string") return null;

  const entry: AuditEntryInput = {
    entity: "sessions",
    op: "create",
    recordId: sessionId,
    new: { impersonatedBy, expiresAt },
    metadata: ownerOf({ id: userId, username }),
  };
  return { kind: "user.impersonate", entries: [entry] };
}

export function impersonationEnded({ session, user }: SignedIn): AuthEvent {
  const entry: AuditEntryInput = {
    entity: "sessions",
    op: "delete",
    recordId: session.id,
    old: { impersonatedBy: session.impersonatedBy, expiresAt: session.expiresAt },
    metadata: ownerOf(user),
  };
  return { kind: "user.impersonate_stop", entries: [entry] };
}
