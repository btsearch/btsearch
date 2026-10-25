import { describe, expect, it } from "vitest";

import { quadkeyOf, tileAt } from "../../../../../src/features/observed/tiles/squares.js";
import { lastMonths } from "../../../../../src/features/stats/observations.js";
import { getRuntimeSettings, mergeRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(get)/statistics/observations.js";
import { dbMock, redisMock } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";

const request = { method: "GET" as const, url: "/statistics/observations?countryCodes=SK,PL" };

describe("GET /statistics/observations", () => {
  it("answers the public countries asked for, sorted, with zeros for one without data and no numbers for a month of two people", async () => {
    const months = lastMonths(new Date());
    redisMock.isReady = false;
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }, { code: "SK" }]);
    dbMock.enqueueFor("select", "plmns", [{ code: "26006", countryCode: "PL" }]);
    dbMock.enqueueFor("select", undefined, [
      { countryCode: "PL", status: "matched", sites: 9 },
      { countryCode: "PL", status: "unmatched", sites: 2 },
    ]);
    dbMock.enqueueFor("select", "observed_cells", [{ countryCode: "PL", cells: 61, lastMeasuredOn: "2026-11-03" }]);
    dbMock.enqueueFor("select", "contributor_months", [
      { countryCode: "PL", month: months[11], samples: 1200, people: 4 },
      { countryCode: "PL", month: months[10], samples: 80, people: 2 },
    ]);
    dbMock.enqueueFor("select", undefined, [{ countryCode: "PL", parent: quadkeyOf(tileAt({ latitude: 52, longitude: 21 }, 12)), squares: 1000 }]);
    const response = await injectMutation(route, request);

    expect(response.statusCode, response.body).toBe(200);
    const [poland, slovakia] = response.json().data;
    expect(poland).toMatchObject({
      countryCode: "PL",
      sites: { unmatched: 2, suggested: 0, matched: 9 },
      observedCells: 61,
      squares: 1000,
      areaSquareKilometers: 0.6,
      lastMeasuredOn: "2026-11-03",
    });
    expect(poland.months.slice(10)).toEqual([
      { startsOn: months[10], samples: null, people: null },
      { startsOn: months[11], samples: 1200, people: 4 },
    ]);
    expect(poland.months[0]).toEqual({ startsOn: months[0], samples: 0, people: 0 });
    expect(slovakia).toMatchObject({ countryCode: "SK", observedCells: 0, squares: 0, lastMeasuredOn: null });
    expect(slovakia.months).toHaveLength(12);
  });

  it("refuses everyone while observations are off", async () => {
    Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: false }));
    expectError(await injectMutation(route, request), 403, "FEATURE_DISABLED");
  });
});
