import { gsmCells } from "@openbts/drizzle";
import { getTableName } from "drizzle-orm";

import { dbMock } from "./boundaries.js";
import { cellBands, cellInputs, storedCell } from "./cellWriteFixtures.js";
import { stationRow } from "./stationFixtures.js";

export function prepareCellMove(options: { destinationId?: number; missing?: boolean; hidden?: boolean; duplicate?: boolean } = {}) {
  const destinationId = options.destinationId ?? 2;
  const previous = storedCell({ ...cellInputs.gsm, sectorId: 5 });
  const source = stationRow({ operator_id: null, location: null, sectors: [{ id: 5, azimuth: 0 }] });
  const destination = stationRow({ id: destinationId, operator_id: options.duplicate ? 7 : null, status: "pending", location: null, sectors: [] });
  const moves = destinationId !== 1;
  dbMock.enqueueFor("select", "cells", [previous], [previous]);
  dbMock.enqueueFor("select", "stations", [{ station: source, countryCode: null }]);
  if (moves) dbMock.enqueueFor("select", "stations", options.missing ? [] : [{ station: destination, countryCode: options.hidden ? "PL" : null }]);
  if (options.hidden) {
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
  }
  dbMock.enqueueFor("select", "stations", [{ locationCountry: null, operatorCountry: null }]);
  dbMock.enqueueFor("select", "bands", cellBands);
  dbMock.query.stations.findFirst.mockImplementation(async (options) =>
    (options as { where: { id: number } }).where.id === 1 ? source : destination,
  );
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
  dbMock.query.stationUplinks.findFirst.mockResolvedValue(undefined);
  if (options.duplicate) dbMock.enqueueFor("select", getTableName(gsmCells), [{ lac: 1, cid: 2 }]);
  const next = {
    ...previous,
    cell: { ...previous.cell, station_id: destinationId, sector_id: moves ? null : 5 },
    station: moves ? destination : source,
  };
  const snapshot = (row: typeof previous) => ({ ...row.cell, gsm: row.gsm, umts: row.umts, lte: row.lte, nr: row.nr });
  dbMock.query.cells.findMany
    .mockResolvedValueOnce([snapshot(previous)])
    .mockResolvedValueOnce([snapshot(previous)])
    .mockResolvedValue([snapshot(next)]);
  return { previous, next, source, destination, moves };
}

export function writeCellMove(fixture: ReturnType<typeof prepareCellMove>) {
  const { next, source, destination, moves } = fixture;
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "station_photo_selections", [], []);
  dbMock.enqueueFor("update", "cells", []);
  dbMock.enqueueFor("update", getTableName(gsmCells), [next.radio]);
  if (moves) {
    dbMock.enqueueFor("update", "stations", [], [{ ...source, status: "pending" }], [{ ...destination, status: "published" }]);
    dbMock.enqueueFor("select", "cells", [{ total: 0 }], [{ total: 1 }]);
    dbMock.enqueueFor("insert", "audit_logs", [], []);
  } else dbMock.enqueueFor("update", "stations", []);
  dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("select", "cells", [{ bandId: 1, rat: "GSM", bandRat: "GSM", countryCode: null, plannedBandId: null }], [next]);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  dbMock.enqueueFor("select", "station_watches", []);
  dbMock.enqueueFor("select", "user_lists", []);
  dbMock.enqueueFor("select", "stations", []);
  dbMock.enqueueFor("select", "bands", cellBands);
}
