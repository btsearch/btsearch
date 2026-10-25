import type { AuditEntity, AuditOperationKind } from "@openbts/shared/audit";
import type { GenericEndpointContext } from "better-auth";
import { getAuthoritativeSessionFromCtx } from "better-auth/api";

import { logger } from "../../../utils/logger.js";
import {
  type AuthEvent,
  type Fields,
  SECRET_CHANGED,
  type SignedIn,
  backupCodesRegenerated,
  consentGiven,
  created,
  deleted,
  fieldsOf,
  impersonationEnded,
  impersonationStarted,
  ownPasswordChanged,
  secretRotated,
  updated,
} from "./events.js";
import { authAuditContext, recordAuthEvent } from "./record.js";
import {
  type AuthSnapshot,
  accountSnapshots,
  activeSessionSnapshotsOf,
  apiKeySnapshots,
  consentSnapshotsById,
  consentSnapshotsOf,
  oauthClientSnapshots,
  passkeySnapshots,
  sessionSnapshotsByToken,
} from "./snapshots.js";

type EndpointInput = { body: Fields; returned: Fields; before: AuthSnapshot[]; session: SignedIn | null };
type Snapshot = (body: Fields, ctx: GenericEndpointContext) => Promise<AuthSnapshot[]>;
type EndpointEvent = { snapshot?: Snapshot; describe: (input: EndpointInput) => AuthEvent | null | Promise<AuthEvent | null> };
type RowLoader = (fields: Fields) => Promise<AuthSnapshot[]>;
type RowFilter = (row: AuthSnapshot, caller: SignedIn | null) => boolean;

const pendingSnapshots = new WeakMap<object, AuthSnapshot[]>();

function creates(kind: AuditOperationKind, entity: AuditEntity, loadCreated: RowLoader): EndpointEvent {
  return { describe: async ({ returned }) => created(kind, entity, await loadCreated(returned)) };
}

function updates(kind: AuditOperationKind, entity: AuditEntity, loadUpdated: RowLoader): EndpointEvent {
  return { snapshot: loadUpdated, describe: async ({ body, before }) => updated(kind, entity, before, await loadUpdated(body)) };
}

function deletes(kind: AuditOperationKind, entity: AuditEntity, snapshot: Snapshot, isRemoved: RowFilter = () => true): EndpointEvent {
  const describe = ({ before, session }: EndpointInput) => {
    const removed = before.filter((row) => isRemoved(row, session));
    return deleted(kind, entity, removed);
  };
  return { snapshot, describe };
}

function revokesSessions(snapshot: Snapshot, isRevoked?: RowFilter): EndpointEvent {
  return deletes("user.sessions_revoke", "sessions", snapshot, isRevoked);
}

async function callerSnapshots(ctx: GenericEndpointContext, load: (userId: string) => Promise<AuthSnapshot[]>): Promise<AuthSnapshot[]> {
  const caller = await getAuthoritativeSessionFromCtx(ctx);
  return caller ? load(caller.user.id) : [];
}

async function consentsBeforeAnswer(body: Fields, ctx: GenericEndpointContext): Promise<AuthSnapshot[]> {
  return body.accept === true ? callerSnapshots(ctx, consentSnapshotsOf) : [];
}

async function consentAnswered({ body, before, session }: EndpointInput): Promise<AuthEvent | null> {
  if (body.accept !== true || session === null) return null;
  return consentGiven(before, await consentSnapshotsOf(session.user.id));
}

function isOwnedByCaller(row: AuthSnapshot, caller: SignedIn | null): boolean {
  return row.owner.user_id === caller?.user.id;
}

function isOtherSession(row: AuthSnapshot, caller: SignedIn | null): boolean {
  return row.recordId !== caller?.session.id;
}

const ENDPOINT_EVENTS = new Map<string, EndpointEvent>([
  ["/api-key/create", creates("api_key.create", "apikeys", (returned) => apiKeySnapshots(returned.id))],
  ["/api-key/update", updates("api_key.update", "apikeys", (body) => apiKeySnapshots(body.keyId))],
  ["/api-key/delete", deletes("api_key.delete", "apikeys", (body) => apiKeySnapshots(body.keyId))],
  ["/passkey/verify-registration", creates("passkey.create", "passkeys", (returned) => passkeySnapshots(returned.id))],
  ["/passkey/update-passkey", updates("passkey.update", "passkeys", (body) => passkeySnapshots(body.id))],
  ["/passkey/delete-passkey", deletes("passkey.delete", "passkeys", (body) => passkeySnapshots(body.id))],
  ["/oauth2/create-client", creates("oauth_client.create", "oauth_clients", (returned) => oauthClientSnapshots(returned.client_id))],
  ["/oauth2/update-client", updates("oauth_client.update", "oauth_clients", (body) => oauthClientSnapshots(body.client_id))],
  ["/oauth2/delete-client", deletes("oauth_client.delete", "oauth_clients", (body) => oauthClientSnapshots(body.client_id))],
  ["/oauth2/client/rotate-secret", { describe: async ({ body }) => secretRotated(await oauthClientSnapshots(body.client_id)) }],
  ["/oauth2/consent", { snapshot: consentsBeforeAnswer, describe: consentAnswered }],
  ["/oauth2/update-consent", updates("oauth_consent.update", "oauth_consents", (body) => consentSnapshotsById(body.id))],
  ["/oauth2/delete-consent", deletes("oauth_consent.delete", "oauth_consents", (body) => consentSnapshotsById(body.id))],
  ["/unlink-account", deletes("user.account_unlink", "accounts", (body) => accountSnapshots(body.accountId))],
  ["/two-factor/generate-backup-codes", { describe: ({ session }) => session && backupCodesRegenerated(session.user) }],
  [
    "/change-password",
    {
      describe: ({ body, session }) =>
        session && ownPasswordChanged(session.user, SECRET_CHANGED, { revoked_other_sessions: body.revokeOtherSessions === true }),
    },
  ],
  ["/revoke-session", revokesSessions((body) => sessionSnapshotsByToken(body.token), isOwnedByCaller)],
  ["/revoke-sessions", revokesSessions((_body, ctx) => callerSnapshots(ctx, activeSessionSnapshotsOf))],
  ["/revoke-other-sessions", revokesSessions((_body, ctx) => callerSnapshots(ctx, activeSessionSnapshotsOf), isOtherSession)],
  ["/multi-session/revoke", revokesSessions((body) => sessionSnapshotsByToken(body.sessionToken))],
  ["/admin/revoke-user-session", revokesSessions((body) => sessionSnapshotsByToken(body.sessionToken))],
  ["/admin/revoke-user-sessions", revokesSessions((body) => activeSessionSnapshotsOf(body.userId))],
  ["/admin/impersonate-user", { describe: ({ returned }) => impersonationStarted(returned) }],
  ["/admin/stop-impersonating", { describe: ({ session }) => session && impersonationEnded(session) }],
]);

export async function rememberEndpointSnapshot(ctx: GenericEndpointContext): Promise<void> {
  const snapshot = ENDPOINT_EVENTS.get(ctx.path)?.snapshot;
  if (snapshot === undefined) return;

  try {
    pendingSnapshots.set(ctx.context, await snapshot(fieldsOf(ctx.body), ctx));
  } catch (error) {
    logger.error("auth.audit", { path: ctx.path, error });
  }
}

export async function auditEndpointEvent(ctx: GenericEndpointContext, returned: unknown): Promise<void> {
  const event = ENDPOINT_EVENTS.get(ctx.path);
  if (event === undefined || returned instanceof Error) return;

  const { session } = ctx.context;
  const before = pendingSnapshots.get(ctx.context) ?? [];
  const input = { body: fieldsOf(ctx.body), returned: fieldsOf(returned), before, session };
  await recordAuthEvent(ctx.path, authAuditContext(ctx, session?.user.id ?? null), () => event.describe(input));
}
