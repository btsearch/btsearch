import { describe, expect, it } from "vitest";

import { childRange, quadkeyOf, tileAt } from "../../../../src/features/observed/tiles/squares.js";
import {
  COVERAGE_MIN_ZOOM,
  PERSON_TRAIL_ZOOM,
  TRAIL_MIN_ZOOM,
  squareZoom,
  tileSquares,
} from "../../../../src/features/observed/tiles/vectorTiles.js";

const WARSAW = { latitude: 52.2297, longitude: 21.0122 };

describe("squareZoom", () => {
  it.each([
    [0, null],
    [5, null],
    [6, 12],
    [7, 12],
    [8, 14],
    [9, 14],
    [10, 16],
    [11, 16],
    [12, 18],
    [13, 18],
    [14, 20],
    [15, 20],
    [20, 20],
  ])("draws trails of a zoom %i tile in squares of zoom %s", (zoom, expected) => {
    expect(squareZoom(zoom, TRAIL_MIN_ZOOM)).toBe(expected);
  });

  it("draws no coverage below zoom 12", () => {
    expect(squareZoom(11, COVERAGE_MIN_ZOOM)).toBeNull();
    expect(squareZoom(12, COVERAGE_MIN_ZOOM)).toBe(18);
    expect(squareZoom(16, COVERAGE_MIN_ZOOM)).toBe(20);
  });

  it("draws a person's own trail no finer than zoom 18", () => {
    expect(squareZoom(14, TRAIL_MIN_ZOOM, PERSON_TRAIL_ZOOM)).toBe(18);
    expect(squareZoom(20, TRAIL_MIN_ZOOM, PERSON_TRAIL_ZOOM)).toBe(18);
  });
});

describe("tileSquares", () => {
  it("reads the 4096 zoom 20 squares of a zoom 14 tile as one range", () => {
    const tile = tileAt(WARSAW, 14);
    const squares = tileSquares(tile, 20, 20);

    expect([squares.first, squares.last]).toEqual(childRange(tile, 20));
    expect(squares.first).toBe(quadkeyOf(tile) * 4096);
    expect(squares.last - squares.first + 1).toBe(4096);
    expect(squares.shift).toBe(0);
  });

  it("groups the stored squares of a zoom 6 tile into squares of zoom 12", () => {
    const tile = tileAt(WARSAW, 6);
    const squares = tileSquares(tile, 12, 20);

    expect([squares.first, squares.last]).toEqual(childRange(tile, 20));
    expect(squares.shift).toBe(16);
    expect(squares.first / 2 ** squares.shift).toBe(childRange(tile, 12)[0]);
  });

  it("reads the one zoom 18 square that holds a zoom 19 tile", () => {
    const tile = tileAt(WARSAW, 19);
    const ancestor = quadkeyOf(tileAt(WARSAW, 18));

    expect(tileSquares(tile, 18, 18)).toMatchObject({ first: ancestor, last: ancestor, shift: 0 });
  });
});
