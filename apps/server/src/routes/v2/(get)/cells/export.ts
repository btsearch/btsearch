import type { ClfExportFormat } from "@openbts/shared/clfExportTemplates";
import { cellExportQuerySchema } from "@openbts/shared/contract";
import type { CellExportQuery } from "@openbts/shared/contract";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { Readable } from "node:stream";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import {
  type CellExport,
  buildCellExport,
  loadCellExportLastModified,
  readCellExportChunks,
  stopWhenUnread,
} from "../../../../features/clfExport/stream.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import type { Route } from "../../../../interfaces/routes.interface.js";
import { logger } from "../../../../utils/logger.js";

const MAX_ACTIVE_EXPORTS = 2;
const UNREAD_CHUNK_TIMEOUT_MS = 30_000;
const FILE_EXTENSIONS: Partial<Record<ClfExportFormat, string>> = { ntm: "ntm", netmonitor: "csv" };
const FILE_HEADERS = ["Content-Type", "Content-Disposition", "Last-Modified"];

const schemaRoute = {
  summary: "Export cells as a text file",
  description:
    "Returns a `text/plain` file as a download, with one line per cell. `format` selects the layout. " +
    "The CLF versions `2.0`, `2.1`, `3.0-dec`, `3.0-hex` and `4.0` produce a `.clf` file, `ntm` a `.ntm` file and `netmonitor` a `.csv` file. " +
    "Only cells of active stations on commercial bands are exported, cells without the identifiers a format needs are skipped, " +
    "and countries you cannot access are left out.\n\n" +
    "Each line includes a description of the cell. You can replace the default description per technology with `templateGsm`, " +
    "`templateUmts`, `templateLte`, `templateNrNsa` and `templateNr`, using placeholders such as `{station_id}`, `{location}` and `{notes}`. " +
    "`displayNrSeparately` only applies to `ntm`, where it writes non-standalone NR cells with the TAC of the station's LTE cells.\n\n" +
    "The `Last-Modified` header tells you when the newest exported cell was changed, and a `HEAD` request returns the headers " +
    "without the file. The server only runs a few exports at the same time, and you can call this endpoint up to 10 times every 5 minutes. " +
    "Editors and administrators are not held to those 10 calls, unless they use an API key.",
  querystring: cellExportQuerySchema,
  produces: ["text/plain"],
  response: {
    200: z.string().describe("The export file, sent as a download."),
  },
};
const errorReasons = {
  429:
    "The server is already busy with other exports, or you called this endpoint more than 10 times within 5 minutes. " +
    "Also returned when the weekly quota of your API key is used up.",
  503: "The rate limit cannot be checked right now. Try again later.",
};
type ReqQuery = { Querystring: CellExportQuery };

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

async function describeExport(req: FastifyRequest<ReqQuery>, res: FastifyReply): Promise<CellExport> {
  const { format } = req.query;
  const cellExport = buildCellExport(req.query, await loadHiddenCountryCodes(req));
  const lastModified = await loadCellExportLastModified(cellExport);

  res.header("Content-Type", "text/plain; charset=utf-8");
  res.header("Content-Disposition", `attachment; filename="cells_export_${format}.${FILE_EXTENSIONS[format] ?? "clf"}"`);
  if (lastModified !== null) res.header("Last-Modified", lastModified.toUTCString());
  return cellExport;
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
  if (req.method === "HEAD") {
    await describeExport(req, res);
    return res.send(Readable.from([]));
  }

  if (activeExports >= MAX_ACTIVE_EXPORTS) throw new ErrorResponse("TOO_MANY_REQUESTS");
  const release = holdExportSlot();

  try {
    const cellExport = await describeExport(req, res);
    return res.send(streamExport(cellExport, req.query.format, res, release));
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
