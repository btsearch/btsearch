import { stations } from "@openbts/drizzle";
import { compileCLFDescriptionTemplate, renderCLFDescriptionTemplate } from "@openbts/shared/clfExportTemplates";
import { eq, getTableName, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { once } from "node:events";
import { request } from "node:http";
import type { ClientRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { writeCelldexHeader } from "../../../../../src/features/clfExport/celldex.js";
import { convertToCLF, prepareConvertOptions } from "../../../../../src/features/clfExport/converter.js";
import type { ClfFormat, ConvertOptions } from "../../../../../src/features/clfExport/converter.js";
import { loadExportLines, renderExportLines } from "../../../../../src/features/clfExport/lines.js";
import type { ExportRows, ExportSelection, StationExportMetadata } from "../../../../../src/features/clfExport/lines.js";
import { loadNativeExportLines } from "../../../../../src/features/clfExport/nativeLines.js";
import { buildCellExport, readCellExportChunks } from "../../../../../src/features/clfExport/stream.js";
import { stationAreaConditions, stationPlacementConditions } from "../../../../../src/features/stations/read.js";
import type { AreaFilterQuery } from "../../../../../src/features/stations/read.js";
import getCellsExport from "../../../../../src/routes/v2/(get)/cells/export.js";
import { type DatabaseCall, dbMock, setCountryFeatures } from "../../../../helpers/boundaries.js";
import { cacheCountryVisibility } from "../../../../helpers/officialDataFixtures.js";
import { readDate } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

type MetadataRows = { cellsChanged: Date | null }[];
type ExportMetadata = { promise: Promise<MetadataRows>; resolve(value: MetadataRows): void };
type ExportStreamResult = { type: "return"; value: Readable } | { type: "throw" | "incomplete"; value: unknown };
type DeferredPromise<T> = {
  promise: Promise<T>;
  resolve(this: void, value: T | PromiseLike<T>): void;
  reject(this: void, reason?: unknown): void;
};

const gsmExportRow = {
  gsm_lac: 45,
  gsm_cid: 123,
  gsm_e_gsm: false,
  cell_type: "MACROCELL",
  notes: null,
  station_pk: 1,
  station_sid: "SITE",
  extra_address: null,
  backhaul_medium: null,
  sector_id: null,
  operator_mnc: 310260,
  latitude: 52,
  longitude: 21,
  city: null,
  address: null,
  region_code: null,
  band_value: 900,
  band_name: "GSM 900",
  band_duplex: "FDD",
  is_confirmed: true,
};

const stationMetadataRow: StationExportMetadata = {
  station_pk: 1,
  station_sid: "SITE",
  extra_address: null,
  backhaul_medium: null,
  operator_mnc: 310260,
  latitude: 52,
  longitude: 21,
  city: null,
  address: null,
  region_code: null,
  country_code: null,
  station_country_code: null,
  structure_type: null,
  structure_owner: null,
  structure_note: null,
};

function stationPickerCalls(): DatabaseCall[] {
  return dbMock.calls.filter(
    (call) => call.table === getTableName(stations) && typeof call.selection === "object" && call.selection !== null && "id" in call.selection,
  );
}

function mixedExportRows(): { metadata: StationExportMetadata[]; rows: ExportRows } {
  const first: StationExportMetadata = {
    ...stationMetadataRow,
    station_sid: "FIRST",
    extra_address: "",
    address: "Fallback address",
    latitude: 0,
    longitude: 0,
    region_code: "MAZ",
    structure_type: "rooftop",
    structure_owner: "PGE",
    structure_note: "property detail",
  };
  const second: StationExportMetadata = { ...stationMetadataRow, station_pk: 2, station_sid: "SECOND", latitude: null, longitude: null };
  const cell = { cell_type: "PICOCELL", notes: "cell notes", sector_id: 101, is_confirmed: true, band_duplex: "FDD" as const, band_code: null };
  return {
    metadata: [first, second],
    rows: {
      gsmRows: [
        { ...first, ...cell, cell_pk: 1, band_value: 900, band_name: "GSM 900", gsm_lac: 45, gsm_cid: 123, gsm_e_gsm: false, gsm_bsic: null },
      ],
      umtsRows: [
        {
          ...second,
          ...cell,
          cell_pk: 2,
          sector_id: null,
          notes: null,
          band_value: 2100,
          band_name: "UMTS 2100",
          umts_lac: 56,
          umts_rnc: null,
          umts_cid: 234,
          umts_cid_long: null,
          umts_arfcn: null,
          umts_psc: null,
        },
      ],
      lteRows: [
        {
          ...first,
          ...cell,
          cell_pk: 3,
          band_value: 1800,
          band_name: "LTE 1800",
          lte_tac: 67,
          lte_enbid: 1,
          lte_clid: 89,
          lte_ecid: 345,
          lte_pci: 0,
          lte_earfcn: null,
        },
      ],
      nrRows: [
        {
          ...second,
          ...cell,
          cell_pk: 4,
          sector_id: null,
          is_confirmed: false,
          band_value: 3500,
          band_name: "NR 3500",
          band_duplex: "TDD",
          nr_nrtac: 78,
          nr_gnbid: 1,
          nr_gnbid_length: 24,
          nr_clid: 23,
          nr_nci: 456n,
          nr_pci: null,
          nr_arfcn: null,
          nr_type: "sa",
        },
      ],
      nrBandRows: [{ station_id: 2, cell_pk: 4, nr_type: "sa", band_value: 3500, band_duplex: "TDD", nr_pci: null, is_confirmed: false }],
      stationSectorRows: [{ id: 101, station_id: 1, azimuth: 0 }],
    },
  };
}

function enqueueExportRows(rows: ExportRows, metadata?: StationExportMetadata[]): void {
  if (metadata) dbMock.enqueueFor("select", getTableName(stations), metadata);
  dbMock.enqueueFor("select", "cells", rows.gsmRows, rows.umtsRows, rows.lteRows, rows.nrRows, rows.nrBandRows);
  dbMock.enqueueFor(
    "select",
    "station_sectors",
    rows.stationSectorRows.map((row) => ({ ...row })),
  );
}

function nativeSelection(): ExportSelection {
  return {
    stationConditions: [inArray(stations.id, [1, 2])],
    cellConditions: [],
    lteConditions: [],
    nrConditions: [],
    rats: { gsm: true, umts: true, lte: true, nr: true },
  };
}

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolve!: DeferredPromise<T>["resolve"];
  let reject!: DeferredPromise<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function holdExportMetadata(): { pending: ExportMetadata; started: Promise<void> } {
  const pending = createDeferredPromise<MetadataRows>();
  const started = createDeferredPromise<void>();
  const select = dbMock.select.getMockImplementation();
  let activeMetadata = 0;
  dbMock.select.mockImplementation((selection) => {
    if (typeof selection === "object" && selection !== null && "cellsChanged" in selection && ++activeMetadata === 2) started.resolve();
    if (!select) throw new Error("Missing database boundary");
    return select(selection);
  });
  return { pending, started: started.promise };
}

async function waitForExportStreams(results: readonly ExportStreamResult[]): Promise<void> {
  await Promise.all(results.flatMap((result) => (result.type === "return" && !result.value.closed ? [once(result.value, "close")] : [])));
}

describe("getCellsExport", () => {
  it.each(["metadata", "stream"])("clears download headers and releases its slot after a %s database failure", async (phase) => {
    const app = await createRouteHarness(getCellsExport);
    async function expectFailureReleasesSlot(): Promise<void> {
      dbMock.enqueueFor("select", "countries", []);
      dbMock.enqueueFor("select", "cells", phase === "metadata" ? new Error("Private database credentials") : [{ cellsChanged: readDate }]);
      if (phase === "stream") dbMock.enqueueFor("select", getTableName(stations), new Error("Private database credentials"));
      const response = await app.inject({ url: "/cells/export?format=2.0" });
      expect(response.statusCode).toBe(500);
      expect(response.json().errors[0].code).toBe("INTERNAL_SERVER_ERROR");
      expect(response.body).not.toContain("Private database credentials");
      expect(response.headers).not.toHaveProperty("content-disposition");
      expect(response.headers).not.toHaveProperty("last-modified");
    }
    await expectFailureReleasesSlot();
    await expectFailureReleasesSlot();
    await expectFailureReleasesSlot();
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "cells", [{ cellsChanged: null }]);
    dbMock.enqueueFor("select", getTableName(stations), []);
    expect((await app.inject({ url: "/cells/export?format=2.0" })).statusCode).toBe(200);
  });

  it("caps simultaneous exports, serves HEAD and 304s while busy, and recovers after they finish", async () => {
    const streams = vi.spyOn(Readable, "from");
    const { pending: metadata, started } = holdExportMetadata();
    const current = [{ cellsChanged: readDate }];
    dbMock.enqueueFor("select", "countries", [], [], [], [], [], []);
    dbMock.enqueueFor("select", "cells", metadata.promise, metadata.promise, current, current, current, [{ cellsChanged: null }]);
    dbMock.enqueueFor("select", getTableName(stations), [], [], []);
    const app = await createRouteHarness(getCellsExport);
    const first = app.inject({ url: "/cells/export?format=2.0" });
    const second = app.inject({ url: "/cells/export?format=2.0" });
    await started;
    const busy = await app.inject({ url: "/cells/export?format=2.0" });
    expect(busy.statusCode).toBe(429);
    expect(busy.headers["x-retry-after"]).toBe("30");
    expect(busy.headers).not.toHaveProperty("content-disposition");
    const head = await app.inject({ method: "HEAD", url: "/cells/export?format=2.0" });
    expect(head.statusCode).toBe(200);
    expect(head.headers["last-modified"]).toBe(readDate.toUTCString());
    const unchanged = await app.inject({ url: "/cells/export?format=2.0", headers: { "if-modified-since": readDate.toUTCString() } });
    expect(unchanged.statusCode).toBe(304);
    const outdated = await app.inject({ url: "/cells/export?format=2.0", headers: { "if-none-match": 'W/"outdated"' } });
    expect(outdated.statusCode).toBe(429);
    expect(outdated.headers).not.toHaveProperty("etag");
    metadata.resolve([{ cellsChanged: null }]);
    expect((await Promise.all([first, second])).map((response) => response.statusCode)).toEqual([200, 200]);
    await waitForExportStreams(streams.mock.results);
    expect((await app.inject({ url: "/cells/export?format=2.0" })).statusCode).toBe(200);
  });

  it("stops reading and releases the export slot when the downloading client disconnects", async () => {
    cacheCountryVisibility();
    dbMock.enqueueFor("select", "cells", [{ cellsChanged: readDate }], [gsmExportRow], [{ cellsChanged: null }]);
    const pendingRead = createDeferredPromise<{ id: number }[]>();
    dbMock.enqueueFor("select", getTableName(stations), [{ id: 1 }], [stationMetadataRow], pendingRead.promise, []);
    dbMock.enqueueFor("select", "station_sectors", []);
    const app = await createRouteHarness(getCellsExport);
    const disconnected = createDeferredPromise<void>();
    app.server.once("connection", (socket) => socket.once("close", disconnected.resolve));
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo;
    try {
      const chunk = await new Promise<string>((resolve, reject) => {
        const download = request(
          { hostname: "127.0.0.1", port: address.port, path: "/cells/export?format=2.0&rats=gsm&templateGsm={station_id}" },
          (response) => {
            response.once("data", (data: Buffer) => {
              resolve(data.toString());
              download.destroy();
            });
            response.once("error", (error: NodeJS.ErrnoException) => {
              if (error.code !== "ECONNRESET") reject(error);
            });
          },
        );
        download.once("error", reject);
        download.end();
      });
      expect(chunk).toBe("007B002D310260\tSITE\n");
      await disconnected.promise;
      pendingRead.resolve([]);
      expect((await app.inject({ url: "/cells/export?format=2.0" })).statusCode).toBe(200);
      expect(dbMock.pendingResults()).toBe(0);
    } finally {
      pendingRead.resolve([]);
      await app.close();
    }
  });

  it("terminates a partial download after a database failure and restores both export slots", async () => {
    const streams = vi.spyOn(Readable, "from");
    cacheCountryVisibility();
    dbMock.enqueueFor("select", "cells", [{ cellsChanged: readDate }], [gsmExportRow]);
    const pendingRead = createDeferredPromise<{ id: number }[]>();
    dbMock.enqueueFor("select", getTableName(stations), [{ id: 1 }], [stationMetadataRow], pendingRead.promise, [], []);
    dbMock.enqueueFor("select", "station_sectors", []);
    const app = await createRouteHarness(getCellsExport);
    const disconnected = createDeferredPromise<void>();
    app.server.once("connection", (socket) => socket.once("close", disconnected.resolve));
    let download: ClientRequest | undefined;
    let metadata: ExportMetadata | undefined;
    try {
      await app.listen({ host: "127.0.0.1", port: 0 });
      const address = app.server.address() as AddressInfo;
      let body = "";
      let status: number | undefined;
      let completed = true;
      let transportError: string | undefined;
      await new Promise<void>((resolve, reject) => {
        download = request(
          { hostname: "127.0.0.1", port: address.port, path: "/cells/export?format=2.0&rats=gsm&templateGsm={station_id}" },
          (response) => {
            status = response.statusCode;
            response.on("data", (data: Buffer) => {
              body += data.toString();
            });
            response.once("data", () => pendingRead.reject(new Error("Private database credentials")));
            response.once("error", (error: NodeJS.ErrnoException) => {
              transportError = error.code;
            });
            response.once("close", () => {
              completed = response.complete;
              resolve();
            });
          },
        );
        download.once("error", reject);
        download.end();
      });
      await disconnected.promise;
      expect(status).toBe(200);
      expect(body).toBe("007B002D310260\tSITE\n");
      expect(completed).toBe(false);
      expect(transportError).toBe("ECONNRESET");
      const failed = streams.mock.results[0];
      expect(failed?.type).toBe("return");
      if (failed?.type !== "return") throw new Error("Missing export stream");
      expect(failed.value.destroyed).toBe(true);
      expect(failed.value.closed).toBe(true);

      const held = holdExportMetadata();
      metadata = held.pending;
      dbMock.enqueueFor("select", "cells", metadata.promise, metadata.promise);
      const first = app.inject({ url: "/cells/export?format=2.0" });
      const second = app.inject({ url: "/cells/export?format=2.0" });
      await Promise.race([held.started, first.then(() => {}), second.then(() => {})]);
      metadata.resolve([{ cellsChanged: null }]);
      expect((await Promise.all([first, second])).map((response) => response.statusCode)).toEqual([200, 200]);
      await waitForExportStreams(streams.mock.results);
      expect(dbMock.pendingResults()).toBe(0);
    } finally {
      pendingRead.resolve([]);
      metadata?.resolve([]);
      download?.destroy();
      await app.close();
    }
  });

  it("cancels an export when the client disconnects while its metadata is still loading", async () => {
    const streamClosed = createDeferredPromise<void>();
    const from = Readable.from.bind(Readable);
    const streams = vi.spyOn(Readable, "from").mockImplementation((iterable, options) => {
      const stream = from(iterable, options);
      stream.once("close", streamClosed.resolve);
      return stream;
    });
    const pendingMetadata = createDeferredPromise<MetadataRows>();
    const pendingRecovery = createDeferredPromise<MetadataRows>();
    const metadataStarted = createDeferredPromise<void>();
    const recoveryStarted = createDeferredPromise<void>();
    const select = dbMock.select.getMockImplementation();
    let metadataReads = 0;
    dbMock.select.mockImplementation((selection) => {
      if (typeof selection === "object" && selection !== null && "cellsChanged" in selection) {
        metadataReads += 1;
        if (metadataReads === 1) metadataStarted.resolve();
        if (metadataReads === 3) recoveryStarted.resolve();
      }
      if (!select) throw new Error("Missing database boundary");
      return select(selection);
    });
    cacheCountryVisibility();
    dbMock.enqueueFor("select", "cells", pendingMetadata.promise, pendingRecovery.promise, pendingRecovery.promise);
    dbMock.enqueueFor("select", getTableName(stations), [], []);
    const app = await createRouteHarness(getCellsExport);
    const disconnected = createDeferredPromise<void>();
    app.server.once("connection", (socket) => socket.once("close", disconnected.resolve));
    let download: ClientRequest | undefined;
    let receivedResponse = false;
    let transportError: string | undefined;
    try {
      await app.listen({ host: "127.0.0.1", port: 0 });
      const address = app.server.address() as AddressInfo;
      const clientClosed = new Promise<void>((resolve) => {
        download = request({ hostname: "127.0.0.1", port: address.port, path: "/cells/export?format=2.0" }, (response) => {
          receivedResponse = true;
          response.resume();
        });
        download.once("error", (error: NodeJS.ErrnoException) => {
          transportError = error.code;
        });
        download.once("close", resolve);
        download.end();
      });
      await metadataStarted.promise;
      download?.destroy();
      await Promise.all([clientClosed, disconnected.promise]);
      expect(streams).not.toHaveBeenCalled();
      pendingMetadata.resolve([{ cellsChanged: readDate }]);
      await streamClosed.promise;
      expect(receivedResponse).toBe(false);
      expect(transportError).toBe("ECONNRESET");
      const cancelled = streams.mock.results[0];
      if (cancelled?.type !== "return") throw new Error("Missing cancelled export stream");
      expect(cancelled.value.destroyed).toBe(true);
      expect(cancelled.value.readableDidRead).toBe(false);
      expect(dbMock.calls.some((call) => call.table === getTableName(stations))).toBe(false);

      const first = app.inject({ url: "/cells/export?format=2.0" });
      const second = app.inject({ url: "/cells/export?format=2.0" });
      await Promise.race([recoveryStarted.promise, first.then(() => {}), second.then(() => {})]);
      pendingRecovery.resolve([{ cellsChanged: null }]);
      expect((await Promise.all([first, second])).map((response) => response.statusCode)).toEqual([200, 200]);
      await waitForExportStreams(streams.mock.results);
      expect(dbMock.pendingResults()).toBe(0);
    } finally {
      pendingMetadata.resolve([]);
      pendingRecovery.resolve([]);
      download?.destroy();
      await app.close();
    }
  });

  it.each([
    ["2.0", "007B002D310260\tSITE\n"],
    ["2.1", "0012300045310260\tSITE\n"],
    ["3.0-dec", "310260;00123;00045;00000;52;21;-1;SITE;0\n"],
    ["3.0-hex", "310260;0x007B;0x002D;0x0000;52;21;-1;SITE;0\n"],
    ["4.0", "310260;00123;00045;0;52;21;-1;SITE;1;SITE_123;-1;-1;-1;-1;99;SITE\n"],
    ["ntm", "2G;310;260;123;45;2147483647;2147483647;52;21;SITE;2147483647\n"],
    ["netmonitor", "G;310;260;45;123;;;52;21;100;SITE;\n"],
  ])("streams real GSM conversion for %s with the three-digit MNC preserved", async (format, text) => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "cells", [{ cellsChanged: readDate }], [gsmExportRow]);
    dbMock.enqueueFor("select", getTableName(stations), [{ id: 1 }], [stationMetadataRow], []);
    dbMock.enqueueFor("select", "station_sectors", []);
    const app = await createRouteHarness(getCellsExport);
    const response = await app.inject({ url: `/cells/export?format=${format}&rats=gsm&templateGsm={station_id}` });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(text);
    expect(stationPickerCalls()).toHaveLength(2);
  });

  it.each([
    ["2.0", "clf"],
    ["ntm", "ntm"],
    ["netmonitor", "csv"],
  ])("describes an empty %s export with the correct extension", async (format, extension) => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "cells", [{ cellsChanged: readDate }]);
    dbMock.enqueueFor("select", getTableName(stations), []);
    const app = await createRouteHarness(getCellsExport);
    const response = await app.inject({ url: `/cells/export?format=${format}` });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
    expect(response.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe(`attachment; filename="cells_export_${format}.${extension}"`);
    expect(response.headers["last-modified"]).toBe(readDate.toUTCString());
  });

  it("answers 304 to a copy that is still current, and a new ETag once a cell is removed or changed", async () => {
    const version = {
      cellsChanged: new Date("2026-11-01T08:00:00.000Z"),
      stationsChanged: null,
      locationsChanged: new Date("2026-11-17T10:00:00.000Z"),
      ownersChanged: null,
      cellCount: 5,
      contentSum: "48213",
    };
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor(
      "select",
      "cells",
      [version],
      [version],
      [version],
      [version],
      [{ ...version, cellCount: 4 }],
      [{ ...version, contentSum: "-7311" }],
    );
    const app = await createRouteHarness(getCellsExport);
    const url = "/cells/export?format=celldex";
    const first = await app.inject({ method: "HEAD", url });
    expect(first.statusCode).toBe(200);
    expect(first.headers["x-cell-count"]).toBe("5");
    expect(first.headers["last-modified"]).toBe(version.locationsChanged.toUTCString());
    const etag = String(first.headers.etag);
    expect(etag).toMatch(/^W\/".+"$/);

    expect((await app.inject({ method: "HEAD", url, headers: { "if-none-match": etag } })).statusCode).toBe(304);
    const unchanged = await app.inject({ url, headers: { "if-none-match": etag } });
    expect(unchanged.statusCode).toBe(304);
    expect(unchanged.body).toBe("");
    const since = version.locationsChanged.toUTCString();
    expect((await app.inject({ method: "HEAD", url, headers: { "if-modified-since": since } })).statusCode).toBe(304);
    const removed = await app.inject({ method: "HEAD", url, headers: { "if-none-match": etag } });
    expect(removed.statusCode).toBe(200);
    expect(removed.headers.etag).not.toBe(etag);
    expect((await app.inject({ method: "HEAD", url, headers: { "if-none-match": etag } })).statusCode).toBe(200);
    expect(stationPickerCalls()).toHaveLength(0);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("serves HEAD metadata without reading any export chunks", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "cells", [{ cellsChanged: null }]);
    const app = await createRouteHarness(getCellsExport);
    const response = await app.inject({ method: "HEAD", url: "/cells/export?format=ntm" });
    expect(response.statusCode).toBe(200);
    expect(response.headers).not.toHaveProperty("last-modified");
    expect(dbMock.calls.some((call) => call.table === getTableName(stations))).toBe(false);
    const where = dbMock.calls.find((call) => call.table === "cells")?.clauses.where?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(where);
    expect(query.params).toEqual(expect.arrayContaining(["published", "PL", "LTE", "NR"]));
  });

  it.each([
    { filters: "rats=gsm&iotRats=lte,nr", rats: ["GSM", "LTE", "NR"], lteIotOnly: true, nrIotOnly: true },
    { filters: "rats=gsm,umts&iotRats=lte,nr", rats: ["GSM", "UMTS", "LTE", "NR"], lteIotOnly: true, nrIotOnly: true },
    { filters: "rats=lte&iotRats=lte,nr", rats: ["LTE", "NR"], lteIotOnly: false, nrIotOnly: true },
    { filters: "rats=nr&iotRats=lte,nr", rats: ["LTE", "NR"], lteIotOnly: true, nrIotOnly: false },
    { filters: "rats=lte,nr&iotRats=lte,nr", rats: ["LTE", "NR"], lteIotOnly: false, nrIotOnly: false },
    { filters: "iotRats=lte,nr", rats: ["LTE", "NR"], lteIotOnly: true, nrIotOnly: true },
    { filters: "iotRats=nr", rats: ["NR"], lteIotOnly: false, nrIotOnly: true },
  ])("preserves selected RATs and IoT filtering for $filters", async ({ filters, rats, lteIotOnly, nrIotOnly }) => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "cells", [{ cellsChanged: null }]);
    const app = await createRouteHarness(getCellsExport);
    const response = await app.inject({ method: "HEAD", url: `/cells/export?format=ntm&${filters}` });
    expect(response.statusCode).toBe(200);
    const where = dbMock.calls.find((call) => call.table === "cells")?.clauses.where?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(where);
    const selectedRats = query.params.filter((value) => typeof value === "string" && ["GSM", "UMTS", "LTE", "NR"].includes(value));
    expect(selectedRats).toEqual(rats);
    expect(query.params.filter((value) => typeof value === "boolean")).toEqual([lteIotOnly, nrIotOnly].filter(Boolean));
    expect(dbMock.calls.some((call) => call.table === getTableName(stations))).toBe(false);
  });

  it.each([
    { filters: "format=ntm", nrModes: ["sa"] },
    { filters: "format=4.0", nrModes: ["sa"] },
    { filters: "format=ntm&nrModes=sa,nsa", nrModes: ["sa", "nsa"] },
  ])("exports only the asked NR modes, standalone by default, for $filters", async ({ filters, nrModes }) => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "cells", [{ cellsChanged: null }]);
    const app = await createRouteHarness(getCellsExport);
    const response = await app.inject({ method: "HEAD", url: `/cells/export?${filters}` });
    expect(response.statusCode).toBe(200);
    const where = dbMock.calls.find((call) => call.table === "cells")?.clauses.where?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(where);
    expect(query.params.filter((value) => value === "sa" || value === "nsa")).toEqual(nrModes);
  });

  it("streams a Celldex export as a .cdx file that starts with its header and keeps each site's cells under it", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "cells", [{ cellsChanged: readDate }], [gsmExportRow, { ...gsmExportRow, gsm_cid: 100 }]);
    dbMock.enqueueFor("select", getTableName(stations), [{ id: 1 }], [stationMetadataRow], []);
    dbMock.enqueueFor("select", "station_sectors", []);
    const app = await createRouteHarness(getCellsExport);
    const template = encodeURIComponent("[{station_id}]");
    const response = await app.inject({ url: `/cells/export?format=celldex&rats=gsm&nrModes=sa,nsa&templateGsm=${template}` });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="cells_export_celldex.cdx"');
    expect(response.body).toBe('celldex 1\n\nsite 310260 52 21 "[SITE]" id=SITE\n  gsm 45/100 type=macro\n  gsm 45/123 type=macro\n');
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each(["format=csv", "format=4.0&nrModes=nsa", "format=ntm&updatedAfter=2026-01-01", "format=ntm&templateLte=%20"])(
    "rejects invalid export options: %s",
    async (query) => {
      const app = await createRouteHarness(getCellsExport);
      expect((await app.inject({ url: `/cells/export?${query}` })).statusCode).toBe(400);
      expect(dbMock.calls).toHaveLength(0);
    },
  );
});

describe("readCellExportChunks", () => {
  it("keeps the same 500-station payload groups across larger keyset pages", async () => {
    const firstPage = Array.from({ length: 2000 }, (_, index) => ({ id: index * 2 + 1 }));
    const finalPage = Array.from({ length: 37 }, (_, index) => ({ id: 4001 + index * 2 }));
    dbMock.enqueueFor("select", getTableName(stations), firstPage, [], [], [], [], finalPage, [], []);
    dbMock.enqueueFor("select", "cells", [], [], [], [], []);
    dbMock.enqueueFor("select", "station_sectors", [], [], [], [], []);
    const cellExport = buildCellExport({ format: "2.0", countryCodes: ["PL"], rats: ["gsm"] }, []);
    const chunks = readCellExportChunks(cellExport, "2.0", new AbortController().signal);
    expect(await chunks.next()).toEqual({ value: undefined, done: true });

    const dialect = new PgDialect();
    const payloadIds = dbMock.calls.filter((call) => call.table === "cells").map((call) => dialect.sqlToQuery(call.clauses.where?.[0] as SQL).params);
    expect(payloadIds.map((ids) => ids.length)).toEqual([500, 500, 500, 500, 37]);
    expect(payloadIds.flat()).toEqual([...firstPage, ...finalPage].map((row) => row.id));
    const pickerCalls = stationPickerCalls();
    expect(pickerCalls.map((call) => call.clauses.limit)).toEqual([[2000], [2000], [2000]]);
    expect(pickerCalls.map((call) => dialect.sqlToQuery(call.clauses.where?.[0] as SQL).params.at(-1))).toEqual([0, 3999, 4073]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("does not query stations when already cancelled", async () => {
    const reader = new AbortController();
    reader.abort();
    const cellExport = buildCellExport({ format: "2.0", rats: ["gsm"] }, []);
    const chunks = readCellExportChunks(cellExport, "2.0", reader.signal);
    expect(await chunks.next()).toEqual({ value: undefined, done: true });
    expect(dbMock.calls).toHaveLength(0);
  });

  it("does not yield or query another page after cancellation during a payload read", async () => {
    const payload = createDeferredPromise<(typeof gsmExportRow)[]>();
    const payloadStarted = createDeferredPromise<void>();
    const select = dbMock.select.getMockImplementation();
    dbMock.select.mockImplementation((selection) => {
      if (typeof selection === "object" && selection !== null && "gsm_lac" in selection) payloadStarted.resolve();
      if (!select) throw new Error("Missing database boundary");
      return select(selection);
    });
    dbMock.enqueueFor("select", getTableName(stations), [{ id: 1 }], [stationMetadataRow]);
    dbMock.enqueueFor("select", "cells", payload.promise);
    dbMock.enqueueFor("select", "station_sectors", []);
    const reader = new AbortController();
    const cellExport = buildCellExport({ format: "2.0", rats: ["gsm"] }, []);
    const chunks = readCellExportChunks(cellExport, "2.0", reader.signal);
    const pendingChunk = chunks.next();
    await payloadStarted.promise;
    reader.abort();
    payload.resolve([gsmExportRow]);
    expect(await pendingChunk).toEqual({ value: undefined, done: true });
    expect(stationPickerCalls()).toHaveLength(1);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("stops remaining chunks and payload groups when cancelled while the consumer is paused", async () => {
    dbMock.enqueueFor(
      "select",
      getTableName(stations),
      Array.from({ length: 600 }, (_, index) => ({ id: index + 1 })),
    );
    dbMock.enqueueFor("select", getTableName(stations), [stationMetadataRow]);
    dbMock.enqueueFor(
      "select",
      "cells",
      Array.from({ length: 201 }, (_, index) => ({ ...gsmExportRow, gsm_cid: index + 1 })),
    );
    dbMock.enqueueFor("select", "station_sectors", []);
    const reader = new AbortController();
    const cellExport = buildCellExport({ format: "2.0", rats: ["gsm"] }, []);
    const chunks = readCellExportChunks(cellExport, "2.0", reader.signal);
    const first = await chunks.next();
    expect(first.done).toBe(false);
    expect(first.value?.split("\n").filter(Boolean)).toHaveLength(200);
    reader.abort();
    expect(await chunks.next()).toEqual({ value: undefined, done: true });
    expect(stationPickerCalls()).toHaveLength(1);
    expect(dbMock.calls.filter((call) => call.table === "cells")).toHaveLength(1);
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("loadNativeExportLines", () => {
  const options: ConvertOptions = {
    templates: { GSM: "{station_id}", UMTS: "{station_id}", LTE: "{station_id}", NR_NSA: "{station_id}", NR: "{station_id}" },
  };

  it.each<ClfFormat>(["2.0", "2.1", "3.0-dec", "3.0-hex", "4.0", "ntm", "netmonitor", "celldex"])(
    "preserves full-loader output for mixed RATs, nullable metadata and zero values in %s",
    async (format) => {
      const { metadata, rows } = mixedExportRows();
      enqueueExportRows(rows);
      const legacy = await loadExportLines(nativeSelection(), format, options);
      expect(dbMock.calls.every((call) => call.table !== getTableName(stations))).toBe(true);
      enqueueExportRows(rows, metadata);
      const nativeStart = dbMock.calls.length;
      const native = await loadNativeExportLines(nativeSelection(), [1, 2], format, options);
      expect(native).toEqual(legacy);
      const nativeCalls = dbMock.calls.slice(nativeStart);
      expect(nativeCalls.filter((call) => call.table === getTableName(stations))).toHaveLength(1);
      expect(nativeCalls.find((call) => call.table === "cells")?.selection).not.toHaveProperty("station_sid");
      if (format === "2.0")
        expect(native).toEqual(["007B002D310260\tFIRST", "00EA0038310260\tSECOND", "01590043310260\tFIRST", "01C8004E310260\tSECOND"]);
      expect(dbMock.pendingResults()).toBe(0);
    },
  );

  it.each(["", null])("preserves %s extra-address semantics and region-only structure localization", async (extraAddress) => {
    const { metadata, rows } = mixedExportRows();
    const first = metadata[0];
    if (!first) throw new Error("Missing station fixture");
    first.extra_address = extraAddress;
    const selection = { ...nativeSelection(), rats: { gsm: true, umts: false, lte: false, nr: false } };
    dbMock.enqueueFor("select", getTableName(stations), metadata);
    dbMock.enqueueFor("select", "cells", rows.gsmRows);
    dbMock.enqueueFor("select", "station_sectors", rows.stationSectorRows);
    const template = "{address}|{structure_type}|{structure_note}|{sector_number}|{sector_azimuth}|{cell_type}|{notes}";
    const lines = await loadNativeExportLines(selection, [1, 2], "4.0", { templates: { GSM: template } });
    const address = extraAddress === null ? "Fallback address" : "";
    expect(lines).toEqual([`310260;00123;00045;1;0;0;-1;${address}|rooftop|property detail|1|0°|pico|cell notes;1;FIRST_123;0;-1;-1;-1;99;FIRST`]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each<[title: string, structure: Partial<StationExportMetadata>, written: string]>([
    ["type, owner and note", {}, "rooftop (PGE), property detail"],
    ["a note without a type or owner", { structure_type: null, structure_owner: null }, "property detail"],
    [
      "a note that names the type",
      { country_code: "PL", structure_type: "church", structure_owner: null, structure_note: "Kościół Mariacki" },
      "Kościół Mariacki",
    ],
    [
      "a note that names the type with another word",
      { country_code: "PL", structure_type: "church", structure_owner: null, structure_note: "wieża Bazyliki Mariackiej" },
      "wieża Bazyliki Mariackiej",
    ],
    [
      "the owner after a note that names the type",
      { country_code: "PL", structure_type: "church", structure_note: "kosciol pw. św. Anny" },
      "kosciol pw. św. Anny (PGE)",
    ],
    [
      "a Polish note that names the type outside Poland",
      { structure_type: "chimney", structure_owner: null, structure_note: "Komin stalowy" },
      "Komin stalowy",
    ],
    [
      "the type joined to a note that continues it",
      { country_code: "PL", structure_type: "chimney", structure_note: "Stalowy" },
      "komin stalowy (PGE)",
    ],
    [
      "the type joined to a place hint",
      { country_code: "PL", structure_type: "lattice_tower", structure_owner: null, structure_note: "przy A4" },
      "wieża kratowa przy A4",
    ],
    [
      "the type joined to a building in the genitive",
      { country_code: "PL", structure_type: "rooftop", structure_owner: null, structure_note: "Politechniki Krakowskiej" },
      "dach Politechniki Krakowskiej",
    ],
    [
      "a former name next to the owner",
      { country_code: "PL", structure_type: "rooftop", structure_note: "(dawniej ZKE S.A.)" },
      "dach (PGE, dawniej ZKE S.A.)",
    ],
    [
      "a former name apart from the type without an owner",
      { country_code: "PL", structure_type: "lattice_tower", structure_owner: null, structure_note: "dawniej Centertel NMT" },
      "wieża kratowa, dawniej Centertel NMT",
    ],
    [
      "the type before a building in the nominative",
      { country_code: "PL", structure_type: "rooftop", structure_owner: null, structure_note: "blok mieszkalny" },
      "dach, blok mieszkalny",
    ],
    [
      "the type before a note that names another type",
      { country_code: "PL", structure_type: "rooftop", structure_owner: null, structure_note: "wieża na kamienicy" },
      "dach, wieża na kamienicy",
    ],
    [
      "the type before a note that only starts with its letters",
      { structure_type: "tower", structure_note: "Towerlink site" },
      "tower (PGE), Towerlink site",
    ],
  ])("writes %s as the structure details", async (_title, structure, written) => {
    const { metadata, rows } = mixedExportRows();
    const first = metadata[0];
    if (!first) throw new Error("Missing station fixture");
    Object.assign(first, structure);
    const selection = { ...nativeSelection(), rats: { gsm: true, umts: false, lte: false, nr: false } };
    dbMock.enqueueFor("select", getTableName(stations), metadata);
    dbMock.enqueueFor("select", "cells", rows.gsmRows);
    dbMock.enqueueFor("select", "station_sectors", rows.stationSectorRows);
    const lines = await loadNativeExportLines(selection, [1, 2], "4.0", { templates: { GSM: "{structure_details}" } });
    expect(lines).toEqual([`310260;00123;00045;1;0;0;-1;${written};1;FIRST_123;0;-1;-1;-1;99;FIRST`]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("keeps arbitrary legacy station conditions on the original full-payload path", async () => {
    const { rows } = mixedExportRows();
    enqueueExportRows(rows);
    const selection = { ...nativeSelection(), stationConditions: [eq(stations.station_id, "FIRST")] };
    expect(await loadExportLines(selection, "2.0", options)).toHaveLength(4);
    expect(dbMock.calls.some((call) => call.table === getTableName(stations))).toBe(false);
    expect(dbMock.calls.find((call) => call.table === "cells")?.selection).toHaveProperty("station_sid");
    expect(new PgDialect().sqlToQuery(dbMock.calls[0]?.clauses.where?.[0] as SQL).params).toEqual(["FIRST"]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("retains original unordered LTE first-TAC selection for separately displayed NTM NR", async () => {
    const { rows } = mixedExportRows();
    const lte = rows.lteRows[0];
    const nr = rows.nrRows[0];
    const first = mixedExportRows().metadata[0];
    if (!lte || !nr || !first) throw new Error("Missing cell fixture");
    rows.lteRows = [
      { ...lte, station_country_code: "PL", lte_tac: 200 },
      { ...lte, station_country_code: "PL", lte_tac: 100 },
    ];
    rows.nrRows = [{ ...nr, ...first, station_country_code: "PL", nr_type: "nsa", nr_pci: 31 }];
    enqueueExportRows(rows);
    const lines = await loadNativeExportLines(nativeSelection(), [1, 2], "ntm", { ...options, displayNRSeparately: true });
    expect(lines).toContain("5G;310;260;456;200;;31;0;0;FIRST;2147483647");
    expect(dbMock.calls.some((call) => call.table === getTableName(stations))).toBe(false);
    expect(dbMock.calls.find((call) => call.table === "cells")?.selection).toHaveProperty("station_sid");
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each<[title: string, stationTacs: (number | null)[], written: string]>([
    ["the TAC all LTE cells share", [200, 200], "200"],
    ["no TAC when the LTE cells have different TACs", [200, 100], "2147483647"],
    ["no TAC when an LTE cell has none", [200, null], "2147483647"],
  ])("writes %s on a separately displayed NTM NR line in a country where cells do not share a station TAC", async (_title, stationTacs, written) => {
    const { rows } = mixedExportRows();
    const lte = rows.lteRows[0];
    const nr = rows.nrRows[0];
    const first = mixedExportRows().metadata[0];
    if (!lte || !nr || !first) throw new Error("Missing cell fixture");
    rows.lteRows = [{ ...lte, station_country_code: "DE", lte_tac: 200 }];
    rows.nrRows = [{ ...nr, ...first, station_country_code: "DE", nr_type: "nsa", nr_pci: 31 }];
    enqueueExportRows(rows);
    dbMock.enqueueFor(
      "select",
      "cells",
      stationTacs.map((tac) => ({ station_id: 1, station_lte_tac: tac })),
    );
    const lines = await loadNativeExportLines(nativeSelection(), [1, 2], "ntm", { ...options, displayNRSeparately: true });
    expect(lines).toContain(`5G;310;260;456;${written};;31;0;0;FIRST;2147483647`);
    const stationTacQuery = dbMock.calls.findLast((call) => call.table === "cells");
    expect(new PgDialect().sqlToQuery(stationTacQuery?.clauses.where?.[0] as SQL).params).toEqual([1]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("fails explicitly when a selected cell has no station metadata", async () => {
    const { rows } = mixedExportRows();
    enqueueExportRows(rows, []);
    await expect(loadNativeExportLines(nativeSelection(), [1, 2], "2.0", options)).rejects.toThrow("Missing station metadata for cell export");
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each([null, "SDL"] as const)("ignores nullable NR band values with %s duplex metadata", async (duplex) => {
    const { metadata, rows } = mixedExportRows();
    rows.nrBandRows.unshift({ station_id: 1, cell_pk: 5, nr_type: "nsa", band_value: null, band_duplex: duplex, nr_pci: 31, is_confirmed: true });
    enqueueExportRows(rows, metadata);
    const templates = { ...options.templates, LTE: "{station_id} [{nr_band}:{nr_pcis}]" };
    const lines = await loadNativeExportLines(nativeSelection(), [1, 2], "2.0", { templates });
    expect(lines).toContain("01590043310260\tFIRST");
    expect(lines).toHaveLength(4);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("returns an empty native selection without querying the database", async () => {
    expect(await loadNativeExportLines(nativeSelection(), [], "4.0", options)).toEqual([]);
    expect(dbMock.calls).toHaveLength(0);
  });
});

describe("compiled export templates", () => {
  it.each([
    ["L{missing} {station_id}", " FIRST"],
    ["{missing} L{station_id}", " LFIRST"],
    ["{missing} 5G {station_id}", " 5G FIRST"],
    ["{missing}, {also_missing} - {station_id}", " - FIRST"],
    ["[{missing}] [{station_id}]", "[FIRST]"],
    ["[[{station_id}]] [literal]", "[[FIRST]] [literal]"],
    ["[{station_id}", "[FIRST"],
    ["{zero}:{big}:{station_id}:{station_id}", "0:456:FIRST:FIRST"],
  ])("preserves literal output for %s", (template, expected) => {
    const values: Record<string, string> = { station_id: "FIRST", zero: "0", big: String(456n) };
    const getValue = (key: string) => values[key] ?? "";
    expect(renderCLFDescriptionTemplate(template, getValue)).toBe(expected);
    expect(compileCLFDescriptionTemplate(template)(getValue)).toBe(expected);
  });

  it("resolves repeated values afresh in occurrence order without retaining a previous render", () => {
    const render = compileCLFDescriptionTemplate("[{value}:{value}] {missing} {station_id}");
    let counter = 0;
    function getValue(key: string): string {
      if (key === "value") return String(++counter);
      if (key === "station_id") return "FIRST";
      return "";
    }
    expect(render(getValue)).toBe("[1:2] FIRST");
    expect(render(() => "")).toBe("");
    expect(render((key) => (key === "station_id" ? "SECOND" : ""))).toBe("SECOND");
  });

  it.each(["", " "])("keeps effective-template fallback semantics for %s", (template) => {
    const cell = { cid: 123, lac: 45, rat: "GSM" as const, station_id: "FIRST", band_name: "GSM 900", operator_mnc: 310260 };
    const options = { templates: { GSM: template } };
    expect(convertToCLF(cell, "4.0", prepareConvertOptions(options))).toBe(convertToCLF(cell, "4.0", options));
    expect(dbMock.calls).toHaveLength(0);
  });
});

describe("cell fields beyond the identity", () => {
  const options: ConvertOptions = { templates: { GSM: "{station_id}", UMTS: "{station_id}" } };
  const gsm = { cid: 123, lac: 45, rat: "GSM" as const, station_id: "SITE", band_name: "GSM 900", operator_mnc: 26002, latitude: 52, longitude: 21 };

  it.each([
    ["an outdoor macro sector", { cell_type: "MACROCELL", sector_azimuth: 120 }, "0", "120"],
    ["a small cell facing north", { cell_type: "MICROCELL", sector_azimuth: 360 }, "1", "0"],
    ["an indoor sector", { cell_type: "FEMTOCELL", sector_azimuth: 90 }, "2", "450"],
    ["a cell of unknown type without a sector", { cell_type: null }, "-1", "-1"],
  ])("writes the CLF 4.1 type and azimuth of %s", (_title, fields, type, azimuth) => {
    const line = convertToCLF({ ...gsm, ...fields }, "4.0", options);
    expect(line).toBe(`26002;00123;00045;${type};52;21;-1;SITE;1;SITE_123;${azimuth};-1;-1;-1;99;SITE`);
  });

  it("writes a UMTS cell's 28-bit id with the RNC for Netmonitor", () => {
    const umts = {
      cid: 234,
      rnc: 2,
      cid_long: 2 * 65_536 + 234,
      lac: 56,
      rat: "UMTS" as const,
      station_id: "SITE",
      band_name: "UMTS 2100",
      operator_mnc: 26002,
    };
    expect(convertToCLF(umts, "netmonitor", options)).toBe("W;260;02;56;131306;;;;;100;SITE;");
    expect(convertToCLF(umts, "4.0", options)).toBe("26002;00234;00056;-1;0;0;0;SITE;3;SITE_234;-1;-1;-1;-1;99;SITE");
  });
});

describe("LTE EARFCN in export lines", () => {
  const options: ConvertOptions = { templates: { LTE: "{lte_earfcn}" } };
  const selection: ExportSelection = { ...nativeSelection(), rats: { gsm: false, umts: false, lte: true, nr: false } };
  const station: StationExportMetadata = { ...stationMetadataRow, operator_mnc: 26002 };
  const cell = {
    ...station,
    cell_type: "MACROCELL",
    notes: null,
    sector_id: null,
    is_confirmed: true,
    band_value: 1800,
    band_name: "LTE 1800",
    band_duplex: "FDD",
    lte_tac: 67,
    lte_enbid: 1,
    lte_clid: 89,
    lte_ecid: 345,
    lte_pci: 7,
  };

  function enqueueLteCell(earfcn: number | null): void {
    dbMock.enqueueFor("select", getTableName(stations), [station]);
    dbMock.enqueueFor("select", "cells", [{ ...cell, lte_earfcn: earfcn }], []);
    dbMock.enqueueFor("select", "station_sectors", []);
  }

  it.each<[format: ClfFormat, stored: string, missing: string]>([
    ["2.0", "0159004326002\t1300", "0159004326002\t"],
    ["2.1", "003450006726002\t1300", "003450006726002\t"],
    ["3.0-dec", "26002;00345;00067;00000;52;21;-1;1300;0", "26002;00345;00067;00000;52;21;-1;;0"],
    ["3.0-hex", "26002;0x0159;0x0043;0x0000;52;21;-1;1300;0", "26002;0x0159;0x0043;0x0000;52;21;-1;;0"],
    ["4.0", "26002;00345;00067;0;52;21;-1;1300;4;SITE_345;-1;-1;-1;-1;99;SITE", "26002;00345;00067;0;52;21;-1;;4;SITE_345;-1;-1;-1;-1;99;SITE"],
    ["ntm", "4G;260;02;89;67;1;7;52;21;1300;1300", "4G;260;02;89;67;1;7;52;21;;2147483647"],
    ["netmonitor", "L;260;02;67;345;7;1300;52;21;100;1300;", "L;260;02;67;345;7;;52;21;100;;"],
  ])("prints the cell's stored EARFCN in %s and none for a cell without one", async (format, stored, missing) => {
    enqueueLteCell(1300);
    expect(await loadNativeExportLines(selection, [1], format, options)).toEqual([stored]);
    enqueueLteCell(null);
    expect(await loadNativeExportLines(selection, [1], format, options)).toEqual([missing]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("prints no EARFCN in a NetMonitor line for a stored 0", async () => {
    enqueueLteCell(0);
    const lines = await loadNativeExportLines(selection, [1], "netmonitor", { templates: { LTE: "{station_id}" } });
    expect(lines).toEqual(["L;260;02;67;345;7;;52;21;100;SITE;"]);
  });

  it("reads the stored EARFCN on the full-loader path too", async () => {
    dbMock.enqueueFor("select", "cells", [{ ...cell, lte_earfcn: 1300 }], []);
    dbMock.enqueueFor("select", "station_sectors", []);
    expect(await loadExportLines(selection, "netmonitor", options)).toEqual(["L;260;02;67;345;7;1300;52;21;100;1300;"]);
    expect(dbMock.calls.find((call) => call.table === "cells")?.selection).toHaveProperty("lte_earfcn");
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("stationPlacementConditions", () => {
  it("leaves unfiltered placement conditions empty", () => {
    expect(stationPlacementConditions({}, [])).toEqual([]);
    expect(stationAreaConditions({}, [])).toEqual([]);
  });

  it.each<{
    name: string;
    query: AreaFilterQuery;
    hidden: string[];
    params: unknown[];
  }>([
    { name: "country", query: { countryCodes: ["PL"] }, hidden: [], params: ["PL"] },
    { name: "region", query: { regionIds: [17, 18] }, hidden: [], params: [17, 18] },
    { name: "hidden countries", query: {}, hidden: ["DE"], params: ["DE"] },
    {
      name: "combined area",
      query: { bbox: [14, 49, 24, 55], regionIds: [17], countryCodes: ["PL"] },
      hidden: ["DE"],
      params: [14, 49, 24, 55, 17, "PL", "DE"],
    },
    {
      name: "antimeridian bounding box",
      query: { bbox: [170, -10, -170, 10] },
      hidden: [],
      params: [170, -10, 180, 10, -180, -10, -170, 10],
    },
  ])("preserves $name predicates in both joined and legacy wrapped queries", ({ query, hidden, params }) => {
    const direct = new PgDialect().sqlToQuery(sql.join(stationPlacementConditions(query, hidden), sql` AND `));
    const wrapped = new PgDialect().sqlToQuery(sql.join(stationAreaConditions(query, hidden), sql` AND `));
    expect(direct.params).toEqual(params);
    expect(wrapped.params).toEqual(params);
    expect(dbMock.calls).toHaveLength(0);
  });
});

describe("export lines for shared cells", () => {
  const lteRow = {
    ...stationMetadataRow,
    cell_pk: 11,
    cell_type: "MACROCELL",
    notes: null,
    sector_id: null,
    band_value: 1800,
    band_name: "LTE 1800",
    band_duplex: "FDD" as const,
    band_code: "b3",
    is_confirmed: true,
    lte_tac: 67,
    lte_enbid: 1,
    lte_clid: 89,
    lte_ecid: 345,
    lte_pci: 0,
    lte_earfcn: null,
  };
  const rows: ExportRows = { gsmRows: [], umtsRows: [], lteRows: [lteRow], nrRows: [], nrBandRows: [], stationSectorRows: [] };
  const networkOf = (line: string) => line.split(";").slice(1, 3).join("-");

  it("writes one more line per extra code", async () => {
    const networks = { extraCodes: new Map([[11, ["23420"]]]), guestOnlyStationIds: new Set<number>() };
    const lines = await renderExportLines(rows, "netmonitor", {}, networks);
    expect(lines.map(networkOf)).toEqual(["310-260", "234-20"]);
  });

  it("writes only the extra lines of a station matched as a guest", async () => {
    const networks = { extraCodes: new Map([[11, ["23420"]]]), guestOnlyStationIds: new Set([1]) };
    const lines = await renderExportLines(rows, "netmonitor", {}, networks);
    expect(lines.map(networkOf)).toEqual(["234-20"]);
  });
});

describe("Celldex export", () => {
  const options: ConvertOptions = { templates: { NR_NSA: "NSA {nr_pci}" } };
  const first: StationExportMetadata = {
    ...stationMetadataRow,
    station_sid: "61234",
    operator_mnc: 26003,
    latitude: 52.1,
    longitude: 20.8,
    city: "Katowice",
    address: "Kościuszki 30",
    station_country_code: "PL",
    structure_owner: "Cellnex",
    structure_note: 'dach "A"\r\nwieża',
  };
  const second: StationExportMetadata = {
    ...first,
    station_pk: 2,
    station_sid: "~2",
    latitude: null,
    longitude: null,
    city: null,
    address: null,
    structure_owner: null,
    structure_note: null,
  };
  const play: StationExportMetadata = { ...second, station_pk: 3, station_sid: "P1", operator_mnc: 26006, city: "Warszawa" };
  const cell = {
    cell_type: null,
    notes: null,
    sector_id: null,
    is_confirmed: true,
    band_value: null,
    band_name: null,
    band_duplex: null,
    band_code: null,
  };
  const nonStandalone = {
    ...first,
    ...cell,
    cell_pk: 3,
    band_code: "n78",
    nr_nrtac: null,
    nr_gnbid: null,
    nr_gnbid_length: null,
    nr_clid: null,
    nr_nci: null,
    nr_pci: 7,
    nr_arfcn: 636666,
    nr_type: "nsa" as const,
  };
  const lte = { ...first, ...cell, cell_pk: 2, lte_tac: 3300, lte_enbid: 61234, lte_clid: 11, lte_ecid: 15675915, lte_pci: 41, lte_earfcn: 3050 };
  const umts = {
    ...second,
    ...cell,
    cell_pk: 5,
    band_code: "I",
    umts_psc: 301,
    umts_lac: 510,
    umts_rnc: 51,
    umts_cid: 2817,
    umts_cid_long: 3345153,
    umts_arfcn: 10812,
  };
  const playNr = {
    ...play,
    ...cell,
    cell_pk: 7,
    nr_nrtac: null,
    nr_gnbid: 5,
    nr_gnbid_length: 28,
    nr_clid: 3,
    nr_nci: 1283n,
    nr_pci: null,
    nr_arfcn: null,
    nr_type: "sa" as const,
  };
  const rows: ExportRows = {
    gsmRows: [{ ...second, ...cell, cell_pk: 1, gsm_lac: 45, gsm_cid: 123, gsm_e_gsm: false, gsm_bsic: 12 }],
    umtsRows: [umts, { ...umts, cell_pk: 6, umts_rnc: 0, umts_cid_long: 2817, umts_arfcn: null }],
    lteRows: [
      { ...lte, band_code: "B7" },
      { ...lte, cell_pk: 8, band_code: "B20", lte_clid: 12, lte_ecid: 15675916, lte_pci: 42, lte_earfcn: null },
    ],
    nrRows: [
      nonStandalone,
      {
        ...nonStandalone,
        cell_pk: 4,
        sector_id: 101,
        nr_nrtac: 3300,
        nr_gnbid: 61234,
        nr_gnbid_length: 24,
        nr_clid: 1,
        nr_nci: 250814465n,
        nr_pci: 3,
        nr_type: "sa",
      },
      playNr,
      { ...playNr, cell_pk: 9, nr_gnbid: 6, nr_gnbid_length: 24, nr_clid: 1, nr_nci: 24577n },
    ],
    nrBandRows: [],
    stationSectorRows: [{ id: 101, station_id: 1, azimuth: 360 }],
  };

  it("writes each station as a site with unnamed cells, the codes its country keeps and gnb= where a cell's gNBID length is not its network's", async () => {
    const networks = { extraCodes: new Map([[2, ["26003", "26006"]]]), guestOnlyStationIds: new Set([1]) };
    setCountryFeatures({ psc: true, bsic: false });
    expect(await renderExportLines(rows, "celldex", options, networks)).toEqual([
      "",
      'site 26003 52.1 20.8 "[61234] Katowice, Kościuszki 30" id=61234 owner="Cellnex" note="dach \\"A\\"\\nwieża"',
      "  nr  61234/1  tac=3300 pci=3 ch=636666 band=78 az=0",
      "  nr  -        pci=7 ch=636666 band=78 nsa",
      "  lte 61234/11 tac=3300 pci=41 ch=3050 plmns=26006",
      "  lte 61234/12 tac=3300 pci=42 band=20",
      "",
      'site 26003 - - "[~2]" id="~2"',
      "  umts 51/2817 lac=510 psc=301 ch=10812",
      "  umts -       lac=510 psc=301 band=1",
      "  gsm  45/123",
      "",
      'site 26006 - - "[P1] Warszawa" id=P1',
      "  nr 5/3",
      "  nr 6/1 gnb=24",
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("starts with the version line and one net line per network, by code", () => {
    const networks = [
      { mnc: 26006, countryCode: "PL" },
      { mnc: 26003, countryCode: "PL" },
      { mnc: 26006, countryCode: "PL" },
    ];
    expect(writeCelldexHeader(networks)).toBe("celldex 1\nnet 26003 gnb=24\nnet 26006 gnb=28\n");
  });
});
