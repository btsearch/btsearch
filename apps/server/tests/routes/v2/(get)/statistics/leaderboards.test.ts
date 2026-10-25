import { describe, expect, it } from "vitest";

import { getRuntimeSettings, mergeRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(get)/statistics/leaderboards.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";

function entry(username: string, rank: number, position: number) {
  return {
    countryCode: "PL",
    id: `0199f1c2-0000-7000-8000-00000000000${position}`,
    username,
    name: username,
    image: null,
    newSquares: 9105,
    newConfirmedCells: 12,
    newSites: 2,
    refreshedOn: "2026-11-04",
    rank,
    position,
  };
}

describe("GET /statistics/leaderboards", () => {
  it("answers each public country's board, an empty one for a country nobody is on", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "CZ" }, { code: "PL" }]);
    dbMock.enqueueFor("select", undefined, [entry("ania", 1, 1), entry("kasia", 1, 2)]);
    const response = await injectMutation(route, { method: "GET", url: "/statistics/leaderboards?startsOn=2026-10-01&limit=3" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual([
      { countryCode: "CZ", startsOn: "2026-10-01", refreshedOn: null, entries: [] },
      {
        countryCode: "PL",
        startsOn: "2026-10-01",
        refreshedOn: "2026-11-04",
        entries: [
          {
            rank: 1,
            user: { id: entry("ania", 1, 1).id, username: "ania", name: "ania", image: null },
            newSquares: 9105,
            newConfirmedCells: 12,
            newSites: 2,
          },
          { rank: 1, user: expect.objectContaining({ username: "kasia" }), newSquares: 9105, newConfirmedCells: 12, newSites: 2 },
        ],
      },
    ]);
  });

  it("refuses everyone while observations are off", async () => {
    Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: false }));
    expectError(await injectMutation(route, { method: "GET", url: "/statistics/leaderboards" }), 403, "FEATURE_DISABLED");
  });
});
