import { describe, expect, it } from "vitest";

import { currentMonth } from "../../../../../src/features/stats/leaderboards.js";
import route from "../../../../../src/routes/v2/(get)/measurements/summary.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { injectMutation } from "../../../../helpers/mutationAssertions.js";

const firstUploadAt = new Date("2026-10-01T08:00:00Z");
const lastUploadAt = new Date("2026-10-24T18:30:00Z");

describe("GET /measurements/summary", () => {
  it("adds up the kept samples, new squares and discoveries of the uploads that count, and the samples per country", async () => {
    dbMock.enqueueFor("select", "upload_folds", [{ uploads: 2, samples: 1000, firstUploadAt, lastUploadAt }]);
    dbMock.enqueueFor("select", "upload_drops", [{ samples: 40 }]);
    dbMock.enqueueFor("select", "observed_cells", [{ cells: 3 }]);
    dbMock.enqueueFor("select", "observed_cells", [
      { uploadId: "019a1b2c-0000-7000-8000-000000000001", count: 1 },
      { uploadId: "019a1b2c-0000-7000-8000-000000000002", count: 2 },
    ]);
    dbMock.enqueueFor("select", "upload_new_squares", [
      { countryCode: "PL", newSquares: 12 },
      { countryCode: "DE", newSquares: 1 },
    ]);
    dbMock.enqueueFor("select", "contributor_months", [
      { countryCode: "PL", samples: 900 },
      { countryCode: "CZ", samples: 0 },
    ]);
    dbMock.enqueueFor("select", "countries", []);
    const response = await injectMutation(route, { method: "GET", url: "/measurements/summary" }, { session: userSession() });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual({
      uploads: 2,
      samples: 960,
      newSquares: 13,
      discoveries: { cells: 3, sites: 3 },
      firstUploadAt: firstUploadAt.toISOString(),
      lastUploadAt: lastUploadAt.toISOString(),
      countries: [
        { countryCode: "PL", samples: 900, newSquares: 12 },
        { countryCode: "DE", samples: 0, newSquares: 1 },
      ],
      ranks: [],
    });
  });

  it("answers your places on the leaderboards, all time first, in each country you are on", async () => {
    const totals = ["upload_folds", "upload_drops", "observed_cells", "observed_cells", "upload_new_squares", "contributor_months"];
    for (const table of totals) dbMock.enqueueFor("select", table, []);
    dbMock.enqueueFor("select", "countries", [{ code: "CZ" }, { code: "PL" }]);
    dbMock.enqueueFor("select", undefined, [{ countryCode: "PL", rank: 4 }]);
    dbMock.enqueueFor("select", undefined, [
      { countryCode: "PL", rank: 1 },
      { countryCode: "CZ", rank: 2 },
    ]);
    const response = await injectMutation(route, { method: "GET", url: "/measurements/summary" }, { session: userSession() });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.ranks).toEqual([
      { countryCode: "CZ", startsOn: currentMonth(), rank: 2 },
      { countryCode: "PL", startsOn: null, rank: 4 },
      { countryCode: "PL", startsOn: currentMonth(), rank: 1 },
    ]);
  });
});
