import {
  MAX_ID,
  bboxSchema,
  booleanQuerySchema,
  countryCodeSchema,
  csvCountryCodesSchema,
  csvIdsSchema,
  csvUuidsSchema,
  daySchema,
  idParamSchema,
  instantSchema,
  latitudeQuerySchema,
  limitSchema,
  longitudeQuerySchema,
  searchTextSchema,
} from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

describe("idParamSchema", () => {
  it.each([1, MAX_ID])("coerces the supported integer boundary %s", (id) => {
    expect(idParamSchema.parse(String(id))).toBe(id);
  });

  it.each(["", "0", "-1", "1.5", String(MAX_ID + 1), "NaN", "Infinity", "one"])("rejects unusable database id %j", (value) => {
    expect(idParamSchema.safeParse(value).success).toBe(false);
  });
});

describe("countryCodeSchema", () => {
  it.each(["PL", "US", "ZZ"])("preserves a syntactically valid country code %s", (value) => {
    expect(countryCodeSchema.parse(value)).toBe(value);
  });

  it.each(["pl", "P", "POL", " PL", "PL ", "12", "ŁÓ", ""])("rejects malformed country code %j", (value) => {
    expect(countryCodeSchema.safeParse(value).success).toBe(false);
  });
});

describe("CSV request fields", () => {
  it("decodes ids, country codes and UUIDs into typed arrays", () => {
    expect(csvIdsSchema.parse(`1,${MAX_ID}`)).toEqual([1, MAX_ID]);
    expect(csvCountryCodesSchema.parse("PL,US")).toEqual(["PL", "US"]);
    expect(csvUuidsSchema.parse("123e4567-e89b-42d3-a456-426614174000")).toEqual(["123e4567-e89b-42d3-a456-426614174000"]);
  });

  it.each(["", ",", "1,", "0", "-1", "1.5", "1,no", String(MAX_ID + 1)])("rejects invalid id CSV %j", (value) => {
    expect(csvIdsSchema.safeParse(value).success).toBe(false);
  });

  it("accepts one hundred IDs and rejects a larger batch", () => {
    expect(csvIdsSchema.parse(Array.from({ length: 100 }, (_, index) => index + 1).join(","))).toHaveLength(100);
    expect(csvIdsSchema.safeParse(Array.from({ length: 101 }, (_, index) => index + 1).join(",")).success).toBe(false);
  });

  it.each(["PL,us", "PL,", "PL,,US"])("rejects malformed country CSV %j", (value) => {
    expect(csvCountryCodesSchema.safeParse(value).success).toBe(false);
  });

  it.each(["", "not-a-uuid", "123e4567-e89b-42d3-a456-426614174000,"])("rejects malformed UUID CSV %j", (value) => {
    expect(csvUuidsSchema.safeParse(value).success).toBe(false);
  });
});

describe("booleanQuerySchema", () => {
  it.each([
    ["true", true],
    ["false", false],
  ] as const)("decodes %s without truthiness coercion", (value, expected) => {
    expect(booleanQuerySchema.parse(value)).toBe(expected);
  });

  it.each(["1", "0", "TRUE", "False", "", true, false, null])("rejects non-wire boolean %j", (value) => {
    expect(booleanQuerySchema.safeParse(value).success).toBe(false);
  });
});

describe("coordinate query schemas", () => {
  it.each([
    [-90, -180],
    [0, 0],
    [90, 180],
    [52.2297, 21.0122],
  ])("decodes supported coordinates %s,%s", (latitude, longitude) => {
    expect(latitudeQuerySchema.parse(String(latitude))).toBe(latitude);
    expect(longitudeQuerySchema.parse(String(longitude))).toBe(longitude);
  });

  it.each(["", " ", " 1", "1 ", "1e1", "0x10", "+1", "NaN", "Infinity", "1.1234567890123456", null, 1])(
    "rejects ambiguous coordinate representation %j",
    (value) => {
      expect(latitudeQuerySchema.safeParse(value).success).toBe(false);
      expect(longitudeQuerySchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(["90.0001", "-90.0001"])("rejects latitude beyond a pole %s", (value) => {
    expect(latitudeQuerySchema.safeParse(value).success).toBe(false);
  });

  it.each(["180.0001", "-180.0001"])("rejects longitude beyond the antimeridian %s", (value) => {
    expect(longitudeQuerySchema.safeParse(value).success).toBe(false);
  });
});

describe("bboxSchema", () => {
  it.each([
    ["-180,-90,180,90", [-180, -90, 180, 90]],
    ["170,-10,-170,10", [170, -10, -170, 10]],
  ] as const)("decodes a geographic box %s", (value, expected) => {
    expect(bboxSchema.parse(value)).toEqual(expected);
  });

  it.each(["", "1,2,3", "1,2,3,4,5", "1,2,1,3", "1,3,2,3", "1,4,2,3", "-181,-90,180,90", "-180,-91,180,90", "a,0,1,2"])(
    "rejects an unusable geographic box %j",
    (value) => {
      expect(bboxSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("limitSchema", () => {
  it("defaults the page size to fifty", () => {
    expect(limitSchema.parse(undefined)).toBe(50);
  });

  it.each([1, 200])("accepts the page-size boundary %s", (value) => {
    expect(limitSchema.parse(String(value))).toBe(value);
  });

  it.each(["0", "-1", "201", "1.5", "", "Infinity"])("rejects the unsupported page size %j", (value) => {
    expect(limitSchema.safeParse(value).success).toBe(false);
  });
});

describe("storable date schemas", () => {
  it.each(["0001-01-01", "2024-02-29", "9998-12-31"])("accepts the real day %s", (value) => {
    expect(daySchema.parse(value)).toBe(value);
  });

  it.each(["0000-01-01", "9999-01-01", "2023-02-29", "2024-04-31", "06.10.2026", "2026-10-06T00:00:00Z"])(
    "rejects an invalid or unstorable day %s",
    (value) => {
      expect(daySchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(["0001-01-01T00:00:00Z", "2026-10-06T12:30:00+02:00", "9998-12-31T23:59:59Z"])("preserves the supported instant %s", (value) => {
    expect(instantSchema.parse(value)).toBe(value);
  });

  it.each(["0001-01-01T00:00:00+01:00", "9998-12-31T23:59:59-01:00", "2026-10-06", "2026-10-06T12:30:00", "0000-01-01T00:00:00Z"])(
    "rejects instants outside storage years or without a timezone %s",
    (value) => {
      expect(instantSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("searchTextSchema", () => {
  it("trims searches without altering their content", () => {
    expect(searchTextSchema.parse("  Lorem ipsum dolor sit amet  ")).toBe("Lorem ipsum dolor sit amet");
  });

  it.each(["", "  ", "street\u0000name", "a".repeat(501)])("rejects an unusable search %j", (value) => {
    expect(searchTextSchema.safeParse(value).success).toBe(false);
  });

  it("accepts a search at the maximum length", () => {
    expect(searchTextSchema.parse("a".repeat(500))).toHaveLength(500);
  });
});
