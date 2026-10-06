import type { FastifyInstance } from "fastify";

let captured: Promise<FastifyInstance["errorHandler"]> | undefined;

async function captureErrorHandler(): Promise<FastifyInstance["errorHandler"]> {
  const { default: App } = await import("../../src/app.js");
  let handler: FastifyInstance["errorHandler"] | undefined;
  const registration = {
    decorateRequest: () => undefined,
    decorate: () => undefined,
    addHook: () => undefined,
    setErrorHandler: (registered: FastifyInstance["errorHandler"]) => {
      handler = registered;
    },
    setNotFoundHandler: () => undefined,
  };
  const register = Reflect.get(App.prototype, "initHooks");
  if (typeof register !== "function") throw new Error("Production error-handler registration was not found");
  Reflect.apply(register, { fastify: registration, dlogger: () => undefined }, []);
  if (handler === undefined) throw new Error("Production error handler was not registered");
  return handler;
}

export function productionErrorHandler(): Promise<FastifyInstance["errorHandler"]> {
  return (captured ??= captureErrorHandler());
}
