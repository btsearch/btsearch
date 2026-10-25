import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { type GenericEndpointContext, betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { admin, multiSession, twoFactor, username } from "better-auth/plugins";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditEndpointEvent, rememberEndpointSnapshot } from "../../../src/features/audit/auth/endpoints.js";
import { consentGiven } from "../../../src/features/audit/auth/events.js";
import { forgetContributorMeasurements } from "../../../src/features/measurements/contributors/accountDeletion.js";
import { accessControl, adminRole, editorRole, userRole } from "../../../src/plugins/auth/permissions.js";
import type * as openbtsAuthPlugin from "../../../src/plugins/betterauth.plugin.js";
import { logger } from "../../../src/utils/logger.js";
import { dbMock } from "../../helpers/boundaries.js";
import { auditCalls, scriptAudit, whereQuery } from "../../helpers/mutationAssertions.js";

vi.mock("../../../src/plugins/auth/disposableEmailBlocklist.js", () => ({
  isDisposableEmailBlocklistReady: () => true,
  isDisposableEmail: () => false,
}));
vi.mock("../../../src/features/measurements/contributors/accountDeletion.js", () => ({
  forgetContributorMeasurements: vi.fn(async () => undefined),
}));

const { auth: openbtsAuth } = await vi.importActual<typeof openbtsAuthPlugin>("../../../src/plugins/betterauth.plugin.js");

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;
type Person = { email: string; password: string; name: string; username: string };

const BASE_URL = "http://localhost:3030";
const AUTH_URL = `${BASE_URL}/api/auth`;
const ANNA: Person = { email: "anna@example.invalid", password: "anna-admin-password", name: "Anna Admin", username: "anna" };
const OLEK: Person = { email: "olek@example.invalid", password: "olek-user-password", name: "Olek User", username: "olek" };
const BROWSER = { "user-agent": "Test Browser", "x-forwarded-for": "198.51.100.7" };

let store: Store;
let outbox: { verificationUrls: string[]; resetTokens: string[] };
let googleProfile: Row;

function createAuth() {
  return betterAuth({
    baseURL: BASE_URL,
    secret: "a-test-secret-that-is-long-enough-for-better-auth",
    database: memoryAdapter(store),
    advanced: { database: { generateId: () => randomUUID() } },
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ token }) => {
        outbox.resetTokens.push(token);
      },
      onPasswordReset: openbtsAuth.options.emailAndPassword.onPasswordReset,
    },
    emailVerification: {
      sendVerificationEmail: async ({ url }) => {
        outbox.verificationUrls.push(url);
      },
    },
    user: { changeEmail: { enabled: true } },
    socialProviders: {
      google: {
        clientId: "google-client",
        clientSecret: "google-secret",
        verifyIdToken: async () => true,
        getUserInfo: async () => ({
          user: { id: String(googleProfile.sub), name: "Olek", email: String(googleProfile.email), emailVerified: true },
          data: googleProfile,
        }),
      },
    },
    databaseHooks: openbtsAuth.options.databaseHooks,
    hooks: openbtsAuth.options.hooks,
    plugins: [
      admin({ ac: accessControl, adminRoles: ["admin"], defaultRole: "user", roles: { admin: adminRole, editor: editorRole, user: userRole } }),
      apiKey({ enableMetadata: true, defaultPrefix: "sk_", rateLimit: { enabled: false } }),
      multiSession(),
      passkey({ rpID: "localhost", rpName: "openbts" }),
      twoFactor({ skipVerificationOnEnable: true }),
      username(),
    ],
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
  });
}

type Auth = ReturnType<typeof createAuth>;

function cookiesOf(headers: Headers, earlier = ""): string {
  const cookies = new Map<string, string>();
  for (const cookie of [...earlier.split("; "), ...headers.getSetCookie().map((value) => value.split(";")[0] ?? "")]) {
    const separator = cookie.indexOf("=");
    if (separator > 0) cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

function asBrowser(cookie: string): Headers {
  return new Headers({ ...BROWSER, cookie });
}

function forgetDatabaseCalls() {
  dbMock.calls.length = 0;
}

function answerWithStoredRows(table: string, rows: () => Row[]) {
  dbMock.enqueueFor("select", table, { then: (resolve: (value: Row[]) => void) => resolve(rows()) });
}

function storedUser(id: unknown): Row {
  const user = store.user?.find((row) => row.id === id);
  if (user === undefined) throw new Error(`No stored user ${String(id)}`);
  return user;
}

function owned(row: Row, ownerId: unknown, values: Row): Row {
  return { recordId: row.id, user_id: ownerId, username: storedUser(ownerId).username, ...values };
}

function apiKeyRows(id: unknown): Row[] {
  return (store.apikey ?? [])
    .filter((key) => key.id === id)
    .map((key) =>
      owned(key, key.referenceId, {
        name: key.name,
        prefix: key.prefix,
        enabled: key.enabled,
        expiresAt: key.expiresAt,
        permissions: key.permissions ?? null,
        metadata: key.metadata,
      }),
    );
}

function sessionRows(matches: (session: Row) => boolean): Row[] {
  return (store.session ?? [])
    .filter(matches)
    .map((session) => owned(session, session.userId, { createdAt: session.createdAt, userAgent: session.userAgent }));
}

function sessionsOf(userId: string): Row[] {
  return (store.session ?? []).filter((session) => session.userId === userId);
}

function accountRows(matches: (account: Row) => boolean): Row[] {
  return (store.account ?? []).filter(matches).map((account) => owned(account, account.userId, { providerId: account.providerId }));
}

function userSnapshotRows(id: string): Row[] {
  const user = store.user?.find((row) => row.id === id);
  if (user === undefined) return [];

  const { username, name, email, emailVerified, twoFactorEnabled, role, createdAt } = user;
  const unbanned = { banned: false, banReason: null, banExpires: null };
  const profile = { image: null, bio: null, forceTotp: false, twoFactorEnabled: twoFactorEnabled ?? false };
  return [{ id, username, name, email, emailVerified, ...profile, role, ...unbanned, createdAt, grantIds: [] }];
}

function storeGithubAccount(userId: string): string {
  const id = randomUUID();
  const now = new Date();
  store.account?.push({ id, userId, providerId: "github", accountId: "github-user-42", accessToken: "gho_secret", createdAt: now, updatedAt: now });
  return id;
}

async function signUp(auth: Auth, person: Person): Promise<string> {
  const { user } = await auth.api.signUpEmail({ body: person });
  return user.id;
}

async function signIn(auth: Auth, person: Person, userAgent = BROWSER["user-agent"]): Promise<{ headers: Headers; token: string }> {
  const browser = { ...BROWSER, "user-agent": userAgent };
  const { headers, response } = await auth.api.signInEmail({
    body: { email: person.email, password: person.password },
    headers: new Headers(browser),
    returnHeaders: true,
  });
  return { headers: new Headers({ ...browser, cookie: cookiesOf(headers) }), token: response.token };
}

describe("better-auth audit events", () => {
  let auth: Auth;
  let annaId: string;
  let olekId: string;
  let asAnna: Headers;
  let asOlek: Headers;

  beforeEach(async () => {
    store = { user: [], session: [], account: [], verification: [], apikey: [], passkey: [], twoFactor: [] };
    outbox = { verificationUrls: [], resetTokens: [] };
    googleProfile = { sub: "google-subject-1", email: OLEK.email };
    dbMock.query.apikeys.findMany.mockResolvedValue([]);
    auth = createAuth();
    annaId = await signUp(auth, ANNA);
    olekId = await signUp(auth, OLEK);
    storedUser(annaId).role = "admin";
    asAnna = (await signIn(auth, ANNA)).headers;
    asOlek = (await signIn(auth, OLEK)).headers;
    forgetDatabaseCalls();
  });

  describe("API keys", () => {
    it("records a created key by its allowlisted fields, never the key, its start or its hash", async () => {
      answerWithStoredRows("apikeys", () => apiKeyRows(store.apikey?.at(-1)?.id));
      scriptAudit();
      const created = await auth.api.createApiKey({ body: { name: "ci" }, headers: asOlek });

      const audit = auditCalls();
      expect(audit.operations).toEqual([
        expect.objectContaining({
          kind: "api_key.create",
          actor_id: olekId,
          performed_by: olekId,
          source: "api",
          ip_address: "198.51.100.7",
          user_agent: "Test Browser",
        }),
      ]);
      expect(audit.entries).toEqual([
        expect.objectContaining({
          entity: "apikeys",
          op: "create",
          record_id: created.id,
          old_values: null,
          new_values: { name: "ci", prefix: "sk_", enabled: true, expiresAt: null, permissions: null, metadata: null },
          metadata: { user_id: olekId, username: "olek" },
        }),
      ]);
      const stored = store.apikey?.find((key) => key.id === created.id);
      for (const secret of [created.key, created.key.slice(0, 6), stored?.key, stored?.start]) {
        expect(JSON.stringify(audit)).not.toContain(String(secret));
      }
    });

    it("records the old and new value of each changed field", async () => {
      const created = await auth.api.createApiKey({ body: { name: "ci" }, headers: asAnna });
      forgetDatabaseCalls();

      answerWithStoredRows("apikeys", () => apiKeyRows(created.id));
      answerWithStoredRows("apikeys", () => apiKeyRows(created.id));
      scriptAudit();
      await auth.api.updateApiKey({ body: { keyId: created.id, name: "deploy", enabled: false }, headers: asAnna });

      expect(auditCalls().entries).toEqual([
        expect.objectContaining({
          entity: "apikeys",
          op: "update",
          record_id: created.id,
          old_values: { name: "ci", enabled: true },
          new_values: { name: "deploy", enabled: false },
          metadata: { user_id: annaId, username: "anna" },
        }),
      ]);
    });

    it("deletes a key only with the caller's headers, and records it from the row read before the delete even without a request", async () => {
      const created = await auth.api.createApiKey({ body: { name: "widget" }, headers: asOlek });
      forgetDatabaseCalls();

      await expect(auth.api.deleteApiKey({ body: { keyId: created.id } })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
      expect(store.apikey?.some((key) => key.id === created.id)).toBe(true);

      answerWithStoredRows("apikeys", () => apiKeyRows(created.id));
      scriptAudit();
      await auth.api.deleteApiKey({ body: { keyId: created.id }, headers: asOlek });

      const audit = auditCalls();
      expect(audit.operations).toEqual([expect.objectContaining({ kind: "api_key.delete", actor_id: olekId, source: "api" })]);
      expect(audit.entries).toEqual([
        expect.objectContaining({ entity: "apikeys", op: "delete", record_id: created.id, old_values: expect.objectContaining({ name: "widget" }) }),
      ]);
    });

    it("keeps the request when the audit entry cannot be written, and logs the failure", async () => {
      answerWithStoredRows("apikeys", () => apiKeyRows(store.apikey?.at(-1)?.id));
      dbMock.enqueueFor("insert", "audit_operations", new Error("connection lost"));

      await expect(auth.api.createApiKey({ body: { name: "ci" }, headers: asAnna })).resolves.toMatchObject({ name: "ci" });
      expect(logger.error).toHaveBeenCalledWith("auth.audit", expect.objectContaining({ path: "/api-key/create", actorId: annaId }));
    });
  });

  describe("sessions", () => {
    it("records the sessions each endpoint ends: the named one, every other one, then every one", async () => {
      const second = await signIn(auth, OLEK, "Second Browser");
      const current = await signIn(auth, OLEK, "Third Browser");
      const named = sessionsOf(olekId).find((session) => session.token === second.token);
      forgetDatabaseCalls();

      answerWithStoredRows("sessions", () => sessionRows((session) => session.token === second.token));
      scriptAudit();
      await auth.api.revokeSession({ body: { token: second.token }, headers: asOlek });
      const others = sessionsOf(olekId).filter((session) => session.token !== current.token);
      answerWithStoredRows("sessions", () => sessionRows((session) => session.userId === olekId));
      scriptAudit();
      await auth.api.revokeOtherSessions({ headers: current.headers });
      const [kept] = sessionsOf(olekId);
      answerWithStoredRows("sessions", () => sessionRows((session) => session.userId === olekId));
      scriptAudit();
      await auth.api.revokeSessions({ headers: current.headers });

      const audit = auditCalls();
      expect(audit.operations).toEqual([1, 2, 3].map(() => expect.objectContaining({ kind: "user.sessions_revoke", actor_id: olekId })));
      expect(audit.entries).toEqual([
        expect.objectContaining({
          entity: "sessions",
          op: "delete",
          record_id: named?.id,
          old_values: { createdAt: named?.createdAt, userAgent: "Second Browser" },
          metadata: { user_id: olekId, username: "olek" },
        }),
        ...others.map((session) => expect.objectContaining({ record_id: session.id })),
        expect.objectContaining({ record_id: kept?.id }),
      ]);
      expect(whereQuery("sessions", "select").params).toEqual([second.token]);
      expect(JSON.stringify(audit)).not.toContain(second.token);
    });

    it("records each session an administrator ends under the name of its owner", async () => {
      await signIn(auth, OLEK, "Second Browser");
      const ended = sessionsOf(olekId);
      forgetDatabaseCalls();

      answerWithStoredRows("sessions", () => sessionRows((session) => session.userId === olekId));
      scriptAudit();
      await auth.api.revokeUserSessions({ body: { userId: olekId }, headers: asAnna });

      expect(sessionsOf(olekId)).toEqual([]);
      expect(auditCalls().operations).toEqual([expect.objectContaining({ kind: "user.sessions_revoke", actor_id: annaId })]);
      expect(auditCalls().entries).toEqual(
        ended.map((session) => expect.objectContaining({ record_id: session.id, metadata: { user_id: olekId, username: "olek" } })),
      );
    });
  });

  it("records an impersonation for the administrator and its end for the user, and names the administrator behind changes in between", async () => {
    scriptAudit();
    const { headers, response } = await auth.api.impersonateUser({ body: { userId: olekId }, headers: asAnna, returnHeaders: true });
    const whileImpersonating = asBrowser(cookiesOf(headers, asAnna.get("cookie") ?? ""));
    answerWithStoredRows("apikeys", () => apiKeyRows(store.apikey?.at(-1)?.id));
    scriptAudit();
    await auth.api.createApiKey({ body: { name: "made by anna" }, headers: whileImpersonating });
    scriptAudit();
    await auth.api.stopImpersonating({ headers: whileImpersonating });

    const audit = auditCalls();
    expect(audit.operations).toEqual([
      expect.objectContaining({ kind: "user.impersonate", actor_id: annaId, performed_by: annaId }),
      expect.objectContaining({ kind: "api_key.create", actor_id: olekId, performed_by: annaId }),
      expect.objectContaining({ kind: "user.impersonate_stop", actor_id: olekId, performed_by: annaId }),
    ]);
    expect(audit.entries[0]).toEqual(
      expect.objectContaining({
        entity: "sessions",
        op: "create",
        record_id: response.session.id,
        new_values: { impersonatedBy: annaId, expiresAt: response.session.expiresAt },
        metadata: { user_id: olekId, username: "olek" },
      }),
    );
    expect(audit.entries.at(-1)).toEqual(expect.objectContaining({ entity: "sessions", op: "delete", record_id: response.session.id }));
    expect(JSON.stringify(audit)).not.toContain(response.session.token);
  });

  it("records a renamed passkey and a removed one without its public key or credential id", async () => {
    const id = randomUUID();
    store.passkey?.push({
      id,
      name: "Phone",
      userId: olekId,
      publicKey: "pQECAyYgASFYIPublicKeyBytes",
      credentialID: "credential-id-1",
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
      transports: "internal",
      createdAt: new Date(),
      aaguid: "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4",
    });
    const passkeyRows = () =>
      (store.passkey ?? [])
        .filter((row) => row.id === id)
        .map((row) => owned(row, row.userId, { name: row.name, deviceType: row.deviceType, backedUp: row.backedUp, aaguid: row.aaguid }));

    answerWithStoredRows("passkeys", passkeyRows);
    answerWithStoredRows("passkeys", passkeyRows);
    scriptAudit();
    await auth.api.updatePasskey({ body: { id, name: "Laptop" }, headers: asOlek });
    answerWithStoredRows("passkeys", passkeyRows);
    scriptAudit();
    await auth.api.deletePasskey({ body: { id }, headers: asOlek });

    const audit = auditCalls();
    expect(audit.operations).toEqual([expect.objectContaining({ kind: "passkey.update" }), expect.objectContaining({ kind: "passkey.delete" })]);
    expect(audit.entries).toEqual([
      expect.objectContaining({ record_id: id, old_values: { name: "Phone" }, new_values: { name: "Laptop" } }),
      expect.objectContaining({
        op: "delete",
        old_values: { name: "Laptop", deviceType: "multiDevice", backedUp: true, aaguid: expect.any(String) },
      }),
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/PublicKeyBytes|credential-id-1/);
  });

  describe("two-factor authentication", () => {
    it("records two-factor turned on, new backup codes and two-factor turned off, never the TOTP URI or the codes", async () => {
      scriptAudit();
      const { headers, response } = await auth.api.enableTwoFactor({ body: { password: OLEK.password }, headers: asOlek, returnHeaders: true });
      const withTwoFactor = asBrowser(cookiesOf(headers, asOlek.get("cookie") ?? ""));
      scriptAudit();
      const { backupCodes } = await auth.api.generateBackupCodes({ body: { password: OLEK.password }, headers: withTwoFactor });
      scriptAudit();
      await auth.api.disableTwoFactor({ body: { password: OLEK.password }, headers: withTwoFactor });

      const audit = auditCalls();
      expect(audit.operations).toEqual(
        ["user.two_factor_enable", "user.backup_codes", "user.two_factor_disable"].map((kind) => expect.objectContaining({ kind, actor_id: olekId })),
      );
      expect(audit.entries).toEqual([
        expect.objectContaining({
          entity: "users",
          op: "update",
          record_id: olekId,
          old_values: { twoFactorEnabled: false },
          new_values: { twoFactorEnabled: true },
          metadata: { username: "olek", self: true },
        }),
        expect.objectContaining({ record_id: olekId, new_values: { backupCodes: "[changed]" }, metadata: { username: "olek", self: true } }),
        expect.objectContaining({ record_id: olekId, old_values: { twoFactorEnabled: true }, new_values: { twoFactorEnabled: false } }),
      ]);
      const secrets = "totpURI" in response ? [response.totpURI, ...response.backupCodes, ...backupCodes] : [];
      expect(secrets.length).toBeGreaterThan(1);
      for (const secret of secrets) expect(JSON.stringify(audit)).not.toContain(secret);
    });

    it("records an administrator's two-factor change once, through the user administration audit", async () => {
      answerWithStoredRows("users", () => userSnapshotRows(olekId));
      answerWithStoredRows("users", () => userSnapshotRows(olekId));
      scriptAudit();

      const response = await auth.handler(
        new Request(`${AUTH_URL}/admin/update-user`, {
          method: "POST",
          headers: { ...Object.fromEntries(asAnna), origin: BASE_URL, "content-type": "application/json" },
          body: JSON.stringify({ userId: olekId, data: { name: "Aleksander", twoFactorEnabled: true } }),
        }),
      );

      expect(response.status).toBe(200);
      const audit = auditCalls();
      expect(audit.operations).toEqual([expect.objectContaining({ kind: "user.two_factor_enable", actor_id: annaId })]);
      expect(audit.entries).toEqual([
        expect.objectContaining({
          entity: "users",
          record_id: olekId,
          old_values: { name: "Olek User", twoFactorEnabled: false },
          new_values: { name: "Aleksander", twoFactorEnabled: true },
          metadata: { username: "olek" },
        }),
      ]);
    });
  });

  describe("passwords and email", () => {
    it("records a password changed by its owner and one set by an administrator, never the passwords or the new session token", async () => {
      scriptAudit();
      const { token } = await auth.api.changePassword({
        body: { currentPassword: OLEK.password, newPassword: "a-brand-new-password", revokeOtherSessions: true },
        headers: asOlek,
      });
      answerWithStoredRows("users", () => userSnapshotRows(olekId));
      answerWithStoredRows("users", () => userSnapshotRows(olekId));
      scriptAudit();
      await auth.api.setUserPassword({ body: { userId: olekId, newPassword: "an-administrator-password" }, headers: asAnna });

      const audit = auditCalls();
      expect(audit.operations).toEqual([
        expect.objectContaining({ kind: "user.password", actor_id: olekId }),
        expect.objectContaining({ kind: "user.password", actor_id: annaId }),
      ]);
      expect(audit.entries).toEqual([
        expect.objectContaining({
          entity: "users",
          op: "update",
          record_id: olekId,
          new_values: { password: "[changed]" },
          metadata: { username: "olek", self: true, revoked_other_sessions: true },
        }),
        expect.objectContaining({ entity: "users", record_id: olekId, new_values: { password: "[changed]" }, metadata: { username: "olek" } }),
      ]);
      for (const secret of [OLEK.password, "a-brand-new-password", "an-administrator-password", String(token)]) {
        expect(JSON.stringify(audit)).not.toContain(secret);
      }
    });

    it("records a password reset by link as the user's own change, from where it was made", async () => {
      await auth.api.requestPasswordReset({ body: { email: OLEK.email, redirectTo: "/reset-password" } });
      const [resetToken] = outbox.resetTokens;
      forgetDatabaseCalls();

      scriptAudit();
      const response = await auth.handler(
        new Request(`${AUTH_URL}/reset-password`, {
          method: "POST",
          headers: { ...BROWSER, "content-type": "application/json" },
          body: JSON.stringify({ newPassword: "a-reset-password", token: resetToken }),
        }),
      );

      expect(response.status).toBe(200);
      const audit = auditCalls();
      expect(audit.operations).toEqual([
        expect.objectContaining({ kind: "user.password", actor_id: olekId, performed_by: olekId, source: "api", ip_address: "198.51.100.7" }),
      ]);
      expect(audit.entries).toEqual([
        expect.objectContaining({
          record_id: olekId,
          new_values: { password: "[changed]" },
          metadata: { username: "olek", self: true, reset: true },
        }),
      ]);
      for (const secret of [String(resetToken), "a-reset-password"]) expect(JSON.stringify(audit)).not.toContain(secret);
    });

    it("records an own email change once the new address is verified, with the old and the new address", async () => {
      await auth.api.changeEmail({ body: { newEmail: "aleksander@example.invalid", callbackURL: "/settings" }, headers: asOlek });
      const [verificationUrl] = outbox.verificationUrls;
      forgetDatabaseCalls();

      scriptAudit();
      const response = await auth.handler(new Request(String(verificationUrl), { headers: BROWSER }));

      expect(response.status).toBe(302);
      const audit = auditCalls();
      expect(audit.operations).toEqual([expect.objectContaining({ kind: "user.email", actor_id: olekId })]);
      expect(audit.entries).toEqual([
        expect.objectContaining({
          entity: "users",
          record_id: olekId,
          old_values: { email: OLEK.email },
          new_values: { email: "aleksander@example.invalid" },
          metadata: { username: "olek", self: true },
        }),
      ]);
      expect(JSON.stringify(audit)).not.toContain(new URL(String(verificationUrl)).searchParams.get("token"));
    });
  });

  describe("linked accounts", () => {
    it("records a linked and an unlinked account by their provider only", async () => {
      const githubId = storeGithubAccount(olekId);
      answerWithStoredRows("accounts", () => accountRows((account) => account.providerId === "google"));
      scriptAudit();
      await auth.api.linkSocialAccount({
        body: { provider: "google", idToken: { token: "google-id-token", accessToken: "google-access-token" } },
        headers: asOlek,
      });
      answerWithStoredRows("accounts", () => accountRows((account) => account.id === githubId));
      scriptAudit();
      await auth.api.unlinkAccount({ body: { accountId: githubId }, headers: asOlek });

      const audit = auditCalls();
      expect(audit.operations).toEqual([
        expect.objectContaining({ kind: "user.account_link", actor_id: olekId }),
        expect.objectContaining({ kind: "user.account_unlink", actor_id: olekId }),
      ]);
      expect(audit.entries).toEqual([
        expect.objectContaining({
          entity: "accounts",
          op: "create",
          new_values: { providerId: "google" },
          metadata: { user_id: olekId, username: "olek" },
        }),
        expect.objectContaining({ entity: "accounts", op: "delete", record_id: githubId, old_values: { providerId: "github" } }),
      ]);
      expect(JSON.stringify(audit)).not.toMatch(/google-id-token|google-access-token|google-subject-1|github-user-42|gho_secret/);
    });

    it("does not record the account of a new user as a link", async () => {
      googleProfile = { sub: "google-subject-2", email: "nowy@example.invalid" };
      answerWithStoredRows("accounts", () => accountRows((account) => account.accountId === "google-subject-2"));
      scriptAudit();
      await auth.api.signInSocial({ body: { provider: "google", idToken: { token: "google-id-token" } } });

      expect(store.account?.some((account) => account.accountId === "google-subject-2")).toBe(true);
      expect(auditCalls().operations).toEqual([]);
    });
  });

  it("withdraws the measurements of a deleted user, and leaves them alone when only an account is unlinked", async () => {
    vi.mocked(forgetContributorMeasurements).mockClear();
    const id = storeGithubAccount(olekId);
    answerWithStoredRows("accounts", () => accountRows((account) => account.id === id));
    scriptAudit();
    await auth.api.unlinkAccount({ body: { accountId: id }, headers: asOlek });
    expect(forgetContributorMeasurements).not.toHaveBeenCalled();

    answerWithStoredRows("users", () => userSnapshotRows(olekId));
    answerWithStoredRows("users", () => userSnapshotRows(olekId));
    scriptAudit();
    await auth.api.removeUser({ body: { userId: olekId }, headers: asAnna });
    expect(forgetContributorMeasurements).toHaveBeenCalledExactlyOnceWith(olekId);
  });

  it("records nothing when better-auth refuses a request, or when the request changes nothing", async () => {
    const created = await auth.api.createApiKey({ body: { name: "ci" }, headers: asAnna });
    const annaToken = String(sessionsOf(annaId)[0]?.token);
    forgetDatabaseCalls();

    answerWithStoredRows("apikeys", () => apiKeyRows(created.id));
    await expect(auth.api.deleteApiKey({ body: { keyId: created.id }, headers: asOlek })).rejects.toMatchObject({ status: "NOT_FOUND" });
    answerWithStoredRows("sessions", () => sessionRows((session) => session.userId === annaId));
    await expect(auth.api.revokeUserSessions({ body: { userId: annaId }, headers: asOlek })).rejects.toMatchObject({ status: "FORBIDDEN" });
    answerWithStoredRows("sessions", () => sessionRows((session) => session.token === annaToken));
    await auth.api.revokeSession({ body: { token: annaToken }, headers: asOlek });

    expect(sessionsOf(annaId).some((session) => session.token === annaToken)).toBe(true);
    expect(auditCalls().operations).toEqual([]);
  });

  it("records nothing for reads", async () => {
    await auth.api.getSession({ headers: asOlek });
    await auth.api.listSessions({ headers: asOlek });
    await auth.api.listApiKeys({ headers: asOlek });
    await auth.api.listPasskeys({ headers: asOlek });
    expect(dbMock.calls).toEqual([]);
  });
});

describe("audit events of flows that are hard to drive", () => {
  const session = { user: { id: "0198f5d2-7a3e-7c41-9b6e-1d2c3b4a5f60", username: "olek" }, session: { id: "session-1", expiresAt: new Date() } };
  const owner = { user_id: session.user.id, username: "olek" };

  function endpointCall(path: string, body: Row): GenericEndpointContext {
    return { path, body, headers: new Headers(BROWSER), context: { session } } as unknown as GenericEndpointContext;
  }

  it("records a registered passkey from the stored row, never from the response that carries its public key", async () => {
    const passkeyId = "0198f5d2-7a3e-7c41-9b6e-1d2c3b4a5f61";
    dbMock.enqueueFor("select", "passkeys", [
      { recordId: passkeyId, ...owner, name: "Phone", deviceType: "singleDevice", backedUp: false, aaguid: null },
    ]);
    scriptAudit();
    const returned = {
      id: passkeyId,
      userId: session.user.id,
      name: "Phone",
      publicKey: "pQECAyYgASFYIPublicKeyBytes",
      credentialID: "credential-id-1",
    };

    await auditEndpointEvent(endpointCall("/passkey/verify-registration", {}), returned);

    expect(whereQuery("passkeys", "select").params).toEqual([passkeyId]);
    const audit = auditCalls();
    expect(audit.entries).toEqual([
      expect.objectContaining({
        entity: "passkeys",
        op: "create",
        record_id: passkeyId,
        new_values: { name: "Phone", deviceType: "singleDevice", backedUp: false, aaguid: null },
        metadata: owner,
      }),
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/PublicKeyBytes|credential-id-1/);
  });

  it("records an OAuth application and a rotated secret without the secret", async () => {
    const application = {
      recordId: "app-1",
      ...owner,
      name: "Coverage map",
      redirectUris: ["https://example.invalid/callback"],
      tokenEndpointAuthMethod: "client_secret_basic",
      grantTypes: ["authorization_code"],
      scopes: ["openid"],
    };
    dbMock.enqueueFor("select", "oauth_clients", [application], [application]);
    scriptAudit();
    scriptAudit();

    await auditEndpointEvent(endpointCall("/oauth2/create-client", {}), { client_id: "app-1", client_secret: "ocs_first_secret" });
    await auditEndpointEvent(endpointCall("/oauth2/client/rotate-secret", { client_id: "app-1" }), {
      client_id: "app-1",
      client_secret: "ocs_second",
    });

    const audit = auditCalls();
    expect(audit.operations).toEqual([
      expect.objectContaining({ kind: "oauth_client.create" }),
      expect.objectContaining({ kind: "oauth_client.rotate_secret" }),
    ]);
    expect(audit.entries).toEqual([
      expect.objectContaining({
        entity: "oauth_clients",
        op: "create",
        record_id: "app-1",
        new_values: expect.objectContaining({ name: "Coverage map" }),
      }),
      expect.objectContaining({
        entity: "oauth_clients",
        op: "update",
        record_id: "app-1",
        new_values: { clientSecret: "[changed]" },
        metadata: owner,
      }),
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/ocs_/);
  });

  it("tells a first consent from a widened one", () => {
    const consent = (scopes: string[]) => ({ recordId: "consent-1", owner, values: { clientId: "app-1", scopes } });

    expect(consentGiven([], [consent(["openid"])]).kind).toBe("oauth_consent.create");
    expect(consentGiven([consent(["openid"])], [consent(["openid", "read:stations"])])).toEqual({
      kind: "oauth_consent.update",
      entries: [
        {
          entity: "oauth_consents",
          op: "update",
          recordId: "consent-1",
          old: { scopes: ["openid"] },
          new: { scopes: ["openid", "read:stations"] },
          metadata: owner,
        },
      ],
    });
  });

  it("reads and records nothing when the user refuses a consent", async () => {
    vi.mocked(logger.error).mockClear();
    const refusal = endpointCall("/oauth2/consent", { accept: false });

    await rememberEndpointSnapshot(refusal);
    await auditEndpointEvent(refusal, { redirect: true, url: "https://example.invalid/callback?error=access_denied" });

    expect(dbMock.calls).toEqual([]);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
