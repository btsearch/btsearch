import { bands, cells, extraIdentificators, locations, operators, regions, stations } from "@openbts/drizzle";
import {
  type JsonLdObject,
  type SEOMetadata,
  SEO_IMAGE_HEIGHT,
  SEO_IMAGE_WIDTH,
  createLocationSEOMetadata,
  createStationSEOMetadata,
  parseSEOEntityId,
} from "@openbts/shared/seo";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";

import { baseUrl, clientOrigin, dlogger, siteName } from "../../config.js";
import db from "../../database/psql.js";
import redis from "../../database/redis.js";
import type { FastifyZodInstance } from "../../interfaces/fastify.interface.js";
import { SingleFlight } from "../../lib/async/singleFlight.js";
import { escapeHtml } from "../../lib/html.js";

const SHELL_TTL_MS = 60_000;
const SHELL_MAX_STALE_MS = 5 * 60_000;
const SHELL_REQUEST_TIMEOUT_MS = 5_000;
const SHELL_MAX_BYTES = 2 * 1024 * 1024;
const FRAGMENT_TTL_SECONDS = 3600;
const NOT_FOUND_TTL_SECONDS = 300;
const NOT_FOUND = "__not_found__";
const NOINDEX_TAG = `<meta data-seo-inject name="robots" content="noindex" />`;
const SEO_FALLBACK_PATTERN = /\s*<!-- seo-fallback:start -->[\s\S]*?<!-- seo-fallback:end -->/;
const SEO_SITE = { name: siteName, url: baseUrl } as const;
const FRAGMENT_CACHE_KEY_PREFIX = `seo:page:v2:${encodeURIComponent(baseUrl)}:${encodeURIComponent(siteName)}`;

let cachedShell: string | null = null;
let shellFetchedAt = 0;

const shellRequests = new SingleFlight<string, string | null>();
const fragmentRequests = new SingleFlight<string, string | null>();

function jsonLdScript(data: JsonLdObject): string {
  return `<script type="application/ld+json" data-seo-inject>${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function buildHeadFragment(metadata: SEOMetadata): string {
  const canonicalUrl = escapeHtml(metadata.canonicalUrl);
  const imageUrl = escapeHtml(metadata.imageUrl);
  const parts = [
    `<title data-seo-inject>${escapeHtml(metadata.title)}</title>`,
    `<meta data-seo-inject name="description" content="${escapeHtml(metadata.description)}" />`,
    `<meta data-seo-inject property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta data-seo-inject property="og:site_name" content="${escapeHtml(metadata.siteName)}" />`,
    `<meta data-seo-inject property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta data-seo-inject property="og:url" content="${canonicalUrl}" />`,
    `<meta data-seo-inject property="og:image" content="${imageUrl}" />`,
    `<meta data-seo-inject property="og:image:width" content="${SEO_IMAGE_WIDTH}" />`,
    `<meta data-seo-inject property="og:image:height" content="${SEO_IMAGE_HEIGHT}" />`,
    `<meta data-seo-inject name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta data-seo-inject name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta data-seo-inject name="twitter:image" content="${imageUrl}" />`,
    `<link data-seo-inject rel="canonical" href="${canonicalUrl}" />`,
  ];
  if (metadata.noindex) parts.push(NOINDEX_TAG);
  for (const data of metadata.jsonLd) parts.push(jsonLdScript(data));
  return parts.join("\n    ");
}

function stripSEOFallback(shell: string): string {
  return shell.replace(SEO_FALLBACK_PATTERN, "");
}

async function readShellBody(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > SHELL_MAX_BYTES)
      throw new Error("Client shell has an invalid content length");
  }
  if (!response.body) throw new Error("Client shell response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let receivedBytes = 0;
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop - Response chunks must be read sequentially so the byte limit is enforced before the shell is buffered
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value) continue;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > SHELL_MAX_BYTES) {
        // eslint-disable-next-line no-await-in-loop
        await reader.cancel();
        throw new Error("Client shell response is too large");
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return html + decoder.decode();
}

async function fetchShell(): Promise<string | null> {
  try {
    const response = await fetch(`${clientOrigin}/`, {
      headers: { accept: "text/html" },
      redirect: "error",
      signal: AbortSignal.timeout(SHELL_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Client shell request failed with status ${response.status}`);
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) throw new Error("Client shell response is not HTML");

    const html = await readShellBody(response);
    if (!html.includes("</head>")) throw new Error("Client shell has no closing head tag");
    cachedShell = html;
    shellFetchedAt = Date.now();
    return html;
  } catch (error) {
    dlogger("Failed to refresh the client shell: %O", error);
    if (cachedShell !== null && Date.now() - shellFetchedAt < SHELL_MAX_STALE_MS) return cachedShell;
    return null;
  }
}

async function getShell(): Promise<string | null> {
  if (cachedShell !== null && Date.now() - shellFetchedAt < SHELL_TTL_MS) return cachedShell;
  return shellRequests.run(clientOrigin, fetchShell);
}

async function buildStationFragment(id: number): Promise<string | null> {
  const rows = await db
    .select({
      id: stations.id,
      stationCode: stations.station_id,
      status: stations.status,
      extraAddress: stations.extra_address,
      operatorName: operators.name,
      operatorMnc: operators.mnc,
      networksId: extraIdentificators.networks_id,
      city: locations.city,
      address: locations.address,
      latitude: locations.latitude,
      longitude: locations.longitude,
      regionName: regions.name,
    })
    .from(stations)
    .innerJoin(operators, eq(stations.operator_id, operators.id))
    .innerJoin(locations, eq(stations.location_id, locations.id))
    .leftJoin(regions, eq(locations.region_id, regions.id))
    .leftJoin(extraIdentificators, eq(extraIdentificators.station_id, stations.id))
    .where(eq(stations.id, id))
    .limit(1);

  const station = rows[0];
  if (!station) return null;

  const cellRows = await db
    .select({ rat: cells.rat, value: bands.value })
    .from(cells)
    .innerJoin(bands, eq(cells.band_id, bands.id))
    .where(eq(cells.station_id, id));

  return buildHeadFragment(
    createStationSEOMetadata(SEO_SITE, {
      id: station.id,
      stationCode: station.stationCode,
      status: station.status,
      operatorName: station.operatorName,
      operatorMnc: station.operatorMnc,
      networksId: station.networksId,
      city: station.city,
      address: station.extraAddress || station.address,
      regionName: station.regionName,
      latitude: station.latitude,
      longitude: station.longitude,
      bands: cellRows,
    }),
  );
}

async function buildLocationFragment(id: number): Promise<string | null> {
  const rows = await db
    .select({
      id: locations.id,
      city: locations.city,
      address: locations.address,
      latitude: locations.latitude,
      longitude: locations.longitude,
      regionName: regions.name,
    })
    .from(locations)
    .leftJoin(regions, eq(locations.region_id, regions.id))
    .where(eq(locations.id, id))
    .limit(1);

  const location = rows[0];
  if (!location) return null;

  const stationRows = await db
    .select({ id: stations.id, stationCode: stations.station_id, operatorName: operators.name, status: stations.status })
    .from(stations)
    .innerJoin(operators, eq(stations.operator_id, operators.id))
    .where(and(eq(stations.location_id, id), eq(stations.status, "published")))
    .orderBy(asc(stations.id))
    .limit(9);

  return buildHeadFragment(
    createLocationSEOMetadata(SEO_SITE, {
      id: location.id,
      city: location.city,
      address: location.address,
      regionName: location.regionName,
      latitude: location.latitude,
      longitude: location.longitude,
      stations: stationRows,
    }),
  );
}

async function cachedFragment(key: string, build: () => Promise<string | null>): Promise<string | null> {
  const hit = await redis.get(key);
  if (hit !== null && hit !== undefined) return hit === NOT_FOUND ? null : hit;

  return fragmentRequests.run(key, async () => {
    const value = await build();
    await redis.setEx(key, value === null ? NOT_FOUND_TTL_SECONDS : FRAGMENT_TTL_SECONDS, value ?? NOT_FOUND);
    return value;
  });
}

function buildPageFragment(kind: "station" | "location", id: number): Promise<string | null> {
  if (kind === "station") return buildStationFragment(id);
  return buildLocationFragment(id);
}

async function handlePage(req: FastifyRequest, res: FastifyReply, kind: "station" | "location") {
  const { id } = req.params as { id: string };
  const numericId = parseSEOEntityId(id);

  const shell = await getShell();
  if (shell === null) {
    res.header("Retry-After", "30");
    return res.status(503).send({ errors: [{ code: "SHELL_UNAVAILABLE", message: "Client application is unavailable" }] });
  }

  let fragment: string | null = null;
  if (numericId !== null) {
    const cacheKey = `${FRAGMENT_CACHE_KEY_PREFIX}:${kind}:${numericId}`;
    fragment = await cachedFragment(cacheKey, () => buildPageFragment(kind, numericId));
  }

  res.header("Content-Type", "text/html; charset=utf-8");
  const cleanShell = stripSEOFallback(shell);
  if (fragment === null) {
    res.header("Cache-Control", "no-cache");
    return res.status(404).send(cleanShell.replace("</head>", `${NOINDEX_TAG}\n</head>`));
  }

  const html = cleanShell.replace("</head>", `${fragment}\n</head>`);

  res.header("Cache-Control", "public, max-age=300");
  return res.send(html);
}

export async function SEOPagesController(fastify: FastifyZodInstance): Promise<void> {
  fastify.get("/stations/:id", { config: { allowGuestAccess: true } }, (req, res) => handlePage(req, res, "station"));
  fastify.get("/locations/:id", { config: { allowGuestAccess: true } }, (req, res) => handlePage(req, res, "location"));
}
