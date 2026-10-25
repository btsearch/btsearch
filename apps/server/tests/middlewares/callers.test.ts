import type { FastifyContextConfig, FastifyRequest, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

import { authBoundary, dbMock, userSession } from "../helpers/boundaries.js";
import { expectError } from "../helpers/mutationAssertions.js";
import { createRouteHarness } from "../helpers/routeHarness.js";

const APP_CLIENT_ID = "btsearch-app";
const userId = userSession().user.id;
const APP_ONLY: FastifyContextConfig = { permissions: ["upload:observations"], callers: ["app"] };
const APP_OR_SESSION: FastifyContextConfig = { permissions: ["upload:observations"], callers: ["app", "session"] };
const SESSION_ONLY: FastifyContextConfig = { permissions: ["upload:observations"], callers: ["session"] };
const BEARER = { authorization: "Bearer oat_secret" };

type TokenRow = { clientId: string; scopes: string[]; sessionId: string | null };

function token(overrides: Partial<TokenRow> = {}): void {
  dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue({
    id: "token",
    clientId: APP_CLIENT_ID,
    userId,
    scopes: ["profile", "upload:observations"],
    createdAt: new Date(),
    expiresAt: new Date("2099-01-01"),
    revoked: false,
    sessionId: null,
    client: { disabled: false },
    ...overrides,
  });
  dbMock.query.users.findFirst.mockResolvedValue(userSession().user);
}

async function request(config: FastifyContextConfig, headers: Record<string, string> = {}): Promise<LightMyRequestResponse> {
  const app = await createRouteHarness(
    {
      url: "/measurements/guarded",
      method: "GET",
      config,
      schema: { response: { 200: z.object({ data: z.object({ actor: z.string().nullable() }) }) } },
      handler: (req: FastifyRequest, reply: { send: (payload: unknown) => unknown }) =>
        reply.send({ data: { actor: req.userSession?.user.id ?? null } }),
    },
    { runAuth: true },
  );
  return app.inject({ method: "GET", url: "/measurements/guarded", headers });
}

beforeEach(() => vi.stubEnv("APP_OAUTH_CLIENT_IDS", APP_CLIENT_ID));
afterEach(() => vi.unstubAllEnvs());

describe("a route only the app may call", () => {
  it("lets in the app's token with the scope", async () => {
    token();
    const response = await request(APP_ONLY, BEARER);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.actor).toBe(userId);
  });

  it("lets in the token of every app the list names", async () => {
    vi.stubEnv("APP_OAUTH_CLIENT_IDS", `${APP_CLIENT_ID}, partner-app`);
    token({ clientId: "partner-app" });
    expect((await request(APP_ONLY, BEARER)).statusCode).toBe(200);
  });

  it("refuses the app's token without the scope", async () => {
    token({ scopes: ["profile"] });
    expectError(await request(APP_ONLY, BEARER), 403, "INSUFFICIENT_PERMISSIONS");
  });

  it("refuses another client's token", async () => {
    token({ clientId: "someone-else", scopes: ["profile", "read:stations"] });
    expectError(await request(APP_ONLY, BEARER), 403, "INSUFFICIENT_PERMISSIONS");
  });

  it("rejects another client's token that holds the app's scope", async () => {
    token({ clientId: "someone-else" });
    expectError(await request(APP_ONLY, BEARER), 401, "UNAUTHORIZED");
  });

  it("rejects such a token on any other route too", async () => {
    token({ clientId: "someone-else", scopes: ["read:stations", "upload:observations"] });
    expectError(await request({ permissions: ["read:stations"] }, BEARER), 401, "UNAUTHORIZED");
  });

  it("refuses a browser session, an administrator's too", async () => {
    authBoundary.getCurrentUser.mockResolvedValue(userSession(userId, "admin"));
    expectError(await request(APP_ONLY), 403, "INSUFFICIENT_PERMISSIONS");
  });

  it.each(["sk_secret", "pk_secret"])("refuses the API key %s", async (key) => {
    expectError(await request(APP_ONLY, { "x-api-key": key }), 403, "INSUFFICIENT_PERMISSIONS");
    expect(authBoundary.verifyApiKey).not.toHaveBeenCalled();
  });

  it("asks for credentials when there are none", async () => {
    expectError(await request(APP_ONLY), 401, "UNAUTHORIZED");
  });

  it("keeps the app's token valid after its browser session has ended", async () => {
    token({ sessionId: "ended-session" });
    dbMock.query.sessions.findFirst.mockResolvedValue({ id: "ended-session", expiresAt: new Date("2020-01-01") });
    expect((await request(APP_ONLY, BEARER)).statusCode).toBe(200);
  });

  it("is unavailable while the app's client id is not configured", async () => {
    vi.stubEnv("APP_OAUTH_CLIENT_IDS", "");
    token();
    expectError(await request(APP_ONLY, BEARER), 503, "SERVICE_UNAVAILABLE");
  });
});

describe("a route the app or a browser session may call", () => {
  it("lets in a session", async () => {
    authBoundary.getCurrentUser.mockResolvedValue(userSession());
    expect((await request(APP_OR_SESSION)).json().data.actor).toBe(userId);
  });

  it("lets in a session while the app's client id is not configured", async () => {
    vi.stubEnv("APP_OAUTH_CLIENT_IDS", "");
    authBoundary.getCurrentUser.mockResolvedValue(userSession());
    expect((await request(APP_OR_SESSION)).json().data.actor).toBe(userId);
  });
});

describe("a route only a browser session may call", () => {
  it("refuses the app's token, though it holds the route's scope", async () => {
    token();
    expectError(await request(SESSION_ONLY, BEARER), 403, "INSUFFICIENT_PERMISSIONS");
  });
});

describe("other clients' tokens elsewhere", () => {
  it("still expire with their browser session", async () => {
    token({ clientId: "someone-else", scopes: ["read:stations"], sessionId: "ended-session" });
    dbMock.query.sessions.findFirst.mockResolvedValue({ id: "ended-session", expiresAt: new Date("2020-01-01") });
    expectError(await request({ permissions: ["read:stations"] }, BEARER), 401, "UNAUTHORIZED");
  });
});
