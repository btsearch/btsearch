import type { FastifyContextConfig, InjectOptions, LightMyRequestResponse } from "fastify";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { IDEMPOTENCY_LOCK_SECONDS } from "../../src/constants.js";
import { redisMock } from "../helpers/boundaries.js";
import { createRouteHarness } from "../helpers/routeHarness.js";

async function request(method: InjectOptions["method"] = "POST", key?: string, config: FastifyContextConfig = {}): Promise<LightMyRequestResponse> {
  const app = await createRouteHarness(
    {
      method,
      url: "/changes",
      config,
      schema: { response: { 200: z.object({ data: z.boolean() }) } },
      handler: (_req: unknown, reply: { send: (payload: unknown) => unknown }) => reply.send({ data: true }),
    },
    { runIdempotency: true },
  );
  return app.inject({
    method,
    url: "/changes",
    ...(key === undefined ? {} : { headers: { "x-idempotency-key": key } }),
  });
}

describe("idempotencyHook", () => {
  it("atomically acquires the documented 30-second POST lock", async () => {
    expect((await request("POST", "correlation-key")).statusCode).toBe(200);
    expect(redisMock.set).toHaveBeenCalledWith("idempotency:correlation-key", "1", { NX: true, EX: IDEMPOTENCY_LOCK_SECONDS });
    expect(redisMock.del).toHaveBeenCalledWith("idempotency:correlation-key");
  });
  it("retains a lock when the endpoint declares it must survive completion", async () => {
    expect((await request("POST", "correlation-key", { retainIdempotencyKey: true })).statusCode).toBe(200);
    expect(redisMock.del).not.toHaveBeenCalled();
    const duplicate = await request("POST", "correlation-key", { retainIdempotencyKey: true });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().errors[0].code).toBe("DUPLICATE_REQUEST");
  });
  it("allows reusing a released key after the response finishes", async () => {
    expect((await request("POST", "correlation-key")).statusCode).toBe(200);
    expect((await request("POST", "correlation-key")).statusCode).toBe(200);
  });
  it.each(["GET", "PUT", "PATCH", "DELETE"] as const)("does not acquire POST idempotency locks for %s", async (method) => {
    expect((await request(method, "correlation-key")).statusCode).toBe(200);
    expect(redisMock.set).not.toHaveBeenCalled();
  });
  it.each([undefined, ""])("allows a POST without an idempotency key %s", async (key) => {
    expect((await request("POST", key)).statusCode).toBe(200);
    expect(redisMock.set).not.toHaveBeenCalled();
  });
  it("does not mistake a disconnected Redis server for a duplicate request", async () => {
    redisMock.isReady = false;
    expect((await request("POST", "correlation-key")).statusCode).toBe(200);
    expect(redisMock.set).not.toHaveBeenCalled();
  });
  it("continues when the Redis lock service fails", async () => {
    redisMock.set.mockRejectedValue(new Error("Redis unavailable"));
    expect((await request("POST", "correlation-key")).statusCode).toBe(200);
    expect(redisMock.del).not.toHaveBeenCalled();
  });
  it("rejects an already-acquired POST key", async () => {
    redisMock.set.mockResolvedValue(null);
    const response = await request("POST", "correlation-key");
    expect(response.statusCode).toBe(409);
    expect(response.json().errors[0].code).toBe("DUPLICATE_REQUEST");
    expect(redisMock.del).not.toHaveBeenCalled();
  });
  it("does not fail a successful response when lock cleanup fails", async () => {
    redisMock.del.mockRejectedValue(new Error("cleanup unavailable"));
    expect((await request("POST", "correlation-key")).statusCode).toBe(200);
  });
});
