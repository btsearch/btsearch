import {
  emfAntennaQuerySchema,
  emfFilingListQuerySchema,
  emfInactiveSiteListQuerySchema,
  emfMeasurementListQuerySchema,
  emfReportListQuerySchema,
} from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

describe("EMF site references", () => {
  const schemas = [emfReportListQuerySchema, emfAntennaQuerySchema];

  it.each([
    { stationId: "1" },
    { officialSiteId: "1" },
    { siteId: "  Łódź  ", latitude: "52", longitude: "21" },
    { siteId: "A1", latitude: "52", longitude: "21", operatorId: "1" },
  ])("decodes exactly one complete site reference %j", (query) => {
    for (const schema of schemas) expect(schema.safeParse(query).success).toBe(true);
  });

  it.each([
    {},
    { stationId: "1", officialSiteId: "2" },
    { stationId: "1", siteId: "A1", latitude: "52", longitude: "21" },
    { officialSiteId: "1", siteId: "A1", latitude: "52", longitude: "21" },
    { stationId: "1", latitude: "52", longitude: "21" },
    { officialSiteId: "1", operatorId: "2" },
    { siteId: "A1" },
    { siteId: "A1", latitude: "52" },
    { siteId: "A1", longitude: "21" },
  ])("rejects ambiguous or incomplete site references %j", (query) => {
    for (const schema of schemas) expect(schema.safeParse(query).success).toBe(false);
  });

  it("accepts an explicitly selected report only for the antenna endpoint", () => {
    const query = { stationId: "1", reportUrl: "https://example.test/report.pdf" };
    expect(emfAntennaQuerySchema.parse(query)).toEqual({ stationId: 1, reportUrl: query.reportUrl });
    expect(emfReportListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("emfMeasurementListQuerySchema", () => {
  it("uses register defaults without adding optional filters", () => {
    expect(emfMeasurementListQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it.each([
    { limit: "100" },
    { bbox: "0,0,1,1", limit: "1000" },
    { bbox: "0,0,1,1", statuses: "planned" },
    { statuses: "planned,completed", operatorIds: "1,2,3,4", regionIds: "1,2" },
    { bbox: "0,0,1,1", operatorIds: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17" },
    { offset: "10000000" },
  ])("accepts a bounded register or map-layer request %j", (query) => {
    expect(emfMeasurementListQuerySchema.safeParse(query).success).toBe(true);
  });

  it.each([
    { limit: "101" },
    { bbox: "0,0,1,1", limit: "1001" },
    { bbox: "0,0,1,1", statuses: "completed" },
    { bbox: "0,0,1,1", statuses: "planned,cancelled" },
    { bbox: "0,0,1,1", regionIds: "1" },
    { statuses: "planned,completed", operatorIds: "1,2,3", regionIds: "1,2,3" },
    { offset: "10000001" },
    { offset: "0", cursor: "cursor" },
    { unknown: "value" },
  ])("rejects unsupported or excessive register combinations %j", (query) => {
    expect(emfMeasurementListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("emfFilingListQuerySchema", () => {
  it("accepts sixteen provider requests and rejects seventeen", () => {
    const ids = Array.from({ length: 16 }, (_, index) => index + 1).join(",");
    expect(emfFilingListQuerySchema.parse({ operatorIds: ids })).toEqual({
      operatorIds: Array.from({ length: 16 }, (_, index) => index + 1),
      limit: 50,
    });
    expect(emfFilingListQuerySchema.safeParse({ operatorIds: `${ids},17` }).success).toBe(false);
  });

  it.each([{ limit: "101" }, { bbox: "0,0,1,1" }, { cursor: "x", offset: "0" }])("rejects unsupported filing queries %j", (query) => {
    expect(emfFilingListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("emfInactiveSiteListQuerySchema", () => {
  it("supports larger map-independent pages and offsets", () => {
    expect(emfInactiveSiteListQuerySchema.parse({ limit: "1000", offset: "10000000", includeTotal: "false" })).toEqual({
      limit: 1000,
      offset: 10000000,
      includeTotal: false,
    });
  });

  it.each([{ limit: "1001" }, { cursor: "x", offset: "0" }, { statuses: "planned" }])("rejects unsupported inactive-site queries %j", (query) => {
    expect(emfInactiveSiteListQuerySchema.safeParse(query).success).toBe(false);
  });
});
