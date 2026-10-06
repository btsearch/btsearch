import {
  bands,
  cells,
  gsmCells,
  locations,
  lteCells,
  nrCells,
  operators,
  regions,
  stationSectors,
  stationUplinks,
  stations,
  structureOwners,
  umtsCells,
} from "@openbts/drizzle";
import { type SQL, and, eq, inArray } from "drizzle-orm";

import db from "../../database/psql.js";
import type { StoredStructureType } from "../structures/serialize.js";
import { type BandDuplex, type ClfFormat, type ConvertOptions, type NRBandPCIs, convertToCLF } from "./converter.js";

export type ExportSelection = {
  stationConditions: SQL[];
  cellConditions: SQL[];
  lteConditions: SQL[];
  nrConditions: SQL[];
  rats: { gsm: boolean; umts: boolean; lte: boolean; nr: boolean };
};

type CommonCellRow = {
  cell_type: string | null;
  notes: string | null;
  station_sid: string;
  extra_address: string | null;
  uplink_type: string | null;
  sector_id: number | null;
  operator_mnc: number | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  address: string | null;
  region_code: string | null;
  country_code: string | null;
  structure_type: StoredStructureType | null;
  structure_owner: string | null;
  structure_note: string | null;
  band_value: number | null;
  band_name: string | null;
  band_duplex: BandDuplex;
  is_confirmed: boolean | null;
};
type SectorMeta = { index: number; azimuth: number };

function buildCommonCellFields(row: CommonCellRow, sectorMeta: SectorMeta | undefined) {
  return {
    band_value: row.band_value,
    band_name: row.band_name as string,
    band_duplex: row.band_duplex ?? null,
    station_id: row.station_sid,
    operator_mnc: row.operator_mnc,
    latitude: row.latitude,
    longitude: row.longitude,
    cell_type: row.cell_type,
    uplink_type: row.uplink_type,
    notes: row.notes,
    city: row.city ?? null,
    address: row.extra_address ?? row.address ?? null,
    region_code: row.region_code ?? null,
    country_code: row.country_code ?? null,
    structure_type: row.structure_type ?? null,
    structure_owner: row.structure_owner ?? null,
    structure_note: row.structure_note ?? null,
    is_confirmed: row.is_confirmed,
    sector_index: sectorMeta?.index,
    sector_azimuth: sectorMeta?.azimuth,
  };
}

export async function loadExportLines(selection: ExportSelection, format: ClfFormat, convertOptions: ConvertOptions): Promise<string[]> {
  const { stationConditions, rats } = selection;
  const displayNRSeparately = convertOptions.displayNRSeparately === true;
  const baseConditions = [...stationConditions, ...selection.cellConditions];
  const lteConditions = [...baseConditions, ...selection.lteConditions];
  const nrConditions = [...baseConditions, ...selection.nrConditions];

  const commonSelect = {
    cell_type: cells.type,
    notes: cells.notes,
    station_pk: stations.id,
    station_sid: stations.station_id,
    extra_address: stations.extra_address,
    uplink_type: stationUplinks.type,
    sector_id: cells.sector_id,
    operator_mnc: operators.mnc,
    latitude: locations.latitude,
    longitude: locations.longitude,
    city: locations.city,
    address: locations.address,
    region_code: regions.code,
    country_code: regions.countryCode,
    structure_type: locations.structure_type,
    structure_owner: structureOwners.name,
    structure_note: locations.structure_note,
    band_value: bands.value,
    band_name: bands.name,
    band_duplex: bands.duplex,
    is_confirmed: cells.is_confirmed,
  };

  const gsmQuery = rats.gsm
    ? db
        .select({ ...commonSelect, gsm_lac: gsmCells.lac, gsm_cid: gsmCells.cid, gsm_e_gsm: gsmCells.e_gsm })
        .from(cells)
        .innerJoin(gsmCells, eq(gsmCells.cell_id, cells.id))
        .innerJoin(stations, eq(cells.station_id, stations.id))
        .innerJoin(bands, and(eq(cells.band_id, bands.id), eq(bands.variant, "commercial")))
        .leftJoin(operators, eq(stations.operator_id, operators.id))
        .leftJoin(locations, eq(stations.location_id, locations.id))
        .leftJoin(regions, eq(locations.region_id, regions.id))
        .leftJoin(structureOwners, eq(locations.structure_owner_id, structureOwners.id))
        .leftJoin(stationUplinks, eq(stationUplinks.station_id, stations.id))
        .where(and(...baseConditions))
    : null;

  const umtsQuery = rats.umts
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
        .leftJoin(structureOwners, eq(locations.structure_owner_id, structureOwners.id))
        .leftJoin(stationUplinks, eq(stationUplinks.station_id, stations.id))
        .where(and(...baseConditions))
    : null;

  const lteQuery = rats.lte
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
        .leftJoin(structureOwners, eq(locations.structure_owner_id, structureOwners.id))
        .leftJoin(stationUplinks, eq(stationUplinks.station_id, stations.id))
        .where(and(...lteConditions))
    : null;

  const nrQuery = rats.nr
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
        .leftJoin(structureOwners, eq(locations.structure_owner_id, structureOwners.id))
        .leftJoin(stationUplinks, eq(stationUplinks.station_id, stations.id))
        .where(and(...nrConditions))
    : null;

  const nrBandsQuery =
    rats.lte || rats.nr
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

  const sectorMetaById = new Map<number, SectorMeta>();
  const sectorIndexByStationId = new Map<number, number>();
  for (const sector of stationSectorRows) {
    const index = (sectorIndexByStationId.get(sector.station_id) ?? 0) + 1;
    sectorIndexByStationId.set(sector.station_id, index);
    sectorMetaById.set(sector.id, { index, azimuth: sector.azimuth });
  }

  const stationNrNonStandaloneBandPciMap = new Map<number, Map<string, NRBandPCIs>>();
  const stationNRBandPciMap = new Map<string, Map<string, NRBandPCIs>>();
  for (const row of nrBandRows) {
    if (!row.band_value) continue;
    const key = `${row.band_value}:${row.band_duplex ?? "null"}`;

    if (row.nr_type === "nsa") {
      const nrNonStandaloneBandMap = stationNrNonStandaloneBandPciMap.get(row.station_id) ?? new Map();
      const nrNonStandaloneEntry = nrNonStandaloneBandMap.get(key) ?? {
        value: row.band_value,
        duplex: row.band_duplex ?? null,
        pcis: [],
        has_missing_pci: false,
      };
      if (row.nr_pci !== null && row.nr_pci !== undefined) nrNonStandaloneEntry.pcis.push({ value: row.nr_pci, is_confirmed: row.is_confirmed });
      if (row.nr_pci === null || row.nr_pci === undefined) nrNonStandaloneEntry.has_missing_pci = true;
      nrNonStandaloneBandMap.set(key, nrNonStandaloneEntry);
      stationNrNonStandaloneBandPciMap.set(row.station_id, nrNonStandaloneBandMap);
    }

    const stationNRKey = `${row.station_id}:${row.nr_type ?? ""}`;
    const nrBandMap = stationNRBandPciMap.get(stationNRKey) ?? new Map();
    const nrEntry = nrBandMap.get(key) ?? { value: row.band_value, duplex: row.band_duplex ?? null, pcis: [], has_missing_pci: false };
    if (row.nr_pci !== null && row.nr_pci !== undefined) nrEntry.pcis.push({ value: row.nr_pci, is_confirmed: row.is_confirmed });
    if (row.nr_pci === null || row.nr_pci === undefined) nrEntry.has_missing_pci = true;
    nrBandMap.set(key, nrEntry);
    stationNRBandPciMap.set(stationNRKey, nrBandMap);
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
        nr_band_pcis: row.station_pk ? [...(stationNrNonStandaloneBandPciMap.get(row.station_pk)?.values() ?? [])] : undefined,
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

  return clfLines;
}
