import { describe, expect, it } from "vitest";

import {
  SQUARE_ZOOM,
  childRange,
  isInside,
  quadkeyOf,
  rangesCovering,
  squareCenter,
  tileAt,
  tileOfQuadkey,
} from "../../../../src/features/observed/tiles/squares.js";

const PALACE_OF_CULTURE = { latitude: 52.2318, longitude: 21.006 };
const APPENDIX_A_FIX = { latitude: 52.2297123, longitude: 21.0122456 };
const WESTMINSTER = { latitude: 51.5007, longitude: -0.1246 };
const SYDNEY_OPERA_HOUSE = { latitude: -33.8568, longitude: 151.2153 };

describe("the server's squares, pinned to the engine's geo crate", () => {
  it.each([
    [PALACE_OF_CULTURE, 585_472, 345_260, 422_860_654_752],
    [APPENDIX_A_FIX, 585_490, 345_270, 422_860_655_404],
    [WESTMINSTER, 523_925, 348_709, 238_225_738_035],
    [SYDNEY_OPERA_HOUSE, 964_734, 629_200, 922_474_428_244],
  ])("puts %o in the engine's tile and square", (point, x, y, square) => {
    const tile = tileAt(point, SQUARE_ZOOM);

    expect(tile).toEqual({ zoom: SQUARE_ZOOM, x, y });
    expect(quadkeyOf(tile)).toBe(square);
    expect(tileOfQuadkey(square, SQUARE_ZOOM)).toEqual(tile);
  });

  it("finds a square's center where the engine does", () => {
    const center = squareCenter(quadkeyOf(tileAt(APPENDIX_A_FIX, SQUARE_ZOOM)));

    expect(center.latitude).toBeCloseTo(52.22979716, 9);
    expect(center.longitude).toBeCloseTo(21.012210846, 9);
  });

  it("holds every square of a tile in one range, as the engine's parent shifts it", () => {
    const square = quadkeyOf(tileAt(APPENDIX_A_FIX, SQUARE_ZOOM));
    const [first, last] = childRange(tileAt(APPENDIX_A_FIX, 12), SQUARE_ZOOM);

    expect(Math.floor(square / 4 ** 8)).toBe(6_452_341);
    expect(first).toBe(6_452_341 * 4 ** 8);
    expect(last).toBe(6_452_342 * 4 ** 8 - 1);
    expect(square >= first && square <= last).toBe(true);
  });
});

describe("a footprint's squares", () => {
  const footprint = [
    [
      [21.0, 52.22],
      [21.03, 52.22],
      [21.03, 52.24],
      [21.0, 52.24],
      [21.0, 52.22],
    ],
  ] as const;

  it("tells a center inside a footprint from one outside it", () => {
    expect(isInside(PALACE_OF_CULTURE, [footprint])).toBe(true);
    expect(isInside(WESTMINSTER, [footprint])).toBe(false);
  });

  it("covers the footprint with at most four tile ranges at zoom 18", () => {
    const ranges = rangesCovering([footprint], 18);
    const square = quadkeyOf(tileAt(PALACE_OF_CULTURE, 18));

    expect(ranges.length).toBeLessThanOrEqual(4);
    expect(ranges.some(([first, last]) => square >= first && square <= last)).toBe(true);
  });
});
