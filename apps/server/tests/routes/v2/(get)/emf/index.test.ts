import { stations } from "@openbts/drizzle";
import { getTableName } from "drizzle-orm";
import { SI2PEMError, SI2PEM_ENDPOINTS, SI2PEM_ERROR_CODES } from "si2pem-reader";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportReadQueueFullError, si2pem } from "../../../../../src/features/emf/si2pem.js";
import getEmfAntennas from "../../../../../src/routes/v2/(get)/emf/antennas.js";
import getEmfFilings from "../../../../../src/routes/v2/(get)/emf/filings.js";
import getEmfInactiveSites from "../../../../../src/routes/v2/(get)/emf/inactive-sites.js";
import getEmfMeasurements from "../../../../../src/routes/v2/(get)/emf/measurements.js";
import getEmfReports from "../../../../../src/routes/v2/(get)/emf/reports.js";
import { dbMock, redisMock } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

let day = 0;
const rawSite = "siteId=Test%27Site&latitude=52.123456&longitude=21.123456";

beforeEach(() => {
  redisMock.isReady = false;
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-06T10:00:00Z") + day++ * 86_400_000);
});

describe("getEmfReports", () => {
  it("keeps valid filing reports when the measurement service fails", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "operators", [{ mnc: 26003 }]);
    vi.spyOn(si2pem, "getWmsFeatureInfo").mockRejectedValue(new SI2PEMError(SI2PEM_ERROR_CODES.invalidResponse, "Unavailable measurements"));
    vi.spyOn(si2pem, "listInstallations").mockResolvedValue({
      results: [
        {
          base_station: { identity_name: "Test'Site" },
          report_file: "/files/filing.pdf",
          published_at: "06.10.2026 10:00:00",
          entity: " Orange Polska S.A. ",
        },
      ],
    } as unknown as Awaited<ReturnType<typeof si2pem.listInstallations>>);
    const app = await createRouteHarness(getEmfReports);
    const response = await app.inject({ url: `/emf/reports?${rawSite}&operatorId=1` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject([
      { kind: "filing", filerName: "Orange Polska S.A.", publishedAt: "2026-10-06T08:00:00.000Z", hasAntennaTable: false },
    ]);
    expect(response.headers).not.toHaveProperty("retry-after");
  });

  it("deduplicates reports by URL, chooses the newest and drops invalid URLs or dates", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const load = vi.spyOn(si2pem, "getWmsFeatureInfo").mockResolvedValue({
      features: [
        { properties: { url: "/files/1.pdf", date: "2026-09-01", source: " Old Lab ", measure_type: "lab" } },
        { properties: { url: "/files/1.pdf", date: "2026-10-01", source: " New Lab ", measure_type: "lab" } },
        { properties: { url: "https://hostile.example/1.pdf", date: "2026-10-02" } },
        { properties: { url: "/files/2.pdf", date: "invalid" } },
      ],
    } as unknown as Awaited<ReturnType<typeof si2pem.getWmsFeatureInfo>>);
    const app = await createRouteHarness(getEmfReports);
    const response = await app.inject({ url: `/emf/reports?${rawSite}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({
      kind: "measurement",
      measuredOn: "2026-10-01",
      laboratoryName: "New Lab",
      hasAntennaTable: true,
      filerName: null,
    });
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({
        bbox: [expect.closeTo(21.103, 6), expect.closeTo(52.103, 6), expect.closeTo(21.143, 6), expect.closeTo(52.143, 6)],
        cqlFilter: "identity_names='Test''Site' AND url IS NOT NULL",
      }),
    );
  });

  it("returns no reports for a station without coordinates", async () => {
    dbMock.enqueueFor("select", getTableName(stations), [{ siteId: "Test", latitude: null, longitude: null, mnc: null, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", []);
    const load = vi.spyOn(si2pem, "getWmsFeatureInfo").mockRejectedValue(new Error("Unexpected report lookup"));
    const app = await createRouteHarness(getEmfReports);
    expect((await app.inject({ url: "/emf/reports?stationId=1" })).json()).toEqual({ data: [] });
    expect(load).not.toHaveBeenCalled();
  });

  it("hides stations outside the supported country", async () => {
    dbMock.enqueueFor("select", getTableName(stations), [{ siteId: "Test", latitude: 52, longitude: 21, mnc: null, countryCode: "US" }]);
    const app = await createRouteHarness(getEmfReports);
    expect((await app.inject({ url: "/emf/reports?stationId=1" })).statusCode).toBe(404);
  });
});

describe("getEmfAntennas", () => {
  it("returns no antenna report for a station with no coordinates", async () => {
    dbMock.enqueueFor("select", getTableName(stations), [{ siteId: "Test", latitude: null, longitude: null, mnc: null, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", []);
    const load = vi.spyOn(si2pem, "findLaboratoryReports").mockRejectedValue(new Error("Unexpected report lookup"));
    const app = await createRouteHarness(getEmfAntennas);
    const response = await app.inject({ url: "/emf/antennas?stationId=1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { report: null, antennas: [] } });
    expect(load).not.toHaveBeenCalled();
    expect(redisMock.eval).not.toHaveBeenCalled();
  });

  it("counts an uncached report read and returns its metadata when the PDF exceeds the size limit", async () => {
    redisMock.isReady = true;
    dbMock.enqueueFor("select", "countries", []);
    const reportUrl = new URL("/files/large.pdf", SI2PEM_ENDPOINTS.origin).href;
    vi.spyOn(si2pem, "findLaboratoryReports").mockResolvedValue([
      { url: reportUrl, publishedAt: "2026-10-01", laboratoryName: " Laboratory " },
    ] as unknown as Awaited<ReturnType<typeof si2pem.findLaboratoryReports>>);
    const download = vi.spyOn(si2pem, "downloadReport").mockRejectedValue(new SI2PEMError(SI2PEM_ERROR_CODES.responseTooLarge, "PDF too large"));
    const app = await createRouteHarness(getEmfAntennas);
    const response = await app.inject({ url: `/emf/antennas?${rawSite}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ report: { url: reportUrl, laboratoryName: "Laboratory" }, antennas: [] });
    expect(download).toHaveBeenCalledWith(reportUrl);
    expect(redisMock.eval).toHaveBeenCalledWith(
      expect.stringContaining("return {count, ttl}"),
      expect.objectContaining({ keys: [expect.stringContaining("emf-report-read")] }),
    );
  });

  it("refreshes the laboratory report list instead of reusing the truncated cache", async () => {
    redisMock.isReady = true;
    dbMock.enqueueFor("select", "countries", []);
    const newerReportUrl = new URL("/files/newer.pdf", SI2PEM_ENDPOINTS.origin).href;
    const reportUrl = new URL("/files/older.pdf", SI2PEM_ENDPOINTS.origin).href;
    redisMock.get.mockImplementation(async (key) =>
      key.startsWith("emf:laboratory-reports:v1:")
        ? JSON.stringify({
            freshUntil: Date.now() + 1000,
            value: [{ url: newerReportUrl, measuredOn: "2026-10-01", laboratoryName: "Laboratory" }],
          })
        : null,
    );
    const load = vi
      .spyOn(si2pem, "findLaboratoryReports")
      .mockResolvedValue([{ url: reportUrl, publishedAt: "2024-03-27", laboratoryName: "Laboratory" }] as unknown as Awaited<
        ReturnType<typeof si2pem.findLaboratoryReports>
      >);
    const download = vi.spyOn(si2pem, "downloadReport").mockRejectedValue(new SI2PEMError(SI2PEM_ERROR_CODES.responseTooLarge, "PDF too large"));
    const app = await createRouteHarness(getEmfAntennas);
    const response = await app.inject({ url: `/emf/antennas?${rawSite}&reportUrl=${encodeURIComponent(reportUrl)}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ report: { url: reportUrl, measuredOn: "2024-03-27", laboratoryName: "Laboratory" }, antennas: [] });
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ stationIdentity: "Test'Site", count: 200 }));
    expect(download).toHaveBeenCalledWith(reportUrl);
  });

  it("returns cached antenna details without downloading or consuming the report quota", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const reportUrl = new URL("/files/report.pdf", SI2PEM_ENDPOINTS.origin).href;
    const cached = {
      report: { url: reportUrl, measuredOn: "2026-10-01", laboratoryName: "Laboratory" },
      antennas: [
        {
          rowNumber: 1,
          pageNumber: 2,
          model: "Antenna",
          manufacturer: null,
          heightMeters: 20,
          azimuth: 120,
          totalEirpWatts: 100,
          bands: [{ label: "LTE 1800", rat: "lte", frequencyMhz: 1800, eirpWatts: 100, tiltRange: { min: 0, max: 10 }, measuredTilt: 5 }],
        },
      ],
    };
    redisMock.get.mockImplementation(async (key) =>
      key.startsWith("emf:antennas:v1:") ? JSON.stringify({ freshUntil: Date.now() + 1000, value: cached }) : null,
    );
    const download = vi.spyOn(si2pem, "downloadReport").mockRejectedValue(new Error("Unexpected report download"));
    const app = await createRouteHarness(getEmfAntennas);
    const response = await app.inject({ url: `/emf/antennas?${rawSite}&reportUrl=${encodeURIComponent(reportUrl)}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: cached });
    expect(download).not.toHaveBeenCalled();
    expect(redisMock.eval).not.toHaveBeenCalled();
  });

  it("returns an empty report when no laboratory report exists", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const load = vi.spyOn(si2pem, "findLaboratoryReports").mockResolvedValue([]);
    const download = vi.spyOn(si2pem, "downloadReport").mockRejectedValue(new Error("Unexpected report download"));
    const app = await createRouteHarness(getEmfAntennas);
    const response = await app.inject({ url: `/emf/antennas?${rawSite}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { report: null, antennas: [] } });
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ stationIdentity: "Test'Site", count: 200 }));
    expect(download).not.toHaveBeenCalled();
  });

  it.each(["https://hostile.example/report.pdf", "https://user:password@si2pem.gov.pl/report.pdf"])(
    "rejects a report URL outside the trusted host: %s",
    async (url) => {
      dbMock.enqueueFor("select", "countries", []);
      const download = vi.spyOn(si2pem, "downloadReport").mockRejectedValue(new Error("Unexpected report download"));
      const app = await createRouteHarness(getEmfAntennas);
      expect((await app.inject({ url: `/emf/antennas?${rawSite}&reportUrl=${encodeURIComponent(url)}` })).statusCode).toBe(404);
      expect(download).not.toHaveBeenCalled();
    },
  );

  it("reports a busy reader with the short retry window", async () => {
    dbMock.enqueueFor("select", "countries", []);
    vi.spyOn(si2pem, "findLaboratoryReports").mockRejectedValue(new ReportReadQueueFullError());
    const app = await createRouteHarness(getEmfAntennas);
    const response = await app.inject({ url: `/emf/antennas?${rawSite}` });
    expect(response.statusCode).toBe(503);
    expect(response.headers).toMatchObject({ "retry-after": "10", "x-retry-after": "10" });
  });
});

describe("getEmfMeasurements", () => {
  it("filters old, duplicated and out-of-area map entries before calculating totals", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const recent = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const stale = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
    vi.spyOn(si2pem, "getFeatures").mockResolvedValue({
      features: [
        { geometry: { coordinates: [21, 52] }, properties: { bs_identity_name: "Site A", date_from: recent, date_to: recent } },
        { geometry: { coordinates: [21, 52] }, properties: { bs_identity_name: "Site A", date_from: recent, date_to: recent } },
        { geometry: { coordinates: [22, 53] }, properties: { bs_identity_name: "Site B", date_from: recent, date_to: recent } },
        { geometry: { coordinates: [21, 52] }, properties: { bs_identity_name: "Stale", date_from: stale, date_to: stale } },
        { geometry: { coordinates: [21, 49] }, properties: { bs_identity_name: "Outside", date_from: recent, date_to: recent } },
        { geometry: null, properties: { bs_identity_name: "No position", date_from: recent, date_to: recent } },
      ],
    } as unknown as Awaited<ReturnType<typeof si2pem.getFeatures>>);
    const app = await createRouteHarness(getEmfMeasurements);
    const response = await app.inject({ url: "/emf/measurements?bbox=20,50,23,54&includeTotal=true&limit=1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ siteId: "Site A", id: null, regionId: null, status: "planned" }],
      paging: { limit: 1, total: 2, nextCursor: expect.any(String) },
    });
  });

  it("parses register values, drops malformed rows and retains the source total", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const load = vi.spyOn(si2pem, "listPlannedMeasurements").mockResolvedValue({
      count: 2,
      results: [
        {
          id: 1,
          base_station: { identity_name: " Test Site ", latitude: "52", longitude: "21" },
          date_from: "2026-10-01",
          date_to: "2026-10-05",
          lab: { name: " Lab ", PCA: " AB 1 " },
          status: "COMPLETED",
          report: "/files/1.pdf",
        },
        { id: 2, base_station: { latitude: "invalid", longitude: 21 }, status: "COMPLETED" },
      ],
    } as unknown as Awaited<ReturnType<typeof si2pem.listPlannedMeasurements>>);
    const app = await createRouteHarness(getEmfMeasurements);
    const response = await app.inject({ url: "/emf/measurements?statuses=completed&includeTotal=true&limit=2" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({
      id: 1,
      siteId: "Test Site",
      status: "completed",
      startsOn: "2026-10-01",
      endsOn: "2026-10-05",
      laboratory: { name: "Lab", accreditationNumber: "AB 1" },
      operatorId: null,
      regionId: null,
      stationId: null,
      location: { latitude: 52, longitude: 21 },
    });
    expect(response.json().paging).toEqual({ limit: 2, total: 2, nextCursor: null });
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED", page: 1, pageSize: 2 }));
  });

  it("does not query the provider for a bounding box outside Poland", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const load = vi.spyOn(si2pem, "getFeatures").mockRejectedValue(new Error("Unexpected map lookup"));
    const app = await createRouteHarness(getEmfMeasurements);
    const response = await app.inject({ url: "/emf/measurements?bbox=0,0,1,1&includeTotal=true" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, total: 0, nextCursor: null } });
    expect(load).not.toHaveBeenCalled();
  });

  it("maps an invalid provider page to service unavailable with retry headers", async () => {
    dbMock.enqueueFor("select", "countries", []);
    vi.spyOn(si2pem, "listPlannedMeasurements").mockResolvedValue({ count: -1, results: [], next: null, previous: null });
    const app = await createRouteHarness(getEmfMeasurements);
    const response = await app.inject({ url: "/emf/measurements" });
    expect(response.statusCode).toBe(503);
    expect(response.headers).toMatchObject({ "retry-after": "60", "x-retry-after": "60" });
  });
});

describe("getEmfFilings", () => {
  it("serializes the filing's publication date and country-local registration date", async () => {
    dbMock.enqueueFor("select", "countries", []);
    vi.spyOn(si2pem, "listInstallations").mockResolvedValue({
      count: 1,
      results: [
        {
          base_station: { identity_name: " Site ", latitude: 52, longitude: 21, address: "Łódź, Main Street" },
          published_at: "06.10.2026 10:00:00",
          registration_date: "2026-10-05",
          reference_no: " REF-1 ",
          installation_file: "/files/installation.pdf",
          report_file: "https://hostile.example/report.pdf",
        },
      ],
    } as unknown as Awaited<ReturnType<typeof si2pem.listInstallations>>);
    const app = await createRouteHarness(getEmfFilings);
    const response = await app.inject({ url: "/emf/filings?includeTotal=true" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({
      siteId: "Site",
      publishedAt: "2026-10-06T08:00:00.000Z",
      registeredOn: "2026-10-05",
      referenceNumber: "REF-1",
      reportUrl: null,
      location: { city: "Łódź", address: "Łódź, Main Street" },
    });
    expect(response.json().paging.total).toBe(1);
  });

  it("preserves typed provider failures in the HTTP retry contract", async () => {
    dbMock.enqueueFor("select", "countries", []);
    vi.spyOn(si2pem, "listInstallations").mockRejectedValue(new SI2PEMError(SI2PEM_ERROR_CODES.invalidResponse, "Invalid response"));
    const app = await createRouteHarness(getEmfFilings);
    const response = await app.inject({ url: "/emf/filings" });
    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("60");
  });
});

describe("getEmfInactiveSites", () => {
  it("filters active and repeated sites and sorts the remaining sites by disable date", async () => {
    dbMock.enqueueFor("select", "countries", []);
    vi.spyOn(si2pem, "getFeatures").mockResolvedValue({
      features: [
        { geometry: { coordinates: [21, 52] }, properties: { identity_name: " Old ", is_old: true, is_active: false, disabling_date: "2026-01-01" } },
        { geometry: { coordinates: [22, 53] }, properties: { identity_name: "New", is_old: true, is_active: false, disabling_date: "2026-10-01" } },
        { geometry: { coordinates: [22, 53] }, properties: { identity_name: "New", is_old: true, is_active: false, disabling_date: "2026-10-02" } },
        { geometry: { coordinates: [21, 52] }, properties: { identity_name: "Active", is_old: true, is_active: true } },
      ],
    } as unknown as Awaited<ReturnType<typeof si2pem.getFeatures>>);
    const app = await createRouteHarness(getEmfInactiveSites);
    const response = await app.inject({ url: "/emf/inactive-sites?includeTotal=true&limit=1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ siteId: "New", disabledOn: "2026-10-01" }],
      paging: { limit: 1, total: 2, nextCursor: expect.any(String) },
    });
  });

  it("maps an upstream outage to a retryable response after the memory cache expires", async () => {
    dbMock.enqueueFor("select", "countries", []);
    vi.spyOn(si2pem, "getFeatures").mockRejectedValue(new SI2PEMError(SI2PEM_ERROR_CODES.invalidResponse, "Invalid response"));
    const app = await createRouteHarness(getEmfInactiveSites);
    const response = await app.inject({ url: "/emf/inactive-sites" });
    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("60");
  });
});

describe("EMF country visibility", () => {
  it.each([
    [getEmfReports, `/emf/reports?${rawSite}`],
    [getEmfAntennas, `/emf/antennas?${rawSite}`],
    [getEmfMeasurements, "/emf/measurements"],
    [getEmfFilings, "/emf/filings"],
    [getEmfInactiveSites, "/emf/inactive-sites"],
  ] as const)("hides a route when Poland is unavailable: %s", async (route, url) => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    const app = await createRouteHarness(route);
    expect((await app.inject({ url })).statusCode).toBe(404);
  });
});
