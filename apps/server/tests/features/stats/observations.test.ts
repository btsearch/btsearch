import { describe, expect, it } from "vitest";

import { quadkeyOf, tileAt } from "../../../src/features/observed/tiles/squares.js";
import { areaOfSquaresKm2, lastMonths, shownMonth } from "../../../src/features/stats/observations.js";

describe("areaOfSquaresKm2", () => {
  it("counts a zoom-20 square at the latitude of its zoom-12 parent", () => {
    const at52 = quadkeyOf(tileAt({ latitude: 52, longitude: 21 }, 12));
    const atEquator = quadkeyOf(tileAt({ latitude: 0.01, longitude: 21 }, 12));

    expect(areaOfSquaresKm2([{ parent: at52, squares: 1000 }])).toBeCloseTo(0.55, 2);
    expect(areaOfSquaresKm2([{ parent: atEquator, squares: 1000 }])).toBeCloseTo(1.46, 2);
    expect(areaOfSquaresKm2([])).toBe(0);
  });
});

describe("shownMonth", () => {
  it("hides the numbers of a month one or two people measured", () => {
    expect([0, 1, 2, 3].map((people) => shownMonth("2026-10-01", people * 100, people))).toEqual([
      { startsOn: "2026-10-01", samples: 0, people: 0 },
      { startsOn: "2026-10-01", samples: null, people: null },
      { startsOn: "2026-10-01", samples: null, people: null },
      { startsOn: "2026-10-01", samples: 300, people: 3 },
    ]);
  });
});

describe("lastMonths", () => {
  it("answers the last 12 months, oldest first, this one included, across a year", () => {
    const months = lastMonths(new Date("2026-03-15T23:59:00Z"));

    expect(months).toHaveLength(12);
    expect([months[0], months[9], months[11]]).toEqual(["2025-04-01", "2026-01-01", "2026-03-01"]);
  });
});
