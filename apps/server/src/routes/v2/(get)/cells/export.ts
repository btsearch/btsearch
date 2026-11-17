import type { ClfExportFormat } from "@openbts/shared/clfExportTemplates";
import { cellExportQuerySchema } from "@openbts/shared/contract";
import type { CellExportQuery } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import {
  type CellExport,
  type CellExportVersion,
  buildCellExport,
  loadCellExportVersion,
  readCellExportChunks,
  stopWhenUnread,
} from "../../../../features/clfExport/stream.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import type { Route } from "../../../../interfaces/routes.interface.js";
import { setRetryAfter } from "../../../../lib/requestLimit.js";
import { logger } from "../../../../utils/logger.js";

const MAX_ACTIVE_EXPORTS = 2;
const BUSY_RETRY_SECONDS = 30;
const UNREAD_CHUNK_TIMEOUT_MS = 30_000;
const OUTPUT_REVISION = 1;
const HTTP_DATE_PRECISION_MS = 1000;
const FILE_EXTENSIONS: Partial<Record<ClfExportFormat, string>> = { ntm: "ntm", netmonitor: "csv", celldex: "cdx" };
const FILE_HEADERS = ["Content-Type", "Content-Disposition", "Last-Modified", "ETag", "X-Cell-Count"];

const schemaRoute = {
  summary: "Export cells as a text file",
  description:
    "Returns the cells as a text file: `.clf` for the CLF versions, `.ntm` for `ntm`, `.csv` for `netmonitor` and `.cdx` for `celldex`. " +
    "Only cells of active stations on commercial bands are exported. The line formats skip cells without the identifiers they need, " +
    "and `celldex` writes such a cell with `-` in place of its identity.\n\n" +
    "`X-Cell-Count` is the number of cells your filters select. `ETag` changes when those cells, their stations, sectors, locations " +
    "or structures change, also when a cell is removed. Send it back in `If-None-Match` and, while nothing changed, you get a 304 " +
    "without the file. `Last-Modified` is the time of the newest change, and `If-Modified-Since` works the same way, but it misses " +
    "removals and sector changes. A `HEAD` request returns the same headers without the file. The server only runs a few exports " +
    "at the same time, but a 304 does not wait for one of them. " +
    "You can send up to 10 `GET` requests every 5 minutes, 304s included. `HEAD` requests do not count toward them. " +
    "Editors and administrators are not held to those 10 calls, unless they use an API key.",
  querystring: cellExportQuerySchema,
  produces: ["text/plain"],
  response: {
    200: z.string().describe("The export file, sent as a download."),
  },
};
const errorReasons = {
  429:
    "The server is already busy with other exports, or you sent more than 10 `GET` requests within 5 minutes. " +
    "Also returned when the weekly quota of your API key is used up.",
  503: "The rate limit cannot be checked right now. Try again later.",
};
type ReqQuery = { Querystring: CellExportQuery };
type DescribedExport = { cellExport: CellExport; version: CellExportVersion; etag: string };

let activeExports = 0;

function holdExportSlot(): () => void {
  activeExports += 1;
  let isHeld = true;

  return () => {
    if (!isHeld) return;
    isHeld = false;
    activeExports -= 1;
  };
}

function exportTag(query: CellExportQuery, { cellCount, contentSum }: CellExportVersion): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([OUTPUT_REVISION, query, cellCount, contentSum]))
    .digest("base64url");
  return `W/"${digest}"`;
}

function opaqueTag(tag: string): string {
  return tag.trim().replace(/^W\//, "");
}

function isConditional(req: FastifyRequest<ReqQuery>): boolean {
  return req.headers["if-none-match"] !== undefined || req.headers["if-modified-since"] !== undefined;
}

function hasCurrentCopy(req: FastifyRequest<ReqQuery>, { etag, version }: DescribedExport): boolean {
  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch !== undefined) {
    const tags = new Set(ifNoneMatch.split(",").map(opaqueTag));
    return tags.has("*") || tags.has(opaqueTag(etag));
  }

  const since = Date.parse(req.headers["if-modified-since"] ?? "");
  if (version.lastModified === null || Number.isNaN(since)) return false;
  return Math.floor(version.lastModified.getTime() / HTTP_DATE_PRECISION_MS) * HTTP_DATE_PRECISION_MS <= since;
}

async function describeExport(req: FastifyRequest<ReqQuery>): Promise<DescribedExport> {
  const cellExport = buildCellExport(req.query, await loadHiddenCountryCodes(req));
  const version = await loadCellExportVersion(cellExport);
  return { cellExport, version, etag: exportTag(req.query, version) };
}

function setFileHeaders(res: FastifyReply, format: ClfExportFormat, { version, etag }: DescribedExport): void {
  res.header("Content-Type", "text/plain; charset=utf-8");
  res.header("Content-Disposition", `attachment; filename="cells_export_${format}.${FILE_EXTENSIONS[format] ?? "clf"}"`);
  res.header("ETag", etag);
  res.header("X-Cell-Count", String(version.cellCount));
  if (version.lastModified !== null) res.header("Last-Modified", version.lastModified.toUTCString());
}

function streamExport(cellExport: CellExport, format: ClfExportFormat, res: FastifyReply, release: () => void): Readable {
  const reader = new AbortController();
  const chunks = stopWhenUnread(readCellExportChunks(cellExport, format, reader.signal), reader, UNREAD_CHUNK_TIMEOUT_MS);
  const stream = Readable.from(chunks, { objectMode: false });
  const { socket } = res.request.raw;
  const stopExport = () => reader.abort();

  reader.signal.addEventListener("abort", () => stream.destroy(), { once: true });
  socket.once("close", stopExport);
  stream.once("close", () => {
    socket.off("close", stopExport);
    release();
  });
  stream.once("error", (error) => {
    logger.error("cells.export.stream", { error });
    if (res.raw.headersSent) return;
    for (const header of FILE_HEADERS) res.removeHeader(header);
  });
  if (socket.destroyed) stopExport();

  return stream;
}

async function handler(req: FastifyRequest<ReqQuery>, res: FastifyReply) {
  const { format } = req.query;
  if (req.method === "HEAD") {
    const described = await describeExport(req);
    setFileHeaders(res, format, described);
    return hasCurrentCopy(req, described) ? res.status(304).send() : res.send(Readable.from([]));
  }

  const checked = isConditional(req) ? await describeExport(req) : null;
  if (checked !== null && hasCurrentCopy(req, checked)) {
    setFileHeaders(res, format, checked);
    return res.status(304).send();
  }

  if (activeExports >= MAX_ACTIVE_EXPORTS) {
    setRetryAfter(res, BUSY_RETRY_SECONDS);
    throw new ErrorResponse("TOO_MANY_REQUESTS");
  }
  const release = holdExportSlot();

  try {
    const described = checked ?? (await describeExport(req));
    setFileHeaders(res, format, described);
    return res.send(streamExport(described.cellExport, format, res, release));
  } catch (error) {
    release();
    throw error;
  }
}

const getCellsExport: Route<ReqQuery, string> = {
  url: "/cells/export",
  method: "GET",
  config: { permissions: ["read:cells"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getCellsExport;
