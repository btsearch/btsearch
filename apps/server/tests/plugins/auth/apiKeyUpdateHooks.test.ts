import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { username } from "better-auth/plugins";
import { beforeEach, describe, expect, it } from "vitest";

import { beforeAuthHook } from "../../../src/plugins/auth/hooks.js";
import { dbMock } from "../../helpers/boundaries.js";

const OWNER = { email: "olek@example.invalid", password: "olek-user-password", name: "Olek User", username: "olek" };

function createAuth(store: Record<string, Record<string, unknown>[]>) {
  return betterAuth({
    baseURL: "http://localhost:3030",
    secret: "a-test-secret-that-is-long-enough-for-better-auth",
    database: memoryAdapter(store),
    emailAndPassword: { enabled: true },
    hooks: { before: beforeAuthHook },
    plugins: [apiKey({ enableMetadata: true, defaultPrefix: "sk_", rateLimit: { enabled: false } }), username()],
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
  });
}

describe("API key updates", () => {
  let store: Record<string, Record<string, unknown>[]>;
  let auth: ReturnType<typeof createAuth>;
  let asOwner: Headers;
  let keyId: string;

  beforeEach(async () => {
    store = { user: [], session: [], account: [], verification: [], apikey: [] };
    dbMock.query.apikeys.findMany.mockResolvedValue([]);
    auth = createAuth(store);
    await auth.api.signUpEmail({ body: OWNER });
    const { headers } = await auth.api.signInEmail({ body: { email: OWNER.email, password: OWNER.password }, returnHeaders: true });
    asOwner = new Headers({
      cookie: headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; "),
    });
    keyId = (await auth.api.createApiKey({ body: { name: "ci" }, headers: asOwner })).id;
  });

  function storedKey() {
    return store.apikey?.find((key) => key.id === keyId);
  }

  it.each([{ tier: "unlimited" }, null])("refuses metadata %j, so the owner of a key cannot change its tier", async (metadata) => {
    const storedMetadata = storedKey()?.metadata;
    await expect(auth.api.updateApiKey({ body: { keyId, metadata }, headers: asOwner })).rejects.toMatchObject({
      status: "BAD_REQUEST",
      message: "Metadata is not allowed when updating API keys",
    });
    expect(storedKey()?.metadata).toEqual(storedMetadata);
  });
});
