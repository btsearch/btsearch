import debug from "debug";

import { createOGImageRenderer, createOGRendererApp } from "./services/ogImages/index.js";

const DEFAULT_PORT = 3040;
const DEFAULT_HOST = "127.0.0.1";

debug.enable("sakilabs/openbts:*");

function getPort(): number {
  const rawPort = process.env.OG_RENDERER_PORT?.trim();
  if (!rawPort) return DEFAULT_PORT;

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("OG_RENDERER_PORT must be an integer between 1 and 65535");
  return port;
}

function getHost(): string {
  return process.env.OG_RENDERER_HOST?.trim() || DEFAULT_HOST;
}

const app = createOGRendererApp({
  logger: true,
  renderer: createOGImageRenderer(),
});

let closing = false;

async function closeApp(signal: NodeJS.Signals): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "Stopping OG renderer");
  await app.close();
}

process.once("SIGINT", () => void closeApp("SIGINT"));
process.once("SIGTERM", () => void closeApp("SIGTERM"));

try {
  await app.listen({ host: getHost(), port: getPort() });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
