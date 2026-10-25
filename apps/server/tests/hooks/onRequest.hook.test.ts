import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { OnRequestHook } from "../../src/hooks/onRequest.hook.js";
import { productionErrorHandler } from "../helpers/productionErrorHandler.js";

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function requestIdApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  apps.push(app);
  app.addHook("onRequest", OnRequestHook);
  app.setErrorHandler(await productionErrorHandler());
  app.get("/ok", async (req) => ({ id: req.id }));
  app.get("/broken", async () => {
    throw new Error("database unavailable");
  });
  await app.ready();
  return app;
}

describe("OnRequestHook", () => {
  it("sends the server's request id as X-Request-Id, not the one the client sent", async () => {
    const app = await requestIdApp();
    const response = await app.inject({ method: "GET", url: "/ok", headers: { "x-request-id": "client-chosen" } });

    expect(response.headers["x-request-id"]).toBe(response.json().id);
    expect(response.headers["x-request-id"]).not.toBe("client-chosen");
  });

  it("keeps X-Request-Id on a 500 and on a 404", async () => {
    const app = await requestIdApp();
    const broken = await app.inject({ method: "GET", url: "/broken" });
    const missing = await app.inject({ method: "GET", url: "/missing" });

    expect(broken.statusCode).toBe(500);
    expect(broken.headers["x-request-id"]).toEqual(expect.any(String));
    expect(missing.statusCode).toBe(404);
    expect(missing.headers["x-request-id"]).toEqual(expect.any(String));
    expect(missing.headers["x-request-id"]).not.toBe(broken.headers["x-request-id"]);
  });
});
