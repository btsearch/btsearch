import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { beforeAuthHook } from "../../../src/plugins/auth/hooks.js";

type HookInput = Parameters<typeof beforeAuthHook>[0];

function run(input: { path: string; method: string; query?: Record<string, string>; body?: unknown }): Promise<unknown> {
  return beforeAuthHook({ headers: new Headers(), ...input } as unknown as HookInput);
}

beforeEach(() => vi.stubEnv("APP_OAUTH_CLIENT_IDS", "btsearch-app"));
afterEach(() => vi.unstubAllEnvs());

describe("the app-only scope at /oauth2/authorize", () => {
  it("lets the app ask for it", async () => {
    await expect(
      run({ path: "/oauth2/authorize", method: "GET", query: { client_id: "btsearch-app", scope: "openid upload:observations" } }),
    ).resolves.toBeUndefined();
  });

  it("refuses it for another client", async () => {
    await expect(
      run({ path: "/oauth2/authorize", method: "GET", query: { client_id: "someone-else", scope: "openid upload:observations" } }),
    ).rejects.toMatchObject({
      body: { error: "invalid_scope", error_description: "upload:observations is reserved for the BTSearch app" },
    });
  });

  it("lets another client ask for ordinary scopes", async () => {
    await expect(
      run({ path: "/oauth2/authorize", method: "GET", query: { client_id: "someone-else", scope: "openid read:stations" } }),
    ).resolves.toBeUndefined();
  });

  it("still requires a scope", async () => {
    await expect(run({ path: "/oauth2/authorize", method: "GET", query: { client_id: "btsearch-app" } })).rejects.toMatchObject({
      body: { error: "invalid_scope", error_description: "scope is required" },
    });
  });
});

describe("the app-only scope at /oauth2/update-consent", () => {
  it("is refused for every client", async () => {
    await expect(
      run({ path: "/oauth2/update-consent", method: "POST", body: { id: "consent", update: { scopes: ["openid", "upload:observations"] } } }),
    ).rejects.toMatchObject({
      body: { error: "invalid_request", error_description: "upload:observations is reserved for the BTSearch app" },
    });
  });

  it("leaves other consent changes alone", async () => {
    await expect(
      run({ path: "/oauth2/update-consent", method: "POST", body: { id: "consent", update: { scopes: ["openid", "read:stations"] } } }),
    ).resolves.toBeUndefined();
  });
});
