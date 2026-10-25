import type { FastifyContextConfig, FastifyReply, FastifyRequest, InjectOptions, LightMyRequestResponse } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

import { IDEMPOTENCY_LOCK_SECONDS, IDEMPOTENCY_REPLAY_MAX_BYTES, IDEMPOTENCY_REPLAY_SECONDS } from "../../src/constants.js";
import { ErrorResponse } from "../../src/errors.js";
import type { FastifyZodInstance, Session } from "../../src/interfaces/fastify.interface.js";
import { redisMock, userSession } from "../helpers/boundaries.js";
import { createRouteHarness } from "../helpers/routeHarness.js";

type ChangeRequest = FastifyRequest<{ Body: { name: string } }>;
type Answer = (req: ChangeRequest, reply: FastifyReply, call: number) => unknown;

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const KEY = "7d0c2c55-3f5e-4c2b-9d4e-0a8b51f2c9e1";

const created: Answer = (req, reply, call) =>
  reply
    .status(201)
    .header("location", `/changes/${call}`)
    .send({ data: { id: call, name: req.body.name } });

async function changesApp({
  session = userSession(ALICE),
  answer = created,
  config = {},
}: { session?: Session | null; answer?: Answer; config?: FastifyContextConfig } = {}) {
  let calls = 0;
  const handler = vi.fn(async (req: ChangeRequest, reply: FastifyReply) => answer(req, reply, ++calls));
  const app = await createRouteHarness(
    {
      method: ["POST", "PATCH"],
      url: "/changes",
      config,
      schema: { body: z.object({ name: z.string() }) },
      handler,
    },
    { session, runIdempotency: true },
  );
  return { app, handler };
}

function send(
  app: FastifyZodInstance,
  name: string,
  key: string | null = KEY,
  method: InjectOptions["method"] = "POST",
): Promise<LightMyRequestResponse> {
  return Promise.resolve(
    app.inject({ method, url: "/changes", payload: { name }, ...(key === null ? {} : { headers: { "x-idempotency-key": key } }) }),
  );
}

describe("idempotencyHook", () => {
  it("replays the first 201 to a retry with the same key and body without running the handler again", async () => {
    const { app, handler } = await changesApp();

    const first = await send(app, "Mast");
    const retry = await send(app, "Mast");

    expect(first.statusCode).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(retry.statusCode).toBe(201);
    expect(retry.json()).toEqual(first.json());
    expect(retry.headers).toMatchObject({ location: "/changes/1", "content-type": first.headers["content-type"], "idempotent-replayed": "true" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(redisMock.setEx).toHaveBeenCalledWith(expect.stringMatching(/^idempotency:user:/), IDEMPOTENCY_REPLAY_SECONDS, expect.any(String));
  });

  it("replays a 4xx answer of the first request", async () => {
    const { app, handler } = await changesApp({
      answer: () => {
        throw new ErrorResponse("BAD_REQUEST");
      },
    });

    expect((await send(app, "Mast")).statusCode).toBe(400);
    const retry = await send(app, "Mast");
    expect(retry.statusCode).toBe(400);
    expect(retry.json().errors[0].code).toBe("BAD_REQUEST");
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("answers 422 when the key comes back with a different body", async () => {
    const { app, handler } = await changesApp();

    expect((await send(app, "Mast")).statusCode).toBe(201);
    const reused = await send(app, "Rooftop");

    expect(reused.statusCode).toBe(422);
    expect(reused.json().errors[0].code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("answers 409 while the first request with the key is still running, then replays its answer", async () => {
    const running = Promise.withResolvers<void>();
    const { app, handler } = await changesApp({
      answer: async (req, reply, call) => {
        await running.promise;
        return created(req, reply, call);
      },
    });

    const first = send(app, "Mast");
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    const concurrent = await send(app, "Mast");
    running.resolve();

    expect(concurrent.statusCode).toBe(409);
    expect(concurrent.json().errors[0].code).toBe("DUPLICATE_REQUEST");
    expect(redisMock.set).toHaveBeenCalledWith(expect.stringMatching(/^idempotency:user:/), expect.any(String), {
      NX: true,
      EX: IDEMPOTENCY_LOCK_SECONDS,
    });
    expect((await first).statusCode).toBe(201);
    expect((await send(app, "Mast")).headers["idempotent-replayed"]).toBe("true");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each([
    [500, new Error("database unavailable")],
    [429, new ErrorResponse("TOO_MANY_REQUESTS")],
  ])("does not keep a %i answer, so a retry runs again", async (status, error) => {
    const { app, handler } = await changesApp({
      answer: (req, reply, call) => {
        if (call === 1) throw error;
        return created(req, reply, call);
      },
    });

    expect((await send(app, "Mast")).statusCode).toBe(status);
    const retry = await send(app, "Mast");

    expect(retry.statusCode).toBe(201);
    expect(retry.headers["idempotent-replayed"]).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not keep an answer larger than the replay limit", async () => {
    const { app, handler } = await changesApp();
    const longName = "m".repeat(IDEMPOTENCY_REPLAY_MAX_BYTES);

    expect((await send(app, longName)).statusCode).toBe(201);
    expect((await send(app, longName)).headers["idempotent-replayed"]).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });

  it("locks but does not keep the answer of a route that opts out of replays", async () => {
    const { app, handler } = await changesApp({ config: { idempotentReplay: false } });

    expect((await send(app, "Mast")).statusCode).toBe(201);
    const retry = await send(app, "Mast");

    expect(retry.statusCode).toBe(201);
    expect(retry.headers["idempotent-replayed"]).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(redisMock.set).toHaveBeenCalledWith(expect.stringMatching(/^idempotency:user:/), expect.any(String), {
      NX: true,
      EX: IDEMPOTENCY_LOCK_SECONDS,
    });
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });

  it("keeps the keys of two callers apart", async () => {
    const alice = await changesApp({ session: userSession(ALICE) });
    const bob = await changesApp({ session: userSession(BOB) });

    expect((await send(alice.app, "Mast")).statusCode).toBe(201);
    const bobs = await send(bob.app, "Mast");

    expect(bobs.statusCode).toBe(201);
    expect(bobs.headers["idempotent-replayed"]).toBeUndefined();
    expect(bob.handler).toHaveBeenCalledTimes(1);
  });

  it("ignores the key of a guest", async () => {
    const { app, handler } = await changesApp({ session: null });

    expect((await send(app, "Mast")).statusCode).toBe(201);
    expect((await send(app, "Mast")).headers["idempotent-replayed"]).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("does not take a key on PATCH", async () => {
    const { app } = await changesApp();

    expect((await send(app, "Mast", KEY, "PATCH")).statusCode).toBe(201);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it.each([null, ""])("runs a POST without an idempotency key %s", async (key) => {
    const { app } = await changesApp();

    expect((await send(app, "Mast", key)).statusCode).toBe(201);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("does not mistake a disconnected Redis server for a duplicate request", async () => {
    redisMock.isReady = false;
    const { app } = await changesApp();

    expect((await send(app, "Mast")).statusCode).toBe(201);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("runs the request when Redis cannot take the lock", async () => {
    redisMock.set.mockRejectedValue(new Error("Redis unavailable"));
    const { app } = await changesApp();

    expect((await send(app, "Mast")).statusCode).toBe(201);
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });

  it("does not fail a successful response when Redis cannot keep its answer", async () => {
    redisMock.setEx.mockRejectedValue(new Error("Redis unavailable"));
    const { app } = await changesApp();

    expect((await send(app, "Mast")).statusCode).toBe(201);
  });
});
