import { describe, expect, it } from "vitest";

import { raiseNodeSpansPlacesFlag } from "../../../../../src/features/observed/flags/sites/nodeSpansPlaces.js";
import { shownEstimate, siteRecord } from "../../../../helpers/siteRecordFixtures.js";

describe("nodeSpansPlaces", () => {
  const inconsistent = siteRecord({ estimate: shownEstimate({ isConsistent: false }) });
  const krakow = { latitude: 50.06143, longitude: 19.93658 };

  it("opens with the places the cells served from, 10 km apart", () => {
    const cells = [
      { observedCellId: 50211, ...krakow, weight: 300 },
      { observedCellId: 50212, latitude: krakow.latitude + 0.001, longitude: krakow.longitude, weight: 100 },
      { observedCellId: 50213, latitude: krakow.latitude + 0.09, longitude: krakow.longitude, weight: 200 },
    ];
    const places = raiseNodeSpansPlacesFlag(inconsistent, cells)?.evidence.places;

    expect(places?.map((place) => place.observedCellIds)).toEqual([[50211, 50212], [50213]]);
  });

  it("opens with one place when the cells agree and the timing advance does not", () => {
    const cells = [
      { observedCellId: 50211, ...krakow, weight: 300 },
      { observedCellId: 50212, latitude: krakow.latitude + 0.002, longitude: krakow.longitude, weight: 100 },
    ];

    expect(raiseNodeSpansPlacesFlag(inconsistent, cells)?.evidence.places).toHaveLength(1);
  });

  it("does not open for a consistent site, nor for one person's site", () => {
    const cells = [{ observedCellId: 50211, ...krakow, weight: 300 }];

    expect(raiseNodeSpansPlacesFlag(siteRecord(), cells)).toBeNull();
    expect(raiseNodeSpansPlacesFlag({ ...inconsistent, isConfirmed: false }, cells)).toBeNull();
  });
});
