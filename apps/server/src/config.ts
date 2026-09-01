import "dotenv/config";
import debug from "debug";

import { APP_NAME } from "./constants.js";

function normalizeHttpOrigin(name: "BASE_URL" | "CLIENT_ORIGIN" | "OG_RENDERER_URL", fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute HTTP(s) origin`);
  }

  const hasUnsupportedParts = url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "";
  if ((url.protocol !== "http:" && url.protocol !== "https:") || hasUnsupportedParts) {
    throw new Error(`${name} must be an HTTP(s) origin without credentials, path, query, or fragment`);
  }

  return url.origin;
}

export const dlogger: debug.Debugger = debug("sakilabs/openbts:sora");
export const port = Number(process.env.PORT) || 3030;
export const baseUrl = normalizeHttpOrigin("BASE_URL", process.env.NODE_ENV === "production" ? undefined : "http://localhost:3030");
export const siteName = APP_NAME;
export const clientOrigin = normalizeHttpOrigin("CLIENT_ORIGIN", "http://localhost:5173");
export const ogRendererUrl = normalizeHttpOrigin("OG_RENDERER_URL", "http://localhost:3040");
