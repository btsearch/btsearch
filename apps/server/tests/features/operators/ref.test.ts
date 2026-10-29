import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { loadOperatorRefs } from "../../../src/features/operators/ref.js";
import { dbMock } from "../../helpers/boundaries.js";
import { operatorRow, primaryPlmn } from "../../helpers/operatorFixtures.js";

type Reader = Parameters<typeof loadOperatorRefs>[1];

function membership(operatorId: number, relatedOperatorId: number) {
  return { operatorId, kind: "jv_member", relatedOperatorId };
}

function selects(table: string) {
  return dbMock.calls.filter((call) => call.operation === "select" && call.table === table);
}

describe("loadOperatorRefs", () => {
  it("gives each member the primary PLMN of its shared network", async () => {
    dbMock.enqueueFor("select", "operators", [operatorRow(1, 26001), operatorRow(2, 26002), operatorRow(3, 26003)], [operatorRow(5, 26034)]);
    dbMock.enqueueFor("select", "plmns", [primaryPlmn(1, "26001"), primaryPlmn(2, "26002"), primaryPlmn(3, "26003")], [primaryPlmn(5, "26034")]);
    dbMock.enqueueFor("select", "operator_links", [membership(2, 5), membership(3, 5)]);

    expect(await loadOperatorRefs([1, 2, 3])).toEqual(
      new Map([
        [1, { id: 1, countryCode: "PL", primaryPlmn: "26001", sharedNetworkPlmns: [] }],
        [2, { id: 2, countryCode: "PL", primaryPlmn: "26002", sharedNetworkPlmns: ["26034"] }],
        [3, { id: 3, countryCode: "PL", primaryPlmn: "26003", sharedNetworkPlmns: ["26034"] }],
      ]),
    );
    expect(dbMock.calls).toHaveLength(5);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("looks up the shared networks through the members' links instead of waiting for them", async () => {
    dbMock.enqueueFor("select", "operators", [operatorRow(2, 26002)], []);
    dbMock.enqueueFor("select", "plmns", [primaryPlmn(2, "26002")], []);
    dbMock.enqueueFor("select", "operator_links", []);

    await loadOperatorRefs([2]);

    expect(new PgDialect().sqlToQuery(selects("operators")[1]?.clauses.where?.[0] as SQL).params).toEqual([2, "jv_member"]);
    expect(selects("plmns")).toHaveLength(2);
  });

  it("takes the primary PLMN from the operator's primary row, then from its legacy network code, and never from a secondary row", async () => {
    dbMock.enqueueFor("select", "operators", [operatorRow(1, 26001), operatorRow(2, 26002), operatorRow(3, null)], [operatorRow(5, 26034)]);
    dbMock.enqueueFor("select", "plmns", [primaryPlmn(2, "310260"), { ...primaryPlmn(3, "26003"), role: "secondary" }], []);
    dbMock.enqueueFor("select", "operator_links", [membership(1, 5)]);

    const refs = await loadOperatorRefs([1, 2, 3]);

    expect(refs.get(1)?.primaryPlmn).toBe("26001");
    expect(refs.get(1)?.sharedNetworkPlmns).toEqual(["26034"]);
    expect(refs.get(2)?.primaryPlmn).toBe("310260");
    expect(refs.get(3)?.primaryPlmn).toBeNull();
  });

  it("leaves out a shared network that has no primary PLMN and an operator that does not exist", async () => {
    dbMock.enqueueFor("select", "operators", [operatorRow(2, 26002)], [operatorRow(5, 26034), operatorRow(9, null)]);
    dbMock.enqueueFor("select", "plmns", [primaryPlmn(2, "26002")], [primaryPlmn(5, "26034")]);
    dbMock.enqueueFor("select", "operator_links", [membership(2, 5), membership(2, 9)]);

    expect(await loadOperatorRefs([2, 404])).toEqual(
      new Map([[2, { id: 2, countryCode: "PL", primaryPlmn: "26002", sharedNetworkPlmns: ["26034"] }]]),
    );
  });

  it("avoids a query for an empty operator list", async () => {
    expect(await loadOperatorRefs([])).toEqual(new Map());
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("reads through the reader it is given", async () => {
    const select = vi.fn((selection?: unknown) => dbMock.select(selection));
    dbMock.enqueueFor("select", "operators", [operatorRow(1, 26001)], []);
    dbMock.enqueueFor("select", "plmns", [], []);
    dbMock.enqueueFor("select", "operator_links", []);

    await loadOperatorRefs([1], { select } as unknown as Reader);

    expect(select).toHaveBeenCalledTimes(5);
    expect(dbMock.calls).toHaveLength(5);
  });
});
