import { describe, expect, it } from "vitest";

import { checkCellDuplicatesBatch } from "../../../src/features/cells/duplicateCheck.js";
import { dbMock, queryOf } from "../../helpers/boundaries.js";

const lteCell = { rat: "LTE", details: { enbid: 501234, clid: 1 } };

function lteCheck() {
  const call = dbMock.calls.find((recorded) => recorded.table === "lte_cells");
  return queryOf(call?.clauses.where?.[0]);
}

describe("checkCellDuplicatesBatch", () => {
  it("compares identities under the owner's main code and the cell's extra codes", async () => {
    dbMock.enqueueNetworks([{ ownerCode: "23415" }]);
    dbMock.enqueueFor("select", "lte_cells", []);

    await checkCellDuplicatesBatch([{ ...lteCell, extraCodes: ["23420"] }], 1);

    const { sql, params } = lteCheck();
    expect(sql).toContain('"plmns"."role" = $');
    expect(sql).toContain('"cell_plmns"');
    expect(sql).not.toContain('"stations"."operator_id" = $');
    expect(params).toEqual(expect.arrayContaining(["primary", "23415", "23420", 501234, 1]));
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("keeps comparing by operator when the owner has no main code", async () => {
    dbMock.enqueueFor("select", "lte_cells", []);

    await checkCellDuplicatesBatch([lteCell], 7);

    const { sql, params } = lteCheck();
    expect(sql).toContain('"stations"."operator_id" = $');
    expect(sql).not.toContain('"cell_plmns"');
    expect(params).toContain(7);
  });
});
