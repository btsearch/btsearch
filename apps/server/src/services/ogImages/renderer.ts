import { resolve } from "node:path";
import sharp from "sharp";

import { baseUrl as configuredBaseUrl, siteName as configuredSiteName, dlogger } from "../../config.js";
import { SingleFlight } from "../../lib/async/singleFlight.js";
import { type OGImageRenderer, type OGRenderRequest, type OGRenderResult, OG_RENDER_MAX_AGE_SECONDS } from "./contract.js";
import { BoundedSemaphore } from "./internal/boundedSemaphore.js";
import { BoundedTTLCache } from "./internal/boundedTTLCache.js";

const WIDTH = 1200;
const HEIGHT = 630;
const ATTRIBUTION_WIDTH = 360;
const ATTRIBUTION_HEIGHT = 22;
const ATTRIBUTION_MARGIN = 10;
const TILE_SIZE = 256;
const ZOOM = 15;
const TILE_SUBDOMAINS = ["a", "b", "c", "d"];
const CARTO_API_KEY = "cb1_27le_1_93b48b76757452137be3df15";
const LOCATION_MARKER_COLOR = "#3b82f6";
const TILE_REQUEST_TIMEOUT_MS = 5_000;
const TILE_REQUEST_ATTEMPTS = 2;
const TILE_REQUEST_CONCURRENCY = 8;
const TILE_REQUEST_MAX_WAITERS = 256;
const MAX_TILE_BYTES = 1024 * 1024;
const TILE_CACHE_MAX_ENTRIES = 256;
const TILE_CACHE_MAX_BYTES = 16 * 1024 * 1024;
const TILE_CACHE_TTL_MS = 60 * 60 * 1000;
const IMAGE_RENDER_CONCURRENCY = 1;
const IMAGE_RENDER_MAX_WAITERS = 16;
const IMAGE_RENDER_TIMEOUT_MS = 20_000;
const FALLBACK_RENDER_TIMEOUT_SECONDS = 5;
const IMAGE_CACHE_MAX_ENTRIES = 16;
const IMAGE_CACHE_MAX_BYTES = 16 * 1024 * 1024;
const FALLBACK_CACHE_TTL_SECONDS = 60;
const FAILURE_CACHE_MAX_ENTRIES = 64;
const MARKER_WIDTH = 33;
const MARKER_HEIGHT = 51;
const PIN_PATH = "M11 34 C8 29 2 21 2 10 A9 9 0 1 1 20 10 C20 21 14 29 11 34 Z";

type TilePlacement = {
  input: Buffer;
  left: number;
  top: number;
};

type TileRequest = Omit<TilePlacement, "input"> & {
  tileX: number;
  tileY: number;
  wrappedX: number;
};

export type OGSharpCacheOptions = {
  files: number;
  items: number;
  memory: number;
};

export type OGImageRendererOptions = {
  fetch?: typeof globalThis.fetch;
  logoPath?: string;
  sharpCache?: OGSharpCacheOptions;
  sharpConcurrency?: number;
  baseUrl?: string;
  siteName?: string;
};

const defaultSharpCache: OGSharpCacheOptions = {
  files: 0,
  items: 64,
  memory: 32,
};

function remainingSharpTimeoutSeconds(deadlineMs: number, signal: AbortSignal): number {
  signal.throwIfAborted();
  const seconds = Math.floor((deadlineMs - Date.now()) / 1000);
  if (seconds < 1) throw new Error("Image render timed out");
  return seconds;
}

function markerSvg(color: string): Buffer {
  return Buffer.from(
    `<svg width="${MARKER_WIDTH}" height="${MARKER_HEIGHT}" viewBox="0 0 22 34" xmlns="http://www.w3.org/2000/svg">
      <path d="${PIN_PATH}" fill="${color}" stroke="rgba(0,0,0,0.45)" stroke-width="1.5"/>
    </svg>`,
  );
}

function escapeSVGText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function piePinSvg(colors: string[]): Buffer {
  if (colors.length <= 1) return markerSvg(colors[0] ?? LOCATION_MARKER_COLOR);

  const centerX = 11;
  const centerY = 10;
  const radius = 36;
  const step = (Math.PI * 2) / colors.length;
  let angle = -Math.PI / 2;
  const wedges = colors
    .map((color) => {
      const start = angle;
      const end = angle + step;
      angle = end;
      const x0 = (centerX + radius * Math.cos(start)).toFixed(3);
      const y0 = (centerY + radius * Math.sin(start)).toFixed(3);
      const x1 = (centerX + radius * Math.cos(end)).toFixed(3);
      const y1 = (centerY + radius * Math.sin(end)).toFixed(3);
      const largeArc = step > Math.PI ? 1 : 0;
      return `<path d="M ${centerX} ${centerY} L ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1} Z" fill="${color}"/>`;
    })
    .join("");

  return Buffer.from(
    `<svg width="${MARKER_WIDTH}" height="${MARKER_HEIGHT}" viewBox="0 0 22 34" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="pin"><path d="${PIN_PATH}"/></clipPath></defs>
      <g clip-path="url(#pin)">${wedges}</g>
      <path d="${PIN_PATH}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="1.5"/>
    </svg>`,
  );
}

function createAttributionOverlay(): Buffer {
  return Buffer.from(
    `<svg width="${ATTRIBUTION_WIDTH}" height="${ATTRIBUTION_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${ATTRIBUTION_WIDTH}" height="${ATTRIBUTION_HEIGHT}" rx="4" fill="rgba(12,12,12,0.62)"/>
      <text x="${ATTRIBUTION_WIDTH - 9}" y="15" text-anchor="end" font-family="Noto Sans, sans-serif" font-size="11" fill="#cdd3d8">© BTSearch | © OpenStreetMap contributors © CARTO</text>
    </svg>`,
  );
}

async function readTileBody(response: Response): Promise<Buffer> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > MAX_TILE_BYTES)
      throw new Error("Map tile response has an invalid content length");
  }

  if (!response.body) throw new Error("Map tile response has no body");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  let exceedsLimit = false;

  try {
    while (true) {
      // Stream chunks must be read sequentially so the byte limit is enforced before the tile is buffered.
      // eslint-disable-next-line no-await-in-loop
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value) continue;

      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_TILE_BYTES) {
        exceedsLimit = true;
        break;
      }
      chunks.push(Buffer.from(chunk.value));
    }

    if (exceedsLimit) {
      await reader.cancel();
      throw new Error("Map tile response is too large");
    }
  } finally {
    reader.releaseLock();
  }

  if (receivedBytes === 0) throw new Error("Map tile response is empty");
  return Buffer.concat(chunks, receivedBytes);
}

function tileUrl(tile: TileRequest, attempt: number): string {
  const subdomainIndex = (Math.abs(tile.tileX) + Math.abs(tile.tileY) + attempt) % TILE_SUBDOMAINS.length;
  const subdomain = TILE_SUBDOMAINS[subdomainIndex];
  return `https://${subdomain}.basemaps.cartocdn.com/rastertiles/dark_all/${ZOOM}/${tile.wrappedX}/${tile.tileY}.png?key=${CARTO_API_KEY}`;
}

function tileCacheKey(tile: TileRequest): string {
  return `${ZOOM}:${tile.wrappedX}:${tile.tileY}`;
}

function createTileRequestSignal(parent: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent.reason);
  if (parent.aborted) abortFromParent();
  else parent.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Map tile request timed out")), TILE_REQUEST_TIMEOUT_MS);

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      parent.removeEventListener("abort", abortFromParent);
    },
  };
}

function project(latitude: number, longitude: number): { x: number; y: number } {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Map coordinates must be finite");
  if (latitude < -85.051_128_78 || latitude > 85.051_128_78 || longitude < -180 || longitude > 180)
    throw new Error("Map coordinates are outside the supported range");

  const scale = TILE_SIZE * 2 ** ZOOM;
  const x = ((longitude + 180) / 360) * scale;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) * scale;
  return { x, y };
}

function markerForRequest(request: OGRenderRequest): Buffer {
  if (request.kind === "station") return markerSvg(request.colors[0]);
  return piePinSvg(request.colors);
}

export function createOGImageRenderer(options: OGImageRendererOptions = {}): OGImageRenderer {
  const fetchTileResponse = options.fetch ?? globalThis.fetch;
  const logoPath = options.logoPath ?? resolve(process.cwd(), "static", "og-logo.png");
  const rendererBaseUrl = options.baseUrl ?? configuredBaseUrl;
  const rendererSiteName = options.siteName ?? configuredSiteName;
  const logger = dlogger.extend("og-renderer");

  sharp.concurrency(options.sharpConcurrency ?? 1);
  sharp.cache(options.sharpCache ?? defaultSharpCache);

  const attributionOverlay = createAttributionOverlay();
  const imageCache = new BoundedTTLCache<string, OGRenderResult>(IMAGE_CACHE_MAX_ENTRIES, IMAGE_CACHE_MAX_BYTES, (image) => image.buffer.byteLength);
  const tileCache = new BoundedTTLCache<string, Buffer>(TILE_CACHE_MAX_ENTRIES, TILE_CACHE_MAX_BYTES, (tile) => tile.byteLength);
  const failureCache = new BoundedTTLCache<string, true>(FAILURE_CACHE_MAX_ENTRIES, FAILURE_CACHE_MAX_ENTRIES, () => 1);
  const imageRequests = new SingleFlight<string, OGRenderResult>();
  const imageRenderSlots = new BoundedSemaphore(IMAGE_RENDER_CONCURRENCY, IMAGE_RENDER_MAX_WAITERS);
  const tileRequestSlots = new BoundedSemaphore(TILE_REQUEST_CONCURRENCY, TILE_REQUEST_MAX_WAITERS);

  let fallbackImage: Promise<Buffer> | null = null;
  let logoOverlay: Promise<{ buffer: Buffer; height: number }> | null = null;

  async function buildLogoOverlay(deadlineMs: number, signal: AbortSignal): Promise<{ buffer: Buffer; height: number }> {
    const resized = await sharp(logoPath)
      .resize({ height: 64 })
      .ensureAlpha()
      .png()
      .timeout({ seconds: remainingSharpTimeoutSeconds(deadlineMs, signal) })
      .toBuffer();
    const metadata = await sharp(resized)
      .timeout({ seconds: remainingSharpTimeoutSeconds(deadlineMs, signal) })
      .metadata();
    const width = metadata.width ?? 64;
    const height = metadata.height ?? 64;
    const alpha = await sharp(resized)
      .extractChannel("alpha")
      .timeout({ seconds: remainingSharpTimeoutSeconds(deadlineMs, signal) })
      .toBuffer();
    const buffer = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
      .joinChannel(alpha)
      .png()
      .timeout({ seconds: remainingSharpTimeoutSeconds(deadlineMs, signal) })
      .toBuffer();
    return { buffer, height };
  }

  function getLogoOverlay(deadlineMs: number, signal: AbortSignal): Promise<{ buffer: Buffer; height: number }> {
    if (logoOverlay) return logoOverlay;
    logoOverlay = buildLogoOverlay(deadlineMs, signal).catch((error: unknown) => {
      logoOverlay = null;
      throw error;
    });
    return logoOverlay;
  }

  function getFallbackImage(): Promise<Buffer> {
    if (fallbackImage) return fallbackImage;

    const background = Buffer.from(
      `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="glow" cx="50%" cy="42%" r="58%">
            <stop offset="0%" stop-color="#1d3551"/>
            <stop offset="100%" stop-color="#0c0c0c"/>
          </radialGradient>
        </defs>
        <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
        <circle cx="${WIDTH / 2}" cy="${HEIGHT / 2 - 16}" r="116" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>
        <circle cx="${WIDTH / 2}" cy="${HEIGHT / 2 - 16}" r="184" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/>
        <text x="48" y="548" font-family="Noto Sans, sans-serif" font-size="42" font-weight="700" fill="#ffffff">${escapeSVGText(rendererSiteName)}</text>
        <text x="50" y="582" font-family="Noto Sans, sans-serif" font-size="20" fill="#cdd3d8">Mapa stacji bazowych</text>
      </svg>`,
    );

    fallbackImage = sharp(background)
      .composite([
        {
          input: markerSvg(LOCATION_MARKER_COLOR),
          left: Math.round(WIDTH / 2 - MARKER_WIDTH / 2),
          top: Math.round(HEIGHT / 2 - MARKER_HEIGHT),
        },
      ])
      .png()
      .timeout({ seconds: FALLBACK_RENDER_TIMEOUT_SECONDS })
      .toBuffer()
      .catch((error: unknown) => {
        fallbackImage = null;
        throw error;
      });
    return fallbackImage;
  }

  async function fetchTileAttempt(tile: TileRequest, attempt: number, imageSignal: AbortSignal): Promise<TilePlacement> {
    const cacheKey = tileCacheKey(tile);
    const cached = tileCache.get(cacheKey);
    if (cached) return { input: cached.value, left: tile.left, top: tile.top };

    try {
      const input = await tileRequestSlots.run(async () => {
        const queued = tileCache.get(cacheKey);
        if (queued) return queued.value;

        const requestSignal = createTileRequestSignal(imageSignal);
        try {
          const response = await fetchTileResponse(tileUrl(tile, attempt), {
            headers: { "user-agent": `BTSearch/1.0 (+${rendererBaseUrl})` },
            signal: requestSignal.signal,
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`Map tile request failed with status ${response.status}`);
          }

          const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
          if (contentType !== "image/png") {
            await response.body?.cancel();
            throw new Error("Map tile response is not a PNG image");
          }
          const tileBuffer = await readTileBody(response);
          tileCache.set(cacheKey, tileBuffer, TILE_CACHE_TTL_MS);
          return tileBuffer;
        } finally {
          requestSignal.dispose();
        }
      }, imageSignal);
      return { input, left: tile.left, top: tile.top };
    } catch (error) {
      if (imageSignal.aborted) {
        if (imageSignal.reason instanceof Error) throw imageSignal.reason;
        throw new Error("Map tile set was cancelled");
      }
      if (attempt + 1 < TILE_REQUEST_ATTEMPTS) return fetchTileAttempt(tile, attempt + 1, imageSignal);
      if (error instanceof Error) throw error;
      throw new Error("Map tile request failed");
    }
  }

  function fetchTile(tile: TileRequest, imageSignal: AbortSignal): Promise<TilePlacement> {
    return fetchTileAttempt(tile, 0, imageSignal);
  }

  async function fetchTiles(tiles: TileRequest[], imageSignal: AbortSignal): Promise<TilePlacement[]> {
    const controller = new AbortController();
    const abortFromImage = () => controller.abort(imageSignal.reason);
    if (imageSignal.aborted) abortFromImage();
    else imageSignal.addEventListener("abort", abortFromImage, { once: true });
    try {
      return await Promise.all(tiles.map((tile) => fetchTile(tile, controller.signal)));
    } catch (error) {
      controller.abort(error);
      throw error;
    } finally {
      imageSignal.removeEventListener("abort", abortFromImage);
    }
  }

  async function renderOGImage(request: OGRenderRequest, marker: Buffer, imageSignal: AbortSignal, deadlineMs: number): Promise<Buffer> {
    const { x, y } = project(request.latitude, request.longitude);
    const left = Math.round(x - WIDTH / 2);
    const top = Math.round(y - HEIGHT / 2);
    const maxTile = 2 ** ZOOM - 1;
    const tileX0 = Math.floor(left / TILE_SIZE);
    const tileY0 = Math.floor(top / TILE_SIZE);
    const tileX1 = Math.floor((left + WIDTH - 1) / TILE_SIZE);
    const tileY1 = Math.floor((top + HEIGHT - 1) / TILE_SIZE);

    const tileRequests: TileRequest[] = [];
    for (let tileX = tileX0; tileX <= tileX1; tileX++) {
      for (let tileY = tileY0; tileY <= tileY1; tileY++) {
        if (tileY < 0 || tileY > maxTile) throw new Error("Map tile range is outside the supported area");
        const wrappedX = ((tileX % (maxTile + 1)) + maxTile + 1) % (maxTile + 1);
        tileRequests.push({
          tileX,
          tileY,
          wrappedX,
          left: tileX * TILE_SIZE - left,
          top: tileY * TILE_SIZE - top,
        });
      }
    }

    const tiles = await fetchTiles(tileRequests, imageSignal);
    if (tiles.length !== tileRequests.length) throw new Error("Map tile set is incomplete");

    const logo = await getLogoOverlay(deadlineMs, imageSignal);
    const timeoutSeconds = remainingSharpTimeoutSeconds(deadlineMs, imageSignal);
    return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r: 12, g: 12, b: 12 } } })
      .composite([
        ...tiles,
        { input: marker, left: Math.round(WIDTH / 2 - MARKER_WIDTH / 2), top: Math.round(HEIGHT / 2 - MARKER_HEIGHT) },
        { input: logo.buffer, left: 24, top: HEIGHT - logo.height - 20 },
        {
          input: attributionOverlay,
          left: WIDTH - ATTRIBUTION_WIDTH - ATTRIBUTION_MARGIN,
          top: HEIGHT - ATTRIBUTION_HEIGHT - ATTRIBUTION_MARGIN,
        },
      ])
      .png()
      .timeout({ seconds: timeoutSeconds })
      .toBuffer();
  }

  async function renderImageResult(request: OGRenderRequest): Promise<OGRenderResult> {
    const deadlineMs = Date.now() + IMAGE_RENDER_TIMEOUT_MS;
    const imageSignal = AbortSignal.timeout(IMAGE_RENDER_TIMEOUT_MS);
    try {
      return {
        buffer: await imageRenderSlots.run(() => renderOGImage(request, markerForRequest(request), imageSignal, deadlineMs), imageSignal),
        maxAgeSeconds: OG_RENDER_MAX_AGE_SECONDS,
        outcome: "image",
      };
    } catch (error) {
      logger("OG image render failed: %O", error);
      return {
        buffer: await getFallbackImage(),
        maxAgeSeconds: 0,
        outcome: "fallback",
      };
    }
  }

  function getCachedImage(key: string): OGRenderResult | null {
    const cached = imageCache.get(key);
    if (!cached) return null;
    return {
      buffer: cached.value.buffer,
      maxAgeSeconds: Math.max(1, Math.ceil(cached.remainingTtlMs / 1000)),
      outcome: "image",
    };
  }

  async function getFallbackResult(): Promise<OGRenderResult> {
    return {
      buffer: await getFallbackImage(),
      maxAgeSeconds: 0,
      outcome: "fallback",
    };
  }

  async function getOrBuildImage(key: string, request: OGRenderRequest): Promise<OGRenderResult> {
    const cached = getCachedImage(key);
    if (cached) return cached;
    if (failureCache.get(key)) return getFallbackResult();

    return imageRequests.run(key, async () => {
      const existing = getCachedImage(key);
      if (existing) return existing;
      if (failureCache.get(key)) return getFallbackResult();

      const image = await renderImageResult(request);
      if (image.outcome === "image") imageCache.set(key, image, image.maxAgeSeconds * 1000);
      else failureCache.set(key, true, FALLBACK_CACHE_TTL_SECONDS * 1000);
      return image;
    });
  }

  return (request) => getOrBuildImage(`${request.kind}:${request.id}`, request);
}
