import { describe, expect, it } from "vitest";

import type { RegionRow } from "../../../src/features/regions/serialize.js";
import { readRegionBoundaries } from "../../../src/scripts/importRegionBoundaries/boundaries.js";

const regions: RegionRow[] = [
  { id: 1, name: "Mazowieckie", code: "14", countryCode: "PL", isoCode: "PL-14" },
  { id: 2, name: "Łódzkie", code: "10", countryCode: "PL", isoCode: "PL-10" },
  { id: 3, name: "London", code: "LDN", countryCode: "GB", isoCode: null },
  { id: 4, name: "Scotland", code: "SCT", countryCode: "GB", isoCode: "GB-SCT" },
];

const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};

function feature(properties: Record<string, unknown> | null, geometry: unknown = polygon) {
  return { type: "Feature", properties, geometry };
}

function collection(features: ReturnType<typeof feature>[]) {
  return { type: "FeatureCollection", features };
}

describe("readRegionBoundaries", () => {
  it("retains the Poland property and prefix import contract", () => {
    const result = readRegionBoundaries(collection([feature({ terc: "14" }), feature({ terc: 10 })]), regions, {
      property: "terc",
      prefix: "PL-",
    });

    expect([...result.shapes.keys()]).toEqual([1, 2]);
    expect(result.messages).not.toEqual(expect.arrayContaining([expect.stringContaining("skipped")]));
    expect(result.srid).toBe(4326);
  });

  it.each([
    [{ iso_code: "PL-14" }, 1],
    [{ ISO_3166_2: "GB-SCT" }, 4],
    [{ code: "SCT" }, 4],
    [{ name: "Scotland" }, 4],
    [{ name: "  lodzkie  " }, 2],
  ])("matches a region from an automatic identifier: %j", (properties, id) => {
    const result = readRegionBoundaries(collection([feature(properties)]), regions);

    expect([...result.shapes.keys()]).toEqual([id]);
    expect(result.messages).not.toEqual(expect.arrayContaining([expect.stringContaining("skipped")]));
  });

  it("matches an ONS region by name when its ITL code differs from the stored region code", () => {
    const result = readRegionBoundaries(collection([feature({ ITL125CD: "TLI", ITL125NM: "London (England)" })]), regions, { country: "GB" });

    expect([...result.shapes.keys()]).toEqual([3]);
    expect(result.shapes.get(3)).toEqual([polygon]);
  });

  it("accepts a single GeoJSON feature", () => {
    const result = readRegionBoundaries(feature({ name: "Scotland" }), regions);

    expect(result.shapes.get(4)).toEqual([polygon]);
  });

  it("uses the selected property without automatically matching other properties", () => {
    const result = readRegionBoundaries(collection([feature({ custom_identifier: "14", name: "Scotland" })]), regions, {
      property: "custom_identifier",
      prefix: "PL-",
    });

    expect([...result.shapes.keys()]).toEqual([1]);
  });

  it("does not use an arbitrary numeric feature ID as a region identifier", () => {
    const result = readRegionBoundaries(collection([feature({ OBJECTID: 14, FID: 14, id: 14 })]), regions);

    expect(result.shapes.size).toBe(0);
    expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("no matching region")]));
  });

  it("allows an arbitrary property when it is explicitly selected", () => {
    const result = readRegionBoundaries(collection([feature({ OBJECTID: 14 })]), regions, { property: "OBJECTID", prefix: "PL-" });

    expect([...result.shapes.keys()]).toEqual([1]);
  });

  it("skips a feature whose recognised properties identify different regions", () => {
    const result = readRegionBoundaries(collection([feature({ iso_code: "PL-14", name: "Scotland" })]), regions);

    expect(result.shapes.size).toBe(0);
    expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("conflicting matches")]));
  });

  it("does not guess between regions with the same name in different countries", () => {
    const sharedName: RegionRow[] = [
      { id: 5, name: "Central", code: "CTR", countryCode: "GB", isoCode: "GB-CTR" },
      { id: 6, name: "Central", code: "CTR", countryCode: "IE", isoCode: "IE-CTR" },
    ];
    const result = readRegionBoundaries(collection([feature({ name: "Central" })]), sharedName);

    expect(result.shapes.size).toBe(0);
    expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("ambiguous")]));
  });

  it("uses the country option to disambiguate a shared region name", () => {
    const sharedName: RegionRow[] = [
      { id: 5, name: "Central", code: "CTR", countryCode: "GB", isoCode: "GB-CTR" },
      { id: 6, name: "Central", code: "CTR", countryCode: "IE", isoCode: "IE-CTR" },
    ];
    const result = readRegionBoundaries(collection([feature({ name: "Central" })]), sharedName, { country: "GB" });

    expect([...result.shapes.keys()]).toEqual([5]);
  });

  it("does not match a unique name from a different source country", () => {
    const result = readRegionBoundaries(collection([feature({ ISO_A2: "PL", name: "Scotland" })]), regions);

    expect(result.shapes.size).toBe(0);
    expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("source country")]));
  });

  it("uses a source country code to identify regions with shared names and codes", () => {
    const sharedName: RegionRow[] = [
      { id: 5, name: "Central", code: "CTR", countryCode: "GB", isoCode: "GB-CTR" },
      { id: 6, name: "Central", code: "CTR", countryCode: "IE", isoCode: "IE-CTR" },
    ];
    const result = readRegionBoundaries(collection([feature({ ISO_A2: "IE", name: "Central", code: "CTR" })]), sharedName);

    expect([...result.shapes.keys()]).toEqual([6]);
  });

  it("skips a source country that conflicts with the explicitly selected country", () => {
    const result = readRegionBoundaries(collection([feature({ ISO_A2: "PL", name: "Scotland" })]), regions, { country: "GB" });

    expect(result.shapes.size).toBe(0);
    expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("country")]));
  });

  it("does not use a local name to bypass an ISO code from a different selected country", () => {
    const result = readRegionBoundaries(collection([feature({ iso_code: "PL-14", name: "Scotland" })]), regions, { country: "GB" });

    expect(result.shapes.size).toBe(0);
    expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("country")]));
  });

  it("uses an explicit mapping ahead of matching source names", () => {
    const result = readRegionBoundaries(collection([feature({ name: "Scotland" })]), regions, { mapping: { Scotland: "PL-14" } });

    expect([...result.shapes.keys()]).toEqual([1]);
  });

  it("maps a custom source identifier to an existing region", () => {
    const result = readRegionBoundaries(collection([feature({ source_identifier: "TLI" })]), regions, {
      property: "source_identifier",
      mapping: { TLI: "LDN" },
      country: "GB",
    });

    expect([...result.shapes.keys()]).toEqual([3]);
  });

  it("uses an authoritative mapping for a custom field ahead of an automatic name match", () => {
    const result = readRegionBoundaries(collection([feature({ local_region_id: "TLI", name: "Scotland" })]), regions, {
      mapping: { TLI: "LDN" },
      country: "GB",
    });

    expect([...result.shapes.keys()]).toEqual([3]);
  });

  it("does not fall back to a source name after an invalid mapping target", () => {
    const result = readRegionBoundaries(collection([feature({ name: "Scotland" })]), regions, {
      mapping: { Scotland: "GB-UNKNOWN" },
    });

    expect(result.shapes.size).toBe(0);
    expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("mapping")]));
  });

  it("does not fall back to an automatic name after a custom field has an invalid mapping target", () => {
    const result = readRegionBoundaries(collection([feature({ local_region_id: "TLI", name: "Scotland" })]), regions, {
      mapping: { TLI: "GB-UNKNOWN" },
    });

    expect(result.shapes.size).toBe(0);
    expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("mapping")]));
  });

  it("groups multiple features for the same region without losing a polygon", () => {
    const island = {
      type: "Polygon",
      coordinates: [
        [
          [2, 2],
          [3, 2],
          [3, 3],
          [2, 2],
        ],
      ],
    };
    const result = readRegionBoundaries(collection([feature({ name: "Scotland" }), feature({ name: "Scotland" }, island)]), regions);

    expect(result.shapes.get(4)).toEqual([polygon, island]);
  });

  it("accepts a MultiPolygon outline", () => {
    const multipolygon = { type: "MultiPolygon", coordinates: [polygon.coordinates] };
    const result = readRegionBoundaries(collection([feature({ name: "Scotland" }, multipolygon)]), regions);

    expect(result.shapes.get(4)).toEqual([multipolygon]);
  });

  it("reads British National Grid coordinates from the declared CRS", () => {
    const projected = {
      type: "Polygon",
      coordinates: [
        [
          [500000, 200000],
          [500100, 200000],
          [500100, 200100],
          [500000, 200000],
        ],
      ],
    };
    const input = {
      ...collection([feature({ name: "London" }, projected)]),
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::27700" } },
    };
    const result = readRegionBoundaries(input, regions);

    expect(result.srid).toBe(27700);
    expect(result.shapes.get(3)).toEqual([projected]);
  });

  it("lets an explicit SRID override CRS metadata", () => {
    const input = {
      ...collection([feature({ name: "Scotland" })]),
      crs: { type: "name", properties: { name: "EPSG:27700" } },
    };
    const result = readRegionBoundaries(input, regions, { srid: 4326 });

    expect(result.srid).toBe(4326);
  });

  it("rejects unrecognised CRS metadata without an explicit SRID", () => {
    const input = {
      ...collection([feature({ name: "Scotland" })]),
      crs: { type: "name", properties: { name: "LOCAL_UNKNOWN" } },
    };

    expect(() => readRegionBoundaries(input, regions)).toThrow();
  });

  it("rejects projected coordinates when no CRS or SRID was supplied", () => {
    const projected = {
      type: "Polygon",
      coordinates: [
        [
          [500000, 200000],
          [500100, 200000],
          [500100, 200100],
          [500000, 200000],
        ],
      ],
    };

    expect(() => readRegionBoundaries(collection([feature({ name: "London" }, projected)]), regions)).toThrow();
  });

  it("accepts a projected file with an explicit SRID", () => {
    const projected = {
      type: "Polygon",
      coordinates: [
        [
          [500000, 200000],
          [500100, 200000],
          [500100, 200100],
          [500000, 200000],
        ],
      ],
    };
    const result = readRegionBoundaries(collection([feature({ name: "London" }, projected)]), regions, { srid: 27700 });

    expect(result.srid).toBe(27700);
  });

  it("reports a feature with missing properties instead of inventing an identifier", () => {
    const result = readRegionBoundaries(collection([feature(null)]), regions);

    expect(result.shapes.size).toBe(0);
    expect(result.messages).toEqual(expect.arrayContaining([expect.stringContaining("no matching region")]));
  });

  it.each([
    { type: "Point", coordinates: [0, 0] },
    { type: "Polygon", coordinates: [] },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [2, 2],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, Number.NaN],
          [0, 0],
        ],
      ],
    },
    { type: "MultiPolygon", coordinates: [] },
    null,
  ])("rejects a malformed or unsupported geometry: %j", (geometry) => {
    expect(() => readRegionBoundaries(collection([feature({ name: "Scotland" }, geometry)]), regions)).toThrow();
  });
});
