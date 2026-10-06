import type { FastifyZodInstance } from "../interfaces/fastify.interface.js";
import { registerRouteFiles } from "./routeLoader.js";

export async function APIv1Controller(fastify: FastifyZodInstance) {
  await registerRouteFiles(fastify, "v1");
}
