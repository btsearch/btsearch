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
import { and, eq, inArray } from "drizzle-orm";

import db from "../../database/psql.js";
import type { ClfFormat, ConvertOptions } from "./converter.js";
import { type ExportSelection, type StationExportMetadata, loadExportLines, renderExportLines } from "./lines.js";

function hydrateRows<T extends { station_pk: number }>(
  rows: T[],
  stationMetadata: ReadonlyMap<number, StationExportMetadata>,
): (T & StationExportMetadata)[] {
  return rows.map((row) => {
    const station = stationMetadata.get(row.station_pk);
    if (!station) throw new Error("Missing station metadata for cell export");
    return { ...row, ...station };
  });
}

export async function loadNativeExportLines(
  selection: ExportSelection,
  stationIds: readonly number[],
  format: ClfFormat,
  convertOptions: ConvertOptions,
): Promise<string[]> {
  if (stationIds.length === 0) return [];
  if (format === "ntm" && convertOptions.displayNRSeparately === true) return loadExportLines(selection, format, convertOptions);

  const { stationConditions, rats } = selection;
  const baseConditions = [...stationConditions, ...selection.cellConditions];
  const commonSelect = {
    cell_type: cells.type,
    notes: cells.notes,
    station_pk: cells.station_id,
    sector_id: cells.sector_id,
    band_value: bands.value,
    band_name: bands.name,
    band_duplex: bands.duplex,
    is_confirmed: cells.is_confirmed,
  };
  const stationMetadataQuery = db
    .select({
      station_pk: stations.id,
      station_sid: stations.station_id,
      extra_address: stations.extra_address,
      uplink_type: stationUplinks.type,
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
    })
    .from(stations)
    .leftJoin(operators, eq(stations.operator_id, operators.id))
    .leftJoin(locations, eq(stations.location_id, locations.id))
    .leftJoin(regions, eq(locations.region_id, regions.id))
    .leftJoin(structureOwners, eq(locations.structure_owner_id, structureOwners.id))
    .leftJoin(stationUplinks, eq(stationUplinks.station_id, stations.id))
    .where(inArray(stations.id, [...stationIds]));
  const gsmQuery = rats.gsm
    ? db
        .select({ ...commonSelect, gsm_lac: gsmCells.lac, gsm_cid: gsmCells.cid, gsm_e_gsm: gsmCells.e_gsm })
        .from(cells)
        .innerJoin(gsmCells, eq(gsmCells.cell_id, cells.id))
        .innerJoin(stations, eq(cells.station_id, stations.id))
        .innerJoin(bands, and(eq(cells.band_id, bands.id), eq(bands.variant, "commercial")))
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
        .where(and(...baseConditions, ...selection.lteConditions))
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
        .where(and(...baseConditions, ...selection.nrConditions))
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
  const [stationRows, gsmRows, umtsRows, lteRows, nrRows, nrBandRows, stationSectorRows] = await Promise.all([
    stationMetadataQuery,
    gsmQuery ?? Promise.resolve([]),
    umtsQuery ?? Promise.resolve([]),
    lteQuery ?? Promise.resolve([]),
    nrQuery ?? Promise.resolve([]),
    nrBandsQuery ?? Promise.resolve([]),
    stationSectorsQuery,
  ]);
  const stationMetadata = new Map(stationRows.map((row) => [row.station_pk, row]));
  return renderExportLines(
    {
      gsmRows: hydrateRows(gsmRows, stationMetadata),
      umtsRows: hydrateRows(umtsRows, stationMetadata),
      lteRows: hydrateRows(lteRows, stationMetadata),
      nrRows: hydrateRows(nrRows, stationMetadata),
      nrBandRows,
      stationSectorRows,
    },
    format,
    convertOptions,
  );
}
