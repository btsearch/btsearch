import { accounts, apikeys, oauthClients, oauthConsents, passkeys, sessions, users } from "@openbts/drizzle";
import { type SQL, and, eq, gt } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "../../../database/psql.js";
import type { Fields } from "./events.js";

export type Owner = { user_id: string | null; username: string | null };
export type AuthSnapshot = { recordId: string; owner: Owner; values: Fields };

type OwnedRow = { recordId: string; user_id: string | null; username: string | null } & Fields;

const API_KEY_COLUMNS = {
  name: apikeys.name,
  prefix: apikeys.prefix,
  enabled: apikeys.enabled,
  expiresAt: apikeys.expiresAt,
  permissions: apikeys.permissions,
  metadata: apikeys.metadata,
};
const PASSKEY_COLUMNS = { name: passkeys.name, deviceType: passkeys.deviceType, backedUp: passkeys.backedUp, aaguid: passkeys.aaguid };
const OAUTH_CLIENT_COLUMNS = {
  name: oauthClients.name,
  redirectUris: oauthClients.redirectUris,
  tokenEndpointAuthMethod: oauthClients.tokenEndpointAuthMethod,
  grantTypes: oauthClients.grantTypes,
  scopes: oauthClients.scopes,
};
const OAUTH_CONSENT_COLUMNS = { clientId: oauthConsents.clientId, scopes: oauthConsents.scopes };
const ACCOUNT_COLUMNS = { providerId: accounts.providerId };
const SESSION_COLUMNS = { createdAt: sessions.createdAt, userAgent: sessions.userAgent };

const uuidSchema = z.uuid();

function uuidOf(value: unknown): string | null {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parsedJson(text: string | null): unknown {
  if (text === null) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toSnapshot({ recordId, user_id, username, ...values }: OwnedRow): AuthSnapshot {
  return { recordId, owner: { user_id, username }, values };
}

export async function apiKeySnapshots(keyId: unknown): Promise<AuthSnapshot[]> {
  const id = uuidOf(keyId);
  if (id === null) return [];

  const rows = await db
    .select({ recordId: apikeys.id, user_id: apikeys.referenceId, username: users.username, ...API_KEY_COLUMNS })
    .from(apikeys)
    .leftJoin(users, eq(users.id, apikeys.referenceId))
    .where(eq(apikeys.id, id));
  return rows.map(({ permissions, metadata, ...row }) =>
    toSnapshot({ ...row, permissions: parsedJson(permissions), metadata: parsedJson(metadata) }),
  );
}

export async function passkeySnapshots(passkeyId: unknown): Promise<AuthSnapshot[]> {
  const id = uuidOf(passkeyId);
  if (id === null) return [];

  const rows = await db
    .select({ recordId: passkeys.id, user_id: passkeys.userId, username: users.username, ...PASSKEY_COLUMNS })
    .from(passkeys)
    .leftJoin(users, eq(users.id, passkeys.userId))
    .where(eq(passkeys.id, id));
  return rows.map(toSnapshot);
}

export async function oauthClientSnapshots(clientId: unknown): Promise<AuthSnapshot[]> {
  if (typeof clientId !== "string") return [];

  const rows = await db
    .select({ recordId: oauthClients.clientId, user_id: oauthClients.userId, username: users.username, ...OAUTH_CLIENT_COLUMNS })
    .from(oauthClients)
    .leftJoin(users, eq(users.id, oauthClients.userId))
    .where(eq(oauthClients.clientId, clientId));
  return rows.map(toSnapshot);
}

async function consentSnapshots(condition: SQL): Promise<AuthSnapshot[]> {
  const rows = await db
    .select({ recordId: oauthConsents.id, user_id: oauthConsents.userId, username: users.username, ...OAUTH_CONSENT_COLUMNS })
    .from(oauthConsents)
    .leftJoin(users, eq(users.id, oauthConsents.userId))
    .where(condition);
  return rows.map(toSnapshot);
}

export async function consentSnapshotsById(consentId: unknown): Promise<AuthSnapshot[]> {
  const id = uuidOf(consentId);
  return id === null ? [] : consentSnapshots(eq(oauthConsents.id, id));
}

export async function consentSnapshotsOf(userId: string): Promise<AuthSnapshot[]> {
  return consentSnapshots(eq(oauthConsents.userId, userId));
}

export async function accountSnapshots(accountId: unknown): Promise<AuthSnapshot[]> {
  const id = uuidOf(accountId);
  if (id === null) return [];

  const rows = await db
    .select({ recordId: accounts.id, user_id: accounts.userId, username: users.username, ...ACCOUNT_COLUMNS })
    .from(accounts)
    .leftJoin(users, eq(users.id, accounts.userId))
    .where(eq(accounts.id, id));
  return rows.map(toSnapshot);
}

async function sessionSnapshots(condition: SQL): Promise<AuthSnapshot[]> {
  const rows = await db
    .select({ recordId: sessions.id, user_id: sessions.userId, username: users.username, ...SESSION_COLUMNS })
    .from(sessions)
    .leftJoin(users, eq(users.id, sessions.userId))
    .where(condition);
  return rows.map(toSnapshot);
}

export async function sessionSnapshotsByToken(token: unknown): Promise<AuthSnapshot[]> {
  return typeof token === "string" ? sessionSnapshots(eq(sessions.token, token)) : [];
}

export async function activeSessionSnapshotsOf(userId: unknown): Promise<AuthSnapshot[]> {
  const id = uuidOf(userId);
  return id === null ? [] : sessionSnapshots(and(eq(sessions.userId, id), gt(sessions.expiresAt, new Date()))!);
}
