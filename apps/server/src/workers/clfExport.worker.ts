import { bands, cells, gsmCells, locations, lteCells, nrCells, operators, regions, stationSectors, stations, umtsCells } from "@openbts/drizzle";
import type { CLFDescriptionTemplates } from "@openbts/shared/clfExportTemplates";
import { and, eq, gte, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parentPort } from "node:worker_threads";

import db from "../database/psql.js";
import { type ClfFormat, type ConvertOptions, type NRBandPCIs, convertToCLF } from "../services/clfExport/converter.js";
import { serializeWorkerError } from "../services/clfExport/protocol.js";

if (!parentPort) throw new Error("This file must be run as a worker thread");
const workerPort = parentPort;

const CLF_TMP_DIR = join(tmpdir(), "clf-exports");

type WorkerParams = {
  format: ClfFormat;
  operatorIds?: number[];
  regionCodes?: string[];
  rat?: ("GSM" | "UMTS" | "LTE" | "NR" | "IOT")[];
  bandIds?: number[];
  since?: string;
  templates?: CLFDescriptionTemplates;
  displayNRSeparately?: boolean;
};

workerPort.on("message", async (params: WorkerParams) => {
  try {
    const { format, operatorIds, regionCodes, rat, bandIds, since, templates, displayNRSeparately } = params;
    const convertOptions: ConvertOptions = {};
    if (templates !== undefined) convertOptions.templates = templates;
    if (displayNRSeparately === true) convertOptions.displayNRSeparately = true;

    const stationConditions = [eq(stations.status, "published")];
    if (operatorIds && operatorIds.length > 0) stationConditions.push(inArray(stations.operator_id, operatorIds));
    if (regionCodes && regionCodes.length > 0) stationConditions.push(inArray(regions.code, regionCodes));

    const baseConditions = [...stationConditions];
    if (bandIds && bandIds.length > 0) baseConditions.push(inArray(bands.value, bandIds));
    if (since) baseConditions.push(gte(cells.updatedAt, new Date(since)));

    const runGsm = !rat || rat.includes("GSM");
    const runUmts = !rat || rat.includes("UMTS");
    const runLte = !rat || rat.includes("LTE") || rat.includes("IOT");
    const runNR = !rat || rat.includes("NR") || rat.includes("IOT");

    const lteConditions = [...baseConditions];
    if (rat?.includes("IOT") && !rat.includes("LTE")) lteConditions.push(eq(lteCells.supports_iot, true));
    const nrConditions = [...baseConditions];
    if (rat?.includes("IOT") && !rat.includes("NR")) nrConditions.push(eq(nrCells.supports_nr_redcap, true));

    const commonSelect = {
      cell_type: cells.type,
      notes: cells.notes,
      station_pk: stations.id,
      station_sid: stations.station_id,
      extra_address: stations.extra_address,
      sector_id: cells.sector_id,
      operator_mnc: operators.mnc,
      latitude: locations.latitude,
      longitude: locations.longitude,
      city: locations.city,
      address: locations.address,
      region_code: regions.code,
      band_value: bands.value,
      band_name: bands.name,
      band_duplex: bands.duplex,
      is_confirmed: cells.is_confirmed,
    };

    const gsmQuery = runGsm
      ? db
          .select({ ...commonSelect, gsm_lac: gsmCells.lac, gsm_cid: gsmCells.cid, gsm_e_gsm: gsmCells.e_gsm })
          .from(cells)
          .innerJoin(gsmCells, eq(gsmCells.cell_id, cells.id))
          .innerJoin(stations, eq(cells.station_id, stations.id))
          .innerJoin(bands, and(eq(cells.band_id, bands.id), eq(bands.variant, "commercial")))
          .leftJoin(operators, eq(stations.operator_id, operators.id))
          .leftJoin(locations, eq(stations.location_id, locations.id))
          .leftJoin(regions, eq(locations.region_id, regions.id))
          .where(and(...baseConditions))
      : null;

    const umtsQuery = runUmts
      ? db
          .select({
            ...commonSelect,
            umts_lac: umtsCells.lac,
            umts_rnc: umtsCells.rnc,
            umts_cid: umtsCells.cid,
            umts_cid_long: umtsCells.cid_long,
            umts_arfcn: umtsCells.arfcn,
          })
          .from(cells)
          .innerJoin(umtsCells, eq(umtsCells.cell_id, cells.id))
          .innerJoin(stations, eq(cells.station_id, stations.id))
          .innerJoin(bands, and(eq(cells.band_id, bands.id), eq(bands.variant, "commercial")))
          .leftJoin(operators, eq(stations.operator_id, operators.id))
          .leftJoin(locations, eq(stations.location_id, locations.id))
          .leftJoin(regions, eq(locations.region_id, regions.id))
          .where(and(...baseConditions))
      : null;

    const lteQuery = runLte
      ? db
          .select({
            ...commonSelect,
            lte_tac: lteCells.tac,
            lte_enbid: lteCells.enbid,
            lte_clid: lteCells.clid,
            lte_ecid: lteCells.ecid,
            lte_pci: lteCells.pci,
            lte_earfcn: lteCells.earfcn,
          })
          .from(cells)
          .innerJoin(lteCells, eq(lteCells.cell_id, cells.id))
          .innerJoin(stations, eq(cells.station_id, stations.id))
          .innerJoin(bands, and(eq(cells.band_id, bands.id), eq(bands.variant, "commercial")))
          .leftJoin(operators, eq(stations.operator_id, operators.id))
          .leftJoin(locations, eq(stations.location_id, locations.id))
          .leftJoin(regions, eq(locations.region_id, regions.id))
          .where(and(...lteConditions))
      : null;

    const nrQuery = runNR
      ? db
          .select({
            ...commonSelect,
            nr_nrtac: nrCells.nrtac,
            nr_gnbid: nrCells.gnbid,
            nr_clid: nrCells.clid,
            nr_nci: nrCells.nci,
            nr_pci: nrCells.pci,
            nr_arfcn: nrCells.arfcn,
            nr_type: nrCells.type,
          })
          .from(cells)
          .innerJoin(nrCells, eq(nrCells.cell_id, cells.id))
          .innerJoin(stations, eq(cells.station_id, stations.id))
          .innerJoin(bands, and(eq(cells.band_id, bands.id), eq(bands.variant, "commercial")))
          .leftJoin(operators, eq(stations.operator_id, operators.id))
          .leftJoin(locations, eq(stations.location_id, locations.id))
          .leftJoin(regions, eq(locations.region_id, regions.id))
          .where(and(...nrConditions))
      : null;

    const nrBandsQuery =
      runLte || runNR
        ? db
            .select({
              station_id: cells.station_id,
              nr_type: nrCells.type,
              band_value: bands.value,
              band_duplex: bands.duplex,
              nr_pci: nrCells.pci,
              is_confirmed: cells.is_confirmed,
            })
            .from(cells)
            .innerJoin(nrCells, eq(nrCells.cell_id, cells.id))
            .innerJoin(bands, and(eq(cells.band_id, bands.id), eq(bands.variant, "commercial")))
            .innerJoin(stations, eq(cells.station_id, stations.id))
            .leftJoin(locations, eq(stations.location_id, locations.id))
            .leftJoin(regions, eq(locations.region_id, regions.id))
            .where(and(...stationConditions))
        : null;

    const stationSectorsQuery = db
      .select({ id: stationSectors.id, station_id: stationSectors.station_id, azimuth: stationSectors.azimuth })
      .from(stationSectors)
      .innerJoin(stations, eq(stationSectors.station_id, stations.id))
      .leftJoin(locations, eq(stations.location_id, locations.id))
      .leftJoin(regions, eq(locations.region_id, regions.id))
      .where(and(...stationConditions));

    const [gsmRows, umtsRows, lteRows, nrRows, nrBandRows, stationSectorRows] = await Promise.all([
      gsmQuery ?? Promise.resolve([]),
      umtsQuery ?? Promise.resolve([]),
      lteQuery ?? Promise.resolve([]),
      nrQuery ?? Promise.resolve([]),
      nrBandsQuery ?? Promise.resolve([]),
      stationSectorsQuery,
    ]);

    const stationLteTacMap = new Map<number, number>();
    if (displayNRSeparately) {
      for (const row of lteRows) {
        if (row.lte_tac === null || row.lte_tac === undefined) continue;
        if (!stationLteTacMap.has(row.station_pk)) stationLteTacMap.set(row.station_pk, row.lte_tac);
      }
    }

    const missingStationIds = displayNRSeparately
      ? [
          ...new Set(
            nrRows.flatMap((row) => {
              if (row.nr_type !== "nsa") return [];
              if (stationLteTacMap.has(row.station_pk)) return [];
              return [row.station_pk];
            }),
          ),
        ]
      : [];

    const stationLteTacRows =
      missingStationIds.length > 0
        ? await db
            .select({
              station_id: cells.station_id,
              station_lte_tac: lteCells.tac,
            })
            .from(cells)
            .innerJoin(lteCells, eq(lteCells.cell_id, cells.id))
            .where(inArray(cells.station_id, missingStationIds))
        : [];

    for (const row of stationLteTacRows) {
      if (row.station_lte_tac === null || row.station_lte_tac === undefined) continue;
      if (!stationLteTacMap.has(row.station_id)) stationLteTacMap.set(row.station_id, row.station_lte_tac);
    }

    stationSectorRows.sort((a, b) => (a.station_id === b.station_id ? a.id - b.id : a.station_id - b.station_id));

    const sectorMetaById = new Map<number, { index: number; azimuth: number }>();
    const sectorIndexByStationId = new Map<number, number>();
    for (const sector of stationSectorRows) {
      const index = (sectorIndexByStationId.get(sector.station_id) ?? 0) + 1;
      sectorIndexByStationId.set(sector.station_id, index);
      sectorMetaById.set(sector.id, { index, azimuth: sector.azimuth });
    }

    const stationNsaNRBandPciMap = new Map<number, Map<string, NRBandPCIs>>();
    const stationNRBandPciMap = new Map<string, Map<string, NRBandPCIs>>();
    for (const row of nrBandRows) {
      if (!row.band_value) continue;
      const key = `${row.band_value}:${row.band_duplex ?? "null"}`;

      if (row.nr_type === "nsa") {
        const nsaBandMap = stationNsaNRBandPciMap.get(row.station_id) ?? new Map();
        const nsaEntry = nsaBandMap.get(key) ?? { value: row.band_value, duplex: row.band_duplex ?? null, pcis: [], has_missing_pci: false };
        if (row.nr_pci !== null && row.nr_pci !== undefined) nsaEntry.pcis.push({ value: row.nr_pci, is_confirmed: row.is_confirmed });
        if (row.nr_pci === null || row.nr_pci === undefined) nsaEntry.has_missing_pci = true;
        nsaBandMap.set(key, nsaEntry);
        stationNsaNRBandPciMap.set(row.station_id, nsaBandMap);
      }

      const stationNRKey = `${row.station_id}:${row.nr_type ?? ""}`;
      const nrBandMap = stationNRBandPciMap.get(stationNRKey) ?? new Map();
      const nrEntry = nrBandMap.get(key) ?? { value: row.band_value, duplex: row.band_duplex ?? null, pcis: [], has_missing_pci: false };
      if (row.nr_pci !== null && row.nr_pci !== undefined) nrEntry.pcis.push({ value: row.nr_pci, is_confirmed: row.is_confirmed });
      if (row.nr_pci === null || row.nr_pci === undefined) nrEntry.has_missing_pci = true;
      nrBandMap.set(key, nrEntry);
      stationNRBandPciMap.set(stationNRKey, nrBandMap);
    }

    function buildCommonCellFields(
      row: {
        cell_type: string | null;
        notes: string | null;
        station_sid: string;
        extra_address: string | null;
        sector_id: number | null;
        operator_mnc: number | null;
        latitude: number | null;
        longitude: number | null;
        city: string | null;
        address: string | null;
        region_code: string | null;
        band_value: number | null;
        band_name: string | null;
        band_duplex: "FDD" | "TDD" | null;
        is_confirmed: boolean | null;
      },
      sectorMeta: { index: number; azimuth: number } | undefined,
    ) {
      return {
        band_value: row.band_value,
        band_name: row.band_name as string,
        band_duplex: row.band_duplex ?? null,
        station_id: row.station_sid,
        operator_mnc: row.operator_mnc,
        latitude: row.latitude,
        longitude: row.longitude,
        cell_type: row.cell_type,
        notes: row.notes,
        city: row.city ?? null,
        address: row.extra_address ?? row.address ?? null,
        region_code: row.region_code ?? null,
        is_confirmed: row.is_confirmed,
        sector_index: sectorMeta?.index,
        sector_azimuth: sectorMeta?.azimuth,
      };
    }

    const clfLines: string[] = [];

    for (const row of gsmRows) {
      const sectorMeta = row.sector_id ? sectorMetaById.get(row.sector_id) : undefined;
      const line = convertToCLF(
        {
          ...buildCommonCellFields(row, sectorMeta),
          cid: row.gsm_cid ?? 0,
          lac: row.gsm_lac,
          rat: "GSM",
          e_gsm: row.gsm_e_gsm ?? null,
        },
        format,
        convertOptions,
      );
      if (line) clfLines.push(line);
    }

    for (const row of umtsRows) {
      const sectorMeta = row.sector_id ? sectorMetaById.get(row.sector_id) : undefined;
      const line = convertToCLF(
        {
          ...buildCommonCellFields(row, sectorMeta),
          cid: row.umts_cid ?? 0,
          lac: row.umts_lac,
          rnc: row.umts_rnc,
          cid_long: row.umts_cid_long,
          arfcn: row.umts_arfcn ?? null,
          rat: "UMTS",
        },
        format,
        convertOptions,
      );
      if (line) clfLines.push(line);
    }

    for (const row of lteRows) {
      const sectorMeta = row.sector_id ? sectorMetaById.get(row.sector_id) : undefined;
      const line = convertToCLF(
        {
          ...buildCommonCellFields(row, sectorMeta),
          cid: row.lte_enbid ?? 0,
          tac: row.lte_tac,
          enbid: row.lte_enbid,
          clid: row.lte_clid,
          ecid: row.lte_ecid,
          pci: row.lte_pci,
          arfcn: row.lte_earfcn,
          rat: "LTE",
          nr_band_pcis: row.station_pk ? [...(stationNsaNRBandPciMap.get(row.station_pk)?.values() ?? [])] : undefined,
        },
        format,
        convertOptions,
      );
      if (line) clfLines.push(line);
    }

    for (const row of nrRows) {
      const stationNRKey = `${row.station_pk}:${row.nr_type ?? ""}`;
      const nrBandPciMap = stationNRBandPciMap.get(stationNRKey);
      const nr_band_pcis = nrBandPciMap ? [...nrBandPciMap.values()] : undefined;
      const sectorMeta = row.sector_id ? sectorMetaById.get(row.sector_id) : undefined;
      const line = convertToCLF(
        {
          ...buildCommonCellFields(row, sectorMeta),
          cid: row.nr_gnbid ?? 0,
          nrtac: row.nr_nrtac,
          gnbid: row.nr_gnbid,
          clid: row.nr_clid,
          nci: row.nr_nci,
          nr_type: row.nr_type,
          pci: row.nr_pci,
          arfcn: row.nr_arfcn ?? null,
          station_lte_tac: row.station_pk ? stationLteTacMap.get(row.station_pk) : undefined,
          rat: "NR",
          nr_band_pcis,
        },
        format,
        convertOptions,
      );
      if (line) clfLines.push(line);
    }

    clfLines.sort();

    await mkdir(CLF_TMP_DIR, { recursive: true });
    const tmpPath = join(CLF_TMP_DIR, `${randomUUID()}.txt`);
    await writeFile(tmpPath, clfLines.join("\n") + "\n");

    workerPort.postMessage({ success: true, tmpPath });
  } catch (e) {
    workerPort.postMessage({ success: false, error: serializeWorkerError(e) });
  }
});
