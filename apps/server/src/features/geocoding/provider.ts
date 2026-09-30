import { createHash } from "node:crypto";

import { GEOCODING_TIMEOUT_MS } from "./config.js";
import type { GeocodingKind, GeocodingResult, GeocodingSource } from "./types.js";

const AUTH_FAILURE_COOLDOWN_MS = 15 * 60_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
export const OUTAGE_COOLDOWN_MS = 30_000;

export class GeocodingProviderError extends Error {
  readonly status: number | null;
  readonly cooldownMs: number;

  constructor(message: string, options: { status?: number; cooldownMs?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "GeocodingProviderError";
    this.status = options.status ?? null;
    this.cooldownMs = options.cooldownMs ?? OUTAGE_COOLDOWN_MS;
  }
}

export function getStatusCooldownMs(status: number): number {
  if (status === 401 || status === 403) return AUTH_FAILURE_COOLDOWN_MS;
  if (status === 429) return RATE_LIMIT_COOLDOWN_MS;
  if (status >= 500) return OUTAGE_COOLDOWN_MS;
  return 0;
}

export async function fetchProviderJson(url: URL): Promise<{ status: number; body: unknown }> {
  const request = fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS) });
  const response = await request.catch((error: unknown) => {
    throw new GeocodingProviderError("Request failed", { cause: error });
  });
  const body: unknown = await response.json().catch(() => null);
  return { status: response.status, body };
}

export function createResultId(source: GeocodingSource, ...parts: (string | number | undefined)[]): string {
  return `${source}:${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16)}`;
}

export function pickText(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const text = value?.trim();
    if (text) return text;
  }
  return null;
}

export function formatRegion(state: string | undefined): string | null {
  const name = pickText(state?.replace(/^województwo\s+/i, ""));
  return name ? name.charAt(0).toLocaleUpperCase("pl") + name.slice(1) : null;
}

export function formatStreetLine(street: string | null, houseNumber: string | null, city: string | null): string | null {
  const streetName = street ?? (houseNumber ? city : null);
  return streetName && houseNumber ? `${streetName} ${houseNumber}` : streetName;
}

function getDescriptionParts(kind: GeocodingKind, address: GeocodingResult["address"]): (string | null)[] {
  if (kind === "city") return [address.county, address.region];
  if (kind === "district") return [address.city, address.county, address.region];
  if (kind === "county") return [address.region];
  const locality = [address.postcode, address.city].filter(Boolean).join(" ");
  return [formatStreetLine(address.street, address.houseNumber, address.city), locality];
}

export function describePlace(kind: GeocodingKind, name: string, address: GeocodingResult["address"]): string | null {
  const parts = [...getDescriptionParts(kind, address), address.country].filter((part): part is string => Boolean(part) && part !== name);
  return [...new Set(parts)].join(", ") || null;
}
