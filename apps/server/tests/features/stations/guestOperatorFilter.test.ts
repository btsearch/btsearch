import { and } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { sectorFilterCondition, stationFilterConditions } from "../../../src/features/stations/read.js";
import { queryOf } from "../../helpers/boundaries.js";

function rendered(query: Parameters<typeof stationFilterConditions>[0]) {
  return queryOf(and(...stationFilterConditions(query, null)));
}

describe("operator filter with shared cells", () => {
  it("matches the owner or a station whose cells broadcast a chosen operator's code", () => {
    const { sql } = rendered({ operatorIds: [2] });
    expect(sql).toContain('"stations"."operator_id" in');
    expect(sql).toContain('"stations"."id" in select "cells"."station_id" from "cells" where');
    expect(sql).toContain('"cells"."id" in select "cell_plmns"."cell_id" from "cell_plmns"');
  });

  it("puts the band and technology inside the guest test, so they hold on a shared cell", () => {
    const { sql, params } = rendered({ operatorIds: [2], bandIds: [7], rats: ["lte"] });
    const guestTest = sql.slice(sql.indexOf('"stations"."id" in select "cells"."station_id"'));
    expect(guestTest).toContain('"cells"."band_id" in');
    expect(guestTest).toContain('"cells"."rat" in');
    expect(params).toEqual(expect.arrayContaining([2, 7, "LTE"]));
  });
});

describe("sectors of a station matched as a guest", () => {
  it("keeps only the sectors of the shared cells", () => {
    const condition = sectorFilterCondition({ operatorIds: [2] }, undefined);
    const { sql } = queryOf(condition);
    expect(sql).toContain("CASE WHEN");
    expect(sql).toContain('"sector_owner"');
    expect(sql).toContain('"cell_plmns"');
  });
});
