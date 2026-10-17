import { officialLocations } from "@openbts/drizzle";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { bboxCondition } from "../../../src/features/stations/read.js";

const dialect = new PgDialect();

describe("bboxCondition", () => {
  it("tests the point it is given", () => {
    expect(dialect.sqlToQuery(bboxCondition(officialLocations.point, [14, 49, 24, 55]))).toEqual({
      sql: 'ST_Intersects("official"."locations"."point", ST_MakeEnvelope($1, $2, $3, $4, 4326))',
      params: [14, 49, 24, 55],
    });
  });
});
