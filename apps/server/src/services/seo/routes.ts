import { parseSEOEntityId } from "@openbts/shared/seo";

export type SitemapResource = "stations" | "locations";
export type SitemapChunk = { kind: SitemapResource; page: number };

export const MAX_SITEMAP_CHUNK_PAGE = 9999;

const SEO_DETAIL_PATH = /^\/(?:stations|locations)\/([^/]+)$/;
const SEO_IMAGE_PATH = /^\/public\/og\/(?:stations|locations)\/([^/]+)\.png$/;
const SITEMAP_CHUNK_FILE = /^(stations|locations)-([1-9]\d{0,3})\.xml$/;

export function getRequestPathname(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

export function parseSitemapChunkFile(file: string): SitemapChunk | null {
  const match = SITEMAP_CHUNK_FILE.exec(file);
  if (!match) return null;

  const kind = match[1];
  const page = Number(match[2]);
  if ((kind !== "stations" && kind !== "locations") || !Number.isInteger(page) || page < 1 || page > MAX_SITEMAP_CHUNK_PAGE) return null;
  return { kind, page };
}

export function isSEOPublicPath(pathname: string): boolean {
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml" || pathname === "/sitemaps/pages.xml") return true;
  const detailMatch = SEO_DETAIL_PATH.exec(pathname);
  if (detailMatch?.[1] !== undefined && parseSEOEntityId(detailMatch[1]) !== null) return true;
  const imageMatch = SEO_IMAGE_PATH.exec(pathname);
  if (imageMatch?.[1] !== undefined && parseSEOEntityId(imageMatch[1]) !== null) return true;
  if (!pathname.startsWith("/sitemaps/")) return false;
  return parseSitemapChunkFile(pathname.slice("/sitemaps/".length)) !== null;
}
