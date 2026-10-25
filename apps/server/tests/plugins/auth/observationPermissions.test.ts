import type { FastifyContextConfig, FastifyRequest, LightMyRequestResponse } from "fastify";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { requiresScope } from "../../../src/features/access/scope.js";
import { securityFor } from "../../../src/features/openapi/security.js";
import { API_KEY_PERMISSIONS, type PermissionObject, adminRole, editorRole, userRole } from "../../../src/plugins/auth/permissions.js";
import { OAUTH_READ_SCOPES, OAUTH_SCOPES, OAUTH_STAFF_SCOPES, OAUTH_WRITE_SCOPES } from "../../../src/plugins/auth/scopes.js";
import { authBoundary } from "../../helpers/boundaries.js";
import { expectError } from "../../helpers/mutationAssertions.js";
import { createRouteHarness } from "../../helpers/routeHarness.js";

const ACTIONS = ["read", "upload", "moderate", "manage"] as const;
const KEY_PERMISSIONS: Record<string, PermissionObject> = {
  sk_new: API_KEY_PERMISSIONS,
  sk_old: { stations: ["read"], cells: ["read"] },
};

function heldActions(role: Pick<typeof adminRole, "authorize">): string[] {
  return ACTIONS.filter((action) => role.authorize({ observations: [action] }).success);
}

function keyCovers(held: PermissionObject, required: Record<string, string[]>): boolean {
  return Object.entries(required).every(([resource, actions]) =>
    actions.every((action) => (held[resource as keyof PermissionObject] as readonly string[] | undefined)?.includes(action) === true),
  );
}

async function requestWithKey(config: FastifyContextConfig, key: string): Promise<LightMyRequestResponse> {
  authBoundary.verifyApiKey.mockImplementation(async (secret: string, required: Record<string, string[]> = {}) => {
    const held = KEY_PERMISSIONS[secret];
    const valid = held !== undefined && keyCovers(held, required);
    return { valid, key: valid ? { id: secret, referenceId: "api-user" } : null };
  });
  const app = await createRouteHarness(
    {
      url: "/observed/guarded",
      method: "GET",
      config,
      schema: { response: { 200: z.object({ data: z.object({ actor: z.string().nullable() }) }) } },
      handler: (req: FastifyRequest, reply: { send: (payload: unknown) => unknown }) =>
        reply.send({ data: { actor: req.apiToken?.referenceId ?? null } }),
    },
    { runAuth: true },
  );
  return app.inject({ method: "GET", url: "/observed/guarded", headers: { "x-api-key": key } });
}

describe("the observations permissions", () => {
  it("let every role read and upload, editors also moderate, and only administrators manage", () => {
    expect(heldActions(userRole)).toEqual(["read", "upload"]);
    expect(heldActions(editorRole)).toEqual(["read", "upload", "moderate"]);
    expect(heldActions(adminRole)).toEqual(["read", "upload", "moderate", "manage"]);
  });

  it("keep moderating inside an editor's area, so the route loader refuses a route that holds it without config.scope", () => {
    expect(requiresScope(["moderate:observations"])).toBe(true);
    expect(requiresScope(["read:observations", "upload:observations", "manage:observations"])).toBe(false);
  });

  it("offer reading to every OAuth client and moderating as a staff scope, while uploading stays out of every server-wide list", () => {
    expect(OAUTH_READ_SCOPES).toContain("read:observations");
    expect(OAUTH_STAFF_SCOPES).toContain("moderate:observations");
    for (const scopes of [OAUTH_READ_SCOPES, OAUTH_WRITE_SCOPES, OAUTH_STAFF_SCOPES, OAUTH_SCOPES]) {
      expect(scopes as readonly string[]).not.toContain("upload:observations");
    }
  });

  it("let a new API key through a route that needs read:observations and refuse a key made before them", async () => {
    const config: FastifyContextConfig = { permissions: ["read:observations"], allowGuestAccess: true };
    const response = await requestWithKey(config, "sk_new");
    expect(response.statusCode).toBe(200);
    expect(response.json().data.actor).toBe("api-user");
    expectError(await requestWithKey(config, "sk_old"), 403, "FORBIDDEN");
  });

  it("never let an API key moderate", () => {
    expect(securityFor({ permissionsCheckedByHandler: ["moderate:observations"] })).toEqual([
      { session: ["moderate:observations"] },
      { oauth: ["moderate:observations"] },
    ]);
  });
});
