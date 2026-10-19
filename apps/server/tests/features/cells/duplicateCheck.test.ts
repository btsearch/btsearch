import { describe, expect, it } from "vitest";

import db from "../../../src/database/psql.js";
import {
  checkCellDuplicatesBatch,
  checkOwnerCellDuplicates,
  findCodeIdentityCollisions,
  lockAndCheckStoredCells,
  lockCellIdentities,
} from "../../../src/features/cells/duplicateCheck.js";
import type { DbTx } from "../../../src/types/global.js";
import { dbMock, queryOf } from "../../helpers/boundaries.js";

const lteCell = { rat: "LTE", details: { enbid: 501234, clid: 1 } };
const owner = { operatorId: 7, mainCode: "26002", countryCode: "PL" };
const tx = dbMock as unknown as DbTx;

function identityCheck(table: string) {
  const call = dbMock.calls.find((recorded) => recorded.table === table);
  return queryOf(call?.clauses.where?.[0]);
}

function lockStatement() {
  const call = dbMock.calls.find((recorded) => recorded.operation === "execute");
  return queryOf(call?.clauses.statement?.[0]);
}

describe("checkCellDuplicatesBatch", () => {
  it("compares identities under the owner's main code and the cell's extra codes", async () => {
    dbMock.enqueueNetworks([{ ownerCode: "23415" }]);
    dbMock.enqueueFor("select", "lte_cells", []);

    await checkCellDuplicatesBatch(db, [{ ...lteCell, extraCodes: ["23420"] }], 1);

    const { sql, params } = identityCheck("lte_cells");
    expect(sql).toContain('"plmns"."role" = $');
    expect(sql).toContain('"cell_plmns"');
    expect(sql).not.toContain('"stations"."operator_id" = $');
    expect(params).toEqual(expect.arrayContaining(["primary", "23415", "23420", 501234, 1]));
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("keeps comparing by operator when the owner has no main code", async () => {
    dbMock.enqueueFor("select", "lte_cells", []);

    await checkCellDuplicatesBatch(db, [lteCell], 7);

    const { sql, params } = identityCheck("lte_cells");
    expect(sql).toContain('"stations"."operator_id" = $');
    expect(sql).not.toContain('"cell_plmns"');
    expect(params).toContain(7);
  });
});

describe("checkOwnerCellDuplicates", () => {
  it.each([
    ["GSM", "gsm_cells", { lac: 10, cid: 20 }],
    ["UMTS", "umts_cells", { rnc: 10, cid: 20 }],
    ["LTE", "lte_cells", { enbid: 10, clid: 20 }],
  ])("compares a %s identity with active stations only", async (rat, table, details) => {
    dbMock.enqueueFor("select", table, []);

    await checkOwnerCellDuplicates(db, [{ rat, details }], owner);

    const { sql, params } = identityCheck(table);
    expect(sql).toContain('"stations"."status" = $');
    expect(params).toContain("published");
  });

  it.each([
    [{ gnbid: 100, clid: 2 }, 409602n],
    [{ gnbid: 100, clid: 2, gnbid_length: 28 }, 25602n],
  ])("keys an NR cell by its NCI: %o", async (details, nci) => {
    dbMock.enqueueFor("select", "nr_cells", []);

    await checkOwnerCellDuplicates(db, [{ rat: "NR", details }], owner);

    const { sql, params } = identityCheck("nr_cells");
    expect(sql).toContain('"nr_cells"."nci" = $');
    expect(params).toContain(nci);
    expect(params).toContain("published");
  });

  it("names the NCI an NR cell collides with", async () => {
    dbMock.enqueueFor("select", "nr_cells", [{ nci: 409602n }]);

    await expect(checkOwnerCellDuplicates(db, [{ rat: "NR", details: { gnbid: 100, clid: 2 } }], owner)).rejects.toMatchObject({
      code: "DUPLICATE_ENTRY",
      message: "An NR cell with NCI 409602 already exists on one of the cell's networks",
    });
  });

  it.each([
    ["NR", { gnbid: 0, clid: 2 }],
    ["NR", { gnbid: null, clid: 2 }],
    ["NR", { gnbid: 100, clid: 2, gnbid_length: null }],
    ["LTE", { enbid: 0, clid: 0 }],
    ["UMTS", { rnc: 0, cid: 0 }],
  ])("skips an unknown %s identity %o", async (rat, details) => {
    await checkOwnerCellDuplicates(db, [{ rat, details }], owner);

    expect(dbMock.calls.filter((call) => call.operation === "select")).toEqual([]);
  });

  it("compares a cell with another network's cells only through the codes they share", async () => {
    dbMock.enqueueFor("select", "lte_cells", []);

    await checkOwnerCellDuplicates(db, [{ ...lteCell, extraCodes: ["26003"] }], owner);

    const { params } = identityCheck("lte_cells");
    expect(params).toEqual(expect.arrayContaining(["26002", "26003"]));
    expect(params).not.toContain(7);
  });
});

describe("lockCellIdentities", () => {
  it("takes one transaction lock per identity, whatever the network, in a fixed order", async () => {
    dbMock.enqueueFor("execute", undefined, []);

    await lockCellIdentities(tx, [
      { ...lteCell, extraCodes: ["26003"] },
      lteCell,
      { rat: "GSM", details: { lac: 1, cid: 2 } },
      { rat: "NR", details: { gnbid: 100, clid: 2 } },
      { rat: "NR", details: { gnbid: 0, clid: 2 } },
    ]);

    const { sql, params } = lockStatement();
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("ORDER BY hash");
    expect(params).toEqual([1, "LTE:501234:1", "GSM:1:2", "NR:409602"]);
  });

  it("takes no lock when no identity is known", async () => {
    await lockCellIdentities(tx, [{ rat: "LTE", details: { enbid: 0, clid: 0 } }]);

    expect(dbMock.calls).toEqual([]);
  });
});

describe("lockAndCheckStoredCells", () => {
  const storedLte = (id: number, status: string, extraCodes: string[] = []) => ({
    id,
    rat: "LTE",
    gsm: null,
    umts: null,
    lte: { enbid: 501234, clid: id },
    nr: null,
    plmns: extraCodes.map((code) => ({ plmn: { code } })),
    station: { operator_id: 7, status, operator: { id: 7, plmns: [{ code: "26002" }] } },
  });

  it("locks and checks the stored identities of cells on active stations in one read", async () => {
    dbMock.query.cells.findMany.mockResolvedValueOnce([storedLte(11, "published", ["26034"]), storedLte(12, "inactive")]);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("select", "lte_cells", []);

    await lockAndCheckStoredCells(tx, { cellIds: [11, 12], stationId: null });

    expect(dbMock.calls.map(({ operation, table }) => `${operation} ${table ?? ""}`)).toEqual(["execute ", "select lte_cells"]);
    expect(lockStatement().params).toEqual([1, "LTE:501234:11"]);
    const { sql, params } = identityCheck("lte_cells");
    expect(sql).toContain('"lte_cells"."cell_id" <> $');
    expect(params).toEqual(expect.arrayContaining([501234, 11, "26002", "26034", "published"]));
    expect(params).not.toContain(12);
  });

  it("checks every cell of a station when the station is in scope", async () => {
    dbMock.query.cells.findMany.mockResolvedValueOnce([]);

    await lockAndCheckStoredCells(tx, { cellIds: [], stationId: 4 });

    expect(dbMock.query.cells.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { OR: [{ id: { in: [] } }, { station_id: 4 }] } });
    expect(dbMock.calls).toEqual([]);
  });

  it("checks nothing when only inactive stations hold the cells", async () => {
    dbMock.query.cells.findMany.mockResolvedValueOnce([storedLte(12, "inactive")]);

    await lockAndCheckStoredCells(tx, { cellIds: [12], stationId: null });

    expect(dbMock.calls).toEqual([]);
  });

  it("refuses a stored identity that an active station on a shared network already has", async () => {
    dbMock.query.cells.findMany.mockResolvedValueOnce([storedLte(11, "published")]);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("select", "lte_cells", [{ enbid: 501234, clid: 11 }]);

    await expect(lockAndCheckStoredCells(tx, { cellIds: [11], stationId: null })).rejects.toMatchObject({ code: "DUPLICATE_ENTRY" });
  });
});

describe("findCodeIdentityCollisions", () => {
  it("names the first collisions between the operator's cells and other stations' cells broadcasting the code", async () => {
    dbMock.enqueueFor("select", "gsm_cells", []);
    dbMock.enqueueFor("select", "umts_cells", []);
    dbMock.enqueueFor("select", "lte_cells", [{ identity: "LTE eNBID 100 CLID 1", cellId: 11, otherCellId: 21 }]);
    dbMock.enqueueFor("select", "nr_cells", [{ identity: "NR NCI 409602", cellId: 12, otherCellId: 22 }]);

    expect(await findCodeIdentityCollisions(db, 7, "26201")).toEqual(["LTE eNBID 100 CLID 1 (cells 11 and 21)", "NR NCI 409602 (cells 12 and 22)"]);
    const { sql, params } = identityCheck("lte_cells");
    expect(sql).toContain('"other_stations"."status" = $');
    expect(sql).toContain("IS DISTINCT FROM");
    expect(params).toEqual(expect.arrayContaining([7, "published", "26201"]));
  });
});
