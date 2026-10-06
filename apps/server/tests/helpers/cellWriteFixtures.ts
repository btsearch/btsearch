import { gsmCells, lteCells, nrCells, umtsCells } from "@openbts/drizzle";
import type { NewCellInput } from "@openbts/shared/contract";
import { getTableName } from "drizzle-orm";

import { dbMock } from "./boundaries.js";
import { readDate } from "./readFixtures.js";
import { stationRow } from "./stationFixtures.js";

export const radioTables = { gsm: gsmCells, umts: umtsCells, lte: lteCells, nr: nrCells };
export const cellInputs: Record<NewCellInput["rat"], NewCellInput> = {
  gsm: { rat: "gsm", bandId: 1, lac: 1, cid: 2 },
  umts: { rat: "umts", bandId: 2, rnc: 1, cid: 2 },
  lte: { rat: "lte", bandId: 3, enbid: 100, clid: 1 },
  nr: { rat: "nr", bandId: 4, mode: "nsa" },
};
export const cellBands = [
  { id: 1, rat: "GSM", value: 900, duplex: "FDD", code: "E-GSM900", name: "GSM 900", variant: "commercial" },
  { id: 2, rat: "UMTS", value: 2100, duplex: "FDD", code: "I", name: "UMTS 2100", variant: "commercial" },
  { id: 3, rat: "LTE", value: 1800, duplex: "FDD", code: "B3", name: "LTE 1800", variant: "commercial" },
  { id: 4, rat: "NR", value: 3500, duplex: "TDD", code: "n78", name: "NR 3500", variant: "commercial" },
];

export function storedCell(input: NewCellInput, id = 11, stationId = 1) {
  const cell = {
    id,
    station_id: stationId,
    band_id: input.bandId,
    sector_id: input.sectorId ?? null,
    type: input.cellType === undefined || input.cellType === null ? null : `${input.cellType.toUpperCase()}CELL`,
    rat: input.rat.toUpperCase(),
    is_confirmed: input.isConfirmed ?? false,
    notes: input.notes ?? null,
    createdAt: readDate,
    updatedAt: readDate,
  };
  const common = { cell_id: id, createdAt: readDate, updatedAt: readDate };
  function createRadioRow() {
    switch (input.rat) {
      case "gsm":
        return { ...common, lac: input.lac, cid: input.cid, e_gsm: input.isEGsm ?? false, bsic: input.bsic ?? null };
      case "umts":
        return {
          ...common,
          lac: input.lac ?? null,
          rnc: input.rnc,
          cid: input.cid,
          cid_long: input.rnc === null || input.cid === null ? null : input.rnc * 65536 + input.cid,
          psc: input.psc ?? null,
          arfcn: input.uarfcn ?? null,
        };
      case "lte":
        return {
          ...common,
          tac: input.tac ?? null,
          enbid: input.enbid,
          clid: input.clid,
          ecid: input.enbid === null || input.clid === null ? null : input.enbid * 256 + input.clid,
          pci: input.pci ?? null,
          earfcn: input.earfcn ?? null,
          supports_iot: input.supportsIot ?? false,
        };
      case "nr":
        return {
          ...common,
          type: input.mode,
          nrtac: input.tac ?? null,
          gnbid: input.gnbid ?? null,
          gnbid_length: null,
          clid: input.clid ?? null,
          nci: null,
          pci: input.pci ?? null,
          arfcn: input.arfcn ?? null,
          supports_nr_redcap: input.supportsRedCap ?? false,
        };
    }
  }
  const radio = createRadioRow();
  const rows = { gsm: null, umts: null, lte: null, nr: null, [input.rat]: radio };
  return { cell, ...rows, station: stationRow({ id: stationId, operator_id: null }), radio };
}

export function prepareCellChange(
  input: NewCellInput[],
  options: {
    stationId?: number;
    status?: string;
    sectors?: { id: number; azimuth: number }[];
    operatorId?: number | null;
    bands?: typeof cellBands;
    countryCode?: string;
  } = {},
) {
  const stationId = options.stationId ?? 1;
  const station = stationRow({
    id: stationId,
    operator_id: options.operatorId ?? null,
    status: options.status ?? "published",
    location: null,
    sectors: options.sectors ?? [],
  });
  dbMock.enqueueFor(
    "select",
    "stations",
    [{ station, countryCode: null }],
    [{ locationCountry: options.countryCode ?? null, operatorCountry: null }],
  );
  dbMock.enqueueFor(
    "select",
    "bands",
    [...new Set(input.map(({ bandId }) => bandId))].map((id) => ({ id })),
    options.bands ?? cellBands,
  );
  if (options.countryCode) dbMock.enqueueFor("select", "country_bands", []);
  dbMock.query.stations.findFirst.mockResolvedValue(station);
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
  dbMock.query.stationUplinks.findFirst.mockResolvedValue(undefined);
  dbMock.enqueueFor("select", "stations", []);
  dbMock.enqueueFor("select", "station_watches", []);
  dbMock.enqueueFor("select", "user_lists", []);
  return station;
}

export function writeCreatedCells(
  input: NewCellInput[],
  options: { stationId?: number; status?: string; failInsertAt?: number; missingSnapshot?: boolean; missingListed?: boolean } = {},
) {
  const stationId = options.stationId ?? 1;
  const rows = input.map((cell, index) => storedCell(cell, 11 + index, stationId));
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "station_photo_selections", [], []);
  for (const [index, row] of rows.entries()) {
    dbMock.enqueueFor("insert", "cells", options.failInsertAt === index ? [] : [row.cell]);
    dbMock.enqueueFor("insert", getTableName(radioTables[input[index]!.rat]), [row.radio]);
  }
  dbMock.enqueueFor("select", "cells", [{ total: rows.length }], [], options.missingListed ? [] : rows);
  dbMock.query.cells.findMany.mockResolvedValue(
    options.missingSnapshot ? [] : rows.map(({ cell, gsm, umts, lte, nr }) => ({ ...cell, gsm, umts, lte, nr })),
  );
  dbMock.enqueueFor("insert", "audit_logs", [], []);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  dbMock.enqueueFor(
    "update",
    "stations",
    options.status === "pending" ? [stationRow({ id: stationId, status: "published", operator_id: null })] : [],
  );
  dbMock.enqueueFor("select", "bands", cellBands);
  return rows;
}
