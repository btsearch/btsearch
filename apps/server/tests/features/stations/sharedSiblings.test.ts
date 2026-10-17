import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { findSharedSiblingIds } from "../../../src/features/stations/sharedSiblings.js";
import { dbMock, queryOf } from "../../helpers/boundaries.js";
import { operatorRow, primaryPlmn } from "../../helpers/operatorFixtures.js";

type Reader = Parameters<typeof findSharedSiblingIds>[2];

const dialect = new PgDialect();
const station = { id: 12, locationId: 2, operatorId: 8 };
const sharedNetworkId = 5;

function scriptSiblings(siblingIds: number[]) {
  dbMock.enqueueFor(
    "select",
    "stations",
    siblingIds.map((id) => ({ id })),
  );
}

function scriptStation(enbids: number[], countryCode: string | null = "PL") {
  dbMock.enqueueFor("select", "stations", [{ locationCountry: countryCode, operatorCountry: countryCode }]);
  dbMock.enqueueFor(
    "select",
    "lte_cells",
    enbids.map((enbid) => ({ enbid })),
  );
  dbMock.enqueueFor("select", "operators", [operatorRow(8, 26002)], [operatorRow(sharedNetworkId, 26034)]);
  dbMock.enqueueFor("select", "plmns", [primaryPlmn(8, "26002")], [primaryPlmn(sharedNetworkId, "26034")]);
  dbMock.enqueueFor("select", "operator_links", [{ operatorId: 8, kind: "jv_member", relatedOperatorId: sharedNetworkId }]);
}

function scriptSameEnbSiblings(siblingIds: number[]) {
  dbMock.enqueueFor(
    "select",
    "lte_cells",
    siblingIds.map((stationId) => ({ stationId })),
  );
}

function selects(table: string) {
  return dbMock.calls.filter((call) => call.operation === "select" && call.table === table);
}

function whereParams(table: string, index = 0): unknown[] {
  return dialect.sqlToQuery(selects(table)[index]?.clauses.where?.[0] as SQL).params;
}

describe("findSharedSiblingIds", () => {
  it.each([
    { ...station, locationId: null },
    { ...station, operatorId: null },
  ])("has no siblings without a location or an operator: %j", async (unplaced) => {
    expect(await findSharedSiblingIds(unplaced, { sameEnb: true })).toEqual([]);
    expect(dbMock.calls).toEqual([]);
  });

  it("asks for the other members' stations at the location, published ones first and then by id", async () => {
    scriptSiblings([14, 13]);

    expect(await findSharedSiblingIds(station)).toEqual([14, 13]);
    expect(dbMock.calls).toHaveLength(1);

    const [call] = selects("stations");
    const where = dialect.sqlToQuery(call?.clauses.where?.[0] as SQL);
    expect(where.params).toEqual([2, 8, 8, "jv_member", "jv_member"]);
    expect(where.sql).toContain('"stations"."operator_id" <> $2');
    expect(call?.clauses.orderBy?.map((order) => queryOf(order).sql)).toEqual([`"stations"."status" = 'published' desc`, '"stations"."id" asc']);
  });

  it("keeps the siblings that have an LTE cell with an equivalent eNBID under the country's rule", async () => {
    scriptSiblings([13, 14, 15]);
    scriptStation([412345, 412345, 37]);
    scriptSameEnbSiblings([15, 13]);

    expect(await findSharedSiblingIds(station, { sameEnb: true })).toEqual([13, 15]);
    expect(whereParams("lte_cells")).toEqual([12, 0]);
    expect(whereParams("lte_cells", 1)).toEqual([
      13, 14, 15, 112345, 212345, 312345, 412345, 512345, 612345, 712345, 812345, 912345, 17, 27, 37, 47, 57, 67, 77, 87, 97,
    ]);
  });

  it.each(["DE", null])("compares eNBIDs as they are in a country without a rule of its own: %s", async (countryCode) => {
    scriptSiblings([13, 14]);
    scriptStation([412345], countryCode);
    scriptSameEnbSiblings([14]);

    expect(await findSharedSiblingIds(station, { sameEnb: true })).toEqual([14]);
    expect(whereParams("lte_cells", 1)).toEqual([13, 14, 412345]);
  });

  it("has no siblings under the eNBID rule when the station has no LTE cell", async () => {
    scriptSiblings([13]);
    scriptStation([]);

    expect(await findSharedSiblingIds(station, { sameEnb: true })).toEqual([]);
    expect(selects("lte_cells")).toHaveLength(1);
  });

  it("reads through the reader it is given", async () => {
    const select = vi.fn((selection?: unknown) => dbMock.select(selection));
    scriptSiblings([13]);
    scriptStation([412345]);
    scriptSameEnbSiblings([13]);

    expect(await findSharedSiblingIds(station, { sameEnb: true }, { select } as unknown as Reader)).toEqual([13]);
    expect(select).toHaveBeenCalledTimes(dbMock.calls.length);
  });
});
