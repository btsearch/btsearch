import type { LightMyRequestResponse } from "fastify";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { DetailedErrorResponse, ErrorResponse, ValidationError } from "../src/errors.js";
import { createRouteHarness } from "./helpers/routeHarness.js";

async function responseFor(error: Error): Promise<LightMyRequestResponse> {
  const route = {
    method: "GET",
    url: "/error",
    handler: async () => {
      throw error;
    },
  };
  const app = await createRouteHarness(route);
  return app.inject("/error");
}

describe("production v2 error handler", () => {
  it.each([
    ["BAD_REQUEST", 400],
    ["NOT_FOUND", 404],
    ["FORBIDDEN", 403],
    ["FAILED_TO_CREATE", 500],
  ] as const)("preserves the public code and status for %s", async (code, status) => {
    const response = await responseFor(new ErrorResponse(code));
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ errors: [{ code, message: expect.any(String) }] });
  });
  it("scrubs unexpected internal error messages", async () => {
    const response = await responseFor(new Error("postgres credentials must stay private"));
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ errors: [{ code: "INTERNAL_SERVER_ERROR", message: "An internal server error occurred." }] });
  });
  it("provides a useful message when a caller fault has no message", async () => {
    const response = await responseFor(Object.assign(new Error(""), { statusCode: 400 }));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ errors: [{ code: "INTERNAL_SERVER_ERROR", message: "An internal server error occurred." }] });
  });
  it("translates a unique database constraint without exposing the raw constraint", async () => {
    const Constructor = postgres.PostgresError as unknown as new (data: { code: string; message: string; query: string }) => postgres.PostgresError;
    const response = await responseFor(
      new Constructor({ code: "23505", message: "duplicate table constraint", query: "insert into cells values (1)" }),
    );
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ errors: [{ code: "DUPLICATE_ENTRY" }] });
    expect(response.body).not.toContain("duplicate table constraint");
  });
  it("preserves detailed business error fields", async () => {
    const details = [{ field: "cell", validationMessage: "Wrong radio" }];
    const response = await responseFor(new DetailedErrorResponse("BAD_REQUEST", details));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ errors: [{ code: "BAD_REQUEST", details }] });
  });
  it("preserves translated radio validation details", async () => {
    const details = [{ field: "0/clid", validationMessage: "Must be known" }];
    const response = await responseFor(new ValidationError(details));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ errors: [{ code: "VALIDATION_ERROR", message: "Validation error.", details }] });
  });

  it("selects the closest nested union branch and preserves full field paths", async () => {
    const schema = z.object({
      configuration: z.union([
        z.object({ mode: z.literal("known"), radio: z.object({ id: z.number(), channel: z.number() }) }),
        z.object({ mode: z.literal("unknown"), reason: z.string() }),
      ]),
    });
    const route = { method: "POST", url: "/validation", schema: { body: schema }, handler: async () => ({ accepted: true }) };
    const app = await createRouteHarness(route);
    const input = {
      method: "POST" as const,
      url: "/validation",
      payload: { configuration: { mode: "known", radio: { id: "bad", channel: "bad" } } },
    };
    const response = await app.inject(input);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      errors: [
        {
          code: "VALIDATION_ERROR",
          message: "Validation error",
          details: [
            { field: "configuration/radio/id", validationMessage: "Invalid input: expected number, received string" },
            { field: "configuration/radio/channel", validationMessage: "Invalid input: expected number, received string" },
          ],
        },
      ],
    });
  });

  it("reports a union value against the action that was sent when another branch only misses its discriminator", async () => {
    const schema = z.object({
      change: z.union([
        z.discriminatedUnion("kind", [
          z.object({ action: z.literal("create"), kind: z.literal("mast"), height: z.number() }),
          z.object({ action: z.literal("create"), kind: z.literal("roof"), floors: z.number() }),
        ]),
        z.object({ action: z.literal("update"), id: z.number(), height: z.number().optional() }),
      ]),
    });
    const route = { method: "POST", url: "/validation", schema: { body: schema }, handler: async () => ({ accepted: true }) };
    const app = await createRouteHarness(route);
    const detailsFor = async (change: Record<string, unknown>) => {
      const response = await app.inject({ method: "POST", url: "/validation", payload: { change } });
      expect(response.statusCode).toBe(400);
      return response.json().errors[0].details;
    };

    expect(await detailsFor({ action: "update", id: 4, height: "tall" })).toEqual([
      { field: "change/height", validationMessage: "Invalid input: expected number, received string" },
    ]);
    expect(await detailsFor({ action: "update", height: 4 })).toEqual([
      { field: "change/id", validationMessage: "Invalid input: expected number, received undefined" },
    ]);
    expect(await detailsFor({ action: "replace", id: 4 })).toEqual([{ field: "change/kind", validationMessage: "Invalid input" }]);
    expect(await detailsFor({ action: "update", kind: "mast", height: 4 })).toEqual([
      { field: "change/action", validationMessage: 'Invalid input: expected "create"' },
    ]);
  });
});
