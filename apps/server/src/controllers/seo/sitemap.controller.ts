import { locations, stations } from "@openbts/drizzle";
import { and, asc, count, eq, isNotNull, max } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";

import { baseUrl } from "../../config.js";
import db from "../../database/psql.js";
import redis from "../../database/redis.js";
import { ErrorResponse } from "../../errors.js";
import type { FastifyZodInstance } from "../../interfaces/fastify.interface.js";
import { SingleFlight } from "../../lib/async/singleFlight.js";
import { MAX_SITEMAP_CHUNK_PAGE, parseSitemapChunkFile } from "../../services/seo/routes.js";

const CHUNK_SIZE = 40_000;
const CACHE_TTL_SECONDS = 6 * 60 * 60;
const MISSING_TTL_SECONDS = 5 * 60;
const STATS_TTL_MS = 60_000;
const MISSING = "__missing__";
const CACHE_KEY_PREFIX = `sitemap:v2:${encodeURIComponent(baseUrl)}:${CHUNK_SIZE}:published-with-location-and-operator`;
const STATIC_PATHS = [
  "/",
  "/stations",
  "/statistics",
  "/photos",
  "/spectrum",
  "/pem-measurements",
  "/clf-export",
  "/kmz",
  "/deleted-entries",
  "/changelog",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
];

const sitemapRequests = new SingleFlight<string, string | null>();
const statsRequests = new SingleFlight<string, SitemapStats>();

type SitemapStats = {
  stationCount: number;
  stationLastmod?: string;
  locationCount: number;
  locationLastmod?: string;
};

let cachedStats: SitemapStats | null = null;
let statsFetchedAt = 0;

type SitemapUrl = { loc: string; lastmod?: string };

const publishedSEOStations = and(eq(stations.status, "published"), isNotNull(stations.location_id), isNotNull(stations.operator_id));
const publishedLocationActivity = db
  .select({ locationId: stations.location_id, stationLastmod: max(stations.updatedAt).as("station_lastmod") })
  .from(stations)
  .where(publishedSEOStations)
  .groupBy(stations.location_id)
  .as("published_location_activity");

function latestIso(...values: Array<Date | null | undefined>): string | undefined {
  let latest: Date | undefined;
  for (const value of values) {
    if (value === null || value === undefined || Number.isNaN(value.getTime())) continue;
    if (latest === undefined || value > latest) latest = value;
  }
  return latest?.toISOString();
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function renderEntries(urls: SitemapUrl[], tag: "url" | "sitemap"): string {
  return urls
    .map((url) => `<${tag}><loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `<lastmod>${escapeXml(url.lastmod)}</lastmod>` : ""}</${tag}>`)
    .join("");
}

function renderUrlset(urls: SitemapUrl[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${renderEntries(urls, "url")}</urlset>`;
}

function renderSitemapIndex(urls: SitemapUrl[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${renderEntries(urls, "sitemap")}</sitemapindex>`;
}

function chunkCount(total: number): number {
  const chunks = Math.ceil(total / CHUNK_SIZE);
  if (chunks > MAX_SITEMAP_CHUNK_PAGE) throw new Error(`Sitemap requires ${chunks} chunks, exceeding the supported limit`);
  return chunks;
}

async function fetchStats(): Promise<SitemapStats> {
  const [stationRows, locationRows] = await Promise.all([
    db
      .select({ count: count(), lastmod: max(stations.updatedAt) })
      .from(stations)
      .where(publishedSEOStations),
    db
      .select({
        count: count(),
        locationLastmod: max(locations.updatedAt),
      })
      .from(publishedLocationActivity)
      .innerJoin(locations, eq(publishedLocationActivity.locationId, locations.id)),
  ]);

  const stationCount = Number(stationRows[0]?.count ?? 0);
  const locationCount = Number(locationRows[0]?.count ?? 0);
  const stationLastmod = latestIso(stationRows[0]?.lastmod);
  const locationLastmod = latestIso(locationRows[0]?.locationLastmod, stationRows[0]?.lastmod);
  const stats = { stationCount, stationLastmod, locationCount, locationLastmod };
  cachedStats = stats;
  statsFetchedAt = Date.now();
  return stats;
}

function getStats(): Promise<SitemapStats> {
  if (cachedStats !== null && Date.now() - statsFetchedAt < STATS_TTL_MS) return Promise.resolve(cachedStats);
  return statsRequests.run("stats", fetchStats);
}

async function buildIndex(): Promise<string> {
  const stats = await getStats();
  const stationChunks = chunkCount(stats.stationCount);
  const locationChunks = chunkCount(stats.locationCount);

  const entries: SitemapUrl[] = [{ loc: `${baseUrl}/sitemaps/pages.xml` }];
  for (let page = 1; page <= stationChunks; page++) {
    entries.push({ loc: `${baseUrl}/sitemaps/stations-${page}.xml`, lastmod: stats.stationLastmod });
  }
  for (let page = 1; page <= locationChunks; page++) {
    entries.push({ loc: `${baseUrl}/sitemaps/locations-${page}.xml`, lastmod: stats.locationLastmod });
  }
  return renderSitemapIndex(entries);
}

async function buildPages(): Promise<string> {
  return renderUrlset(STATIC_PATHS.map((path) => ({ loc: `${baseUrl}${path}` })));
}

async function buildStationsChunk(page: number): Promise<string | null> {
  const rows = await db
    .select({ id: stations.id, updatedAt: stations.updatedAt })
    .from(stations)
    .where(publishedSEOStations)
    .orderBy(asc(stations.id))
    .limit(CHUNK_SIZE)
    .offset((page - 1) * CHUNK_SIZE);

  if (rows.length === 0) return null;
  return renderUrlset(rows.map((row) => ({ loc: `${baseUrl}/stations/${row.id}`, lastmod: latestIso(row.updatedAt) })));
}

async function buildLocationsChunk(page: number): Promise<string | null> {
  const rows = await db
    .select({ id: locations.id, locationLastmod: locations.updatedAt, stationLastmod: publishedLocationActivity.stationLastmod })
    .from(publishedLocationActivity)
    .innerJoin(locations, eq(publishedLocationActivity.locationId, locations.id))
    .orderBy(asc(locations.id))
    .limit(CHUNK_SIZE)
    .offset((page - 1) * CHUNK_SIZE);

  if (rows.length === 0) return null;
  return renderUrlset(
    rows.map((row) => ({
      loc: `${baseUrl}/locations/${row.id}`,
      lastmod: latestIso(row.locationLastmod, row.stationLastmod),
    })),
  );
}

function cacheKey(value: string): string {
  return `${CACHE_KEY_PREFIX}:${value}`;
}

async function cached(key: string, build: () => Promise<string | null>): Promise<string | null> {
  const hit = await redis.get(key);
  if (hit !== null && hit !== undefined) return hit === MISSING ? null : hit;

  return sitemapRequests.run(key, async () => {
    const value = await build();
    await redis.setEx(key, value === null ? MISSING_TTL_SECONDS : CACHE_TTL_SECONDS, value ?? MISSING);
    return value;
  });
}

function sendXml(res: FastifyReply, xml: string | null) {
  if (xml === null) throw new ErrorResponse("NOT_FOUND");
  res.header("Content-Type", "application/xml; charset=utf-8");
  res.header("Cache-Control", "public, max-age=3600");
  return res.send(xml);
}

async function sitemapIndexHandler(_req: FastifyRequest, res: FastifyReply) {
  return sendXml(res, await cached(cacheKey("index"), buildIndex));
}

async function sitemapChunkHandler(req: FastifyRequest, res: FastifyReply) {
  const { file } = req.params as { file: string };
  if (file === "pages.xml") return sendXml(res, await cached(cacheKey("pages"), buildPages));

  const chunk = parseSitemapChunkFile(file);
  if (chunk === null) throw new ErrorResponse("NOT_FOUND");

  const { kind, page } = chunk;
  const stats = await getStats();
  const total = kind === "stations" ? stats.stationCount : stats.locationCount;
  if (page > chunkCount(total)) throw new ErrorResponse("NOT_FOUND");
  const xml = await cached(cacheKey(`${kind}:${page}`), () => (kind === "stations" ? buildStationsChunk(page) : buildLocationsChunk(page)));
  return sendXml(res, xml);
}

function robotsHandler(_req: FastifyRequest, res: FastifyReply) {
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    "Disallow: /admin/",
    "Disallow: /account/",
    "Disallow: /preferences",
    "Disallow: /lists",
    "Disallow: /submission",
    "Disallow: /share-target",
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`,
    "",
  ].join("\n");
  res.header("Content-Type", "text/plain; charset=utf-8");
  res.header("Cache-Control", "public, max-age=3600");
  return res.send(body);
}

export async function SitemapController(fastify: FastifyZodInstance): Promise<void> {
  fastify.get("/robots.txt", { config: { allowGuestAccess: true } }, robotsHandler);
  fastify.get("/sitemap.xml", { config: { allowGuestAccess: true } }, sitemapIndexHandler);
  fastify.get("/sitemaps/:file", { config: { allowGuestAccess: true } }, sitemapChunkHandler);
}
