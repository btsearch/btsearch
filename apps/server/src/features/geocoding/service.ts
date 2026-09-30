import { createHash } from "node:crypto";

import { ErrorResponse } from "../../errors.js";
import { withRedisStaleCache } from "../../lib/redisCache.js";
import { logger, serializeError } from "../../utils/logger.js";
import { GEOAPIFY_API_KEY, LOCATIONIQ_API_KEY } from "./config.js";
import { createGeoapifyProvider } from "./geoapify.js";
import { createLocationIqProvider } from "./locationiq.js";
import { GeocodingProviderError, OUTAGE_COOLDOWN_MS } from "./provider.js";
import type { GeocodingProvider, GeocodingSearchResponse, GeocodingSource, ReverseGeocodingResponse } from "./types.js";

const GEOCODING_CACHE = { freshTtlSeconds: 86_400, staleTtlSeconds: 172_800 };

const providers: GeocodingProvider[] = [];
if (GEOAPIFY_API_KEY) providers.push(createGeoapifyProvider(GEOAPIFY_API_KEY));
if (LOCATIONIQ_API_KEY) providers.push(createLocationIqProvider(LOCATIONIQ_API_KEY));

const cooldownUntil = new Map<GeocodingSource, number>();
let rotation = 0;

function getProviderOrder(): GeocodingProvider[] {
  const now = Date.now();
  const available = providers.filter((provider) => (cooldownUntil.get(provider.source) ?? 0) <= now);
  if (available.length < 2) return available;

  const offset = rotation++ % available.length;
  return [...available.slice(offset), ...available.slice(0, offset)];
}

function recordFailure(provider: GeocodingProvider, error: unknown): void {
  const isProviderError = error instanceof GeocodingProviderError;
  const cooldownMs = isProviderError ? error.cooldownMs : OUTAGE_COOLDOWN_MS;
  if (cooldownMs > 0) cooldownUntil.set(provider.source, Date.now() + cooldownMs);
  logger.warn("geocoding_provider_failed", {
    ...serializeError(error),
    source: provider.source,
    status: isProviderError ? error.status : null,
    cooldownMs,
  });
}

async function runWithFallback<T>(task: (provider: GeocodingProvider) => Promise<T>): Promise<{ source: GeocodingSource; value: T }> {
  let lastError: unknown;
  for (const provider of getProviderOrder()) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- the next provider is only asked after this one fails
      return { source: provider.source, value: await task(provider) };
    } catch (error) {
      recordFailure(provider, error);
      lastError = error;
    }
  }
  throw new ErrorResponse("SERVICE_UNAVAILABLE", { message: "Geocoding is temporarily unavailable.", cause: lastError });
}

export async function searchPlaces(query: string): Promise<GeocodingSearchResponse> {
  if (providers.length === 0) return { source: null, results: [] };

  const text = query.trim().replace(/\s+/g, " ");
  const cacheId = createHash("sha256").update(text.toLowerCase()).digest("hex").slice(0, 32);
  const { value } = await withRedisStaleCache(`geocoding:search:v2:${cacheId}`, GEOCODING_CACHE, async () => {
    const { source, value: results } = await runWithFallback((provider) => provider.search(text));
    return { source, results };
  });
  return value;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodingResponse> {
  if (providers.length === 0) return { source: null, result: null };

  const lat = Number(latitude.toFixed(5));
  const lng = Number(longitude.toFixed(5));
  const { value } = await withRedisStaleCache(`geocoding:reverse:v2:${lat}:${lng}`, GEOCODING_CACHE, async () => {
    const { source, value: result } = await runWithFallback((provider) => provider.reverse(lat, lng));
    return { source, result };
  });
  return value;
}
