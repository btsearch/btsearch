import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type OAuthTokenContext, hasRequiredScopes, isOAuthBearerToken, verifyOAuthAccessToken } from "../../../src/plugins/auth/oauthToken.js";
import { dbMock, userSession } from "../../helpers/boundaries.js";

const now = new Date("2026-10-06T12:00:00Z");
type TokenRecord = {
  id: string;
  clientId: string;
  userId: string | null;
  sessionId: string | null;
  revoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  scopes: string[] | null;
};
const userId = userSession().user.id;
function tokenRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    id: "token-id",
    clientId: "client-id",
    userId: userId,
    sessionId: null,
    revoked: false,
    expiresAt: new Date(now.getTime() + 1000),
    createdAt: now,
    scopes: ["read:stations"],
    ...overrides,
  };
}

describe("isOAuthBearerToken", () => {
  it.each(["oat_value", "oat_"])("recognizes OAuth token %s", (value) => expect(isOAuthBearerToken(value)).toBe(true));
  it.each(["", "OAT_value", "pk_value", "valueoat_value"])("rejects non-OAuth token %s", (value) => expect(isOAuthBearerToken(value)).toBe(false));
});

describe("hasRequiredScopes", () => {
  const token: OAuthTokenContext = { clientId: "client", userId: "user", scopes: ["read:stations", "read:cells"] };
  it.each([{ permissions: undefined }, { permissions: [] }])("allows requests without scope requirements $permissions", ({ permissions }) =>
    expect(hasRequiredScopes(token, permissions)).toBe(true),
  );
  it("requires every declared scope", () => {
    expect(hasRequiredScopes(token, ["read:stations", "read:cells"])).toBe(true);
    expect(hasRequiredScopes(token, ["read:stations", "update:cells"])).toBe(false);
  });
  it("rejects a write request with only read scopes", () => expect(hasRequiredScopes(token, ["create:stations"])).toBe(false));
  it("does not infer scopes by substring or hierarchy", () => {
    expect(hasRequiredScopes({ ...token, scopes: ["read:stations:all"] }, ["read:stations"])).toBe(false);
  });
});

describe("verifyOAuthAccessToken", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    dbMock.query.users.findFirst.mockResolvedValue(userSession().user);
  });
  it("looks up the hash without storing or querying the raw secret", async () => {
    dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue(tokenRecord());
    const result = await verifyOAuthAccessToken("oat_secret");
    expect(dbMock.query.oauthAccessTokens.findFirst).toHaveBeenCalledWith({
      where: { token: createHash("sha256").update("secret").digest("base64url") },
    });
    expect(result?.token).toEqual({ clientId: "client-id", userId: userId, scopes: ["read:stations"] });
    expect(result?.userSession.session).toMatchObject({ id: "token-id", userId: userId, token: "" });
    expect(dbMock.query.sessions.findFirst).not.toHaveBeenCalled();
  });
  it("requires an access token suffix before querying the database", async () => {
    expect(await verifyOAuthAccessToken("oat_")).toBeNull();
    expect(dbMock.query.oauthAccessTokens.findFirst).not.toHaveBeenCalled();
  });
  it.each([
    { title: "missing token", value: undefined },
    { title: "missing user id", value: tokenRecord({ userId: null }) },
    { title: "revoked token", value: tokenRecord({ revoked: true }) },
    { title: "expired token", value: tokenRecord({ expiresAt: new Date(now.getTime() - 1) }) },
    { title: "token expiring now", value: tokenRecord({ expiresAt: now }) },
  ])("rejects a $title", async ({ value }) => {
    dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue(value);
    expect(await verifyOAuthAccessToken("oat_secret")).toBeNull();
    expect(dbMock.query.users.findFirst).not.toHaveBeenCalled();
  });
  it("accepts a linked session that is still active", async () => {
    const session = { ...userSession().session, expiresAt: new Date(now.getTime() + 1) };
    dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue(tokenRecord({ sessionId: "test-session" }));
    dbMock.query.sessions.findFirst.mockResolvedValue(session);
    expect((await verifyOAuthAccessToken("oat_secret"))?.userSession.session).toMatchObject(session);
  });
  it.each([undefined, { expiresAt: now }, { expiresAt: new Date(now.getTime() - 1) }])(
    "rejects a missing or expired linked session %s",
    async (session) => {
      dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue(tokenRecord({ sessionId: "test-session" }));
      dbMock.query.sessions.findFirst.mockResolvedValue(session);
      expect(await verifyOAuthAccessToken("oat_secret")).toBeNull();
    },
  );
  it("rejects a deleted token owner", async () => {
    dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue(tokenRecord());
    dbMock.query.users.findFirst.mockResolvedValue(undefined);
    expect(await verifyOAuthAccessToken("oat_secret")).toBeNull();
  });
  it.each([null, new Date(now.getTime() + 1)])("rejects a current or permanent ban %s", async (banExpires) => {
    dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue(tokenRecord());
    dbMock.query.users.findFirst.mockResolvedValue({ ...userSession().user, banned: true, banExpires });
    expect(await verifyOAuthAccessToken("oat_secret")).toBeNull();
  });
  it.each([now, new Date(now.getTime() - 1)])("accepts an expired ban %s", async (banExpires) => {
    dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue(tokenRecord({ scopes: null }));
    dbMock.query.users.findFirst.mockResolvedValue({ ...userSession().user, banned: true, banExpires });
    expect((await verifyOAuthAccessToken("oat_secret"))?.token.scopes).toEqual([]);
  });
  it("propagates an unavailable authentication database", async () => {
    const failure = new Error("connection refused");
    dbMock.query.oauthAccessTokens.findFirst.mockRejectedValue(failure);
    await expect(verifyOAuthAccessToken("oat_secret")).rejects.toBe(failure);
  });
});
