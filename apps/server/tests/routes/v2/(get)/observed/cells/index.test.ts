import { describe, expect, it } from "vitest";

import { userRole } from "../../../../../../src/plugins/auth/permissions.js";
import getObservedCell from "../../../../../../src/routes/v2/(get)/observed/cells/[id].js";
import getObservedCells from "../../../../../../src/routes/v2/(get)/observed/cells/index.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { injectMutation } from "../../../../../helpers/mutationAssertions.js";
import { observedSiteRow, scriptSiteDetails } from "../../../../../helpers/observedFixtures.js";
import { signInAs } from "../../../../../helpers/officialFixtures.js";

type Row = ReturnType<typeof cellRow>;
type Value = { field: string; value: number; sampleCount?: number; lastSeenOn?: string };
type Scripted = { row: Row; values?: Value[]; listed?: string[]; plan?: object[] };

const NETWORK = { code: "26006", operatorId: 4, countryCode: "PL" };
const B3 = { id: 3, value: 1800, rat: "LTE", name: "LTE 1800", duplex: "FDD", variant: "commercial", code: "B3" };
const B20 = { id: 20, value: 800, rat: "LTE", name: "LTE 800", duplex: "FDD", variant: "commercial", code: "B20" };
const N77 = { id: 77, value: 3700, rat: "NR", name: "NR 3700", duplex: "TDD", variant: "commercial", code: "n77" };
const N78 = { id: 78, value: 3500, rat: "NR", name: "NR 3500", duplex: "TDD", variant: "commercial", code: "n78" };

function cellRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    cell: { id, plmn: "26006", rat: "LTE", cellKey: 31_604_747, observedSiteId: 9205 },
    site: { rat: "LTE", nodeId: 123_456 },
    match: null as object | null,
    matchedCell: null as object | null,
    matchedBandValue: null as number | null,
    summary: { samples: 46, people: 2, squares: 38, firstSeenOn: "2026-10-22", lastSeenOn: "2026-10-30" },
    copyOfObservedCellId: null as number | null,
    ...overrides,
  };
}

function scriptRecords(cells: Scripted[], shapes: object[] = [], levels: object[] = []) {
  const valueRows = cells.flatMap(({ row, values = [] }) =>
    values.map((value) => ({ observedCellId: row.cell.id, sampleCount: 10, lastSeenOn: "2026-10-30", ...value })),
  );
  dbMock.enqueueFor(
    "select",
    "observed_cells",
    cells.map(({ row }) => row),
  );
  dbMock.enqueueFor("select", "observed_cell_values", valueRows);
  dbMock.enqueueFor(
    "select",
    "cell_networks",
    cells.flatMap(({ row, listed = [] }) => listed.map((plmn) => ({ observedCellId: row.cell.id, plmn }))),
  );
  dbMock.enqueueFor("select", "cell_shapes", shapes);
  dbMock.enqueueFor("select", "cell_level_profiles", levels);
  dbMock.enqueueFor("select", "plmns", [NETWORK]);
  dbMock.enqueueFor(
    "select",
    "country_bands",
    (cells[0]?.plan ?? []).map((band) => ({ countryCode: "PL", band })),
  );
}

function scriptEditor(regionId: number) {
  dbMock.enqueueFor("select", "countries", []);
  dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
  dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId }]);
}

async function listAsAdmin(cells: Scripted[], query = "") {
  dbMock.enqueueFor(
    "select",
    "observed_cells",
    cells.map(({ row }) => ({ id: row.cell.id })),
  );
  scriptRecords(cells);
  const response = await injectMutation(getObservedCells, { method: "GET", url: `/observed/cells${query}` }, signInAs("admin"));
  expect(response.statusCode, response.body).toBe(200);
  return response.json().data;
}

describe("GET /observed/cells/:id", () => {
  it("answers the latest value two people reported for each field, its own network first and the matched cell's band", async () => {
    const row = cellRow(50411, {
      match: { kind: "cell", networkMatch: "own", cellId: 880345, stationId: null },
      matchedCell: { stationId: 40077, bandId: 3 },
      matchedBandValue: 1800,
    });
    const footprint = {
      type: "Polygon",
      coordinates: [
        [
          [19.9, 50.0],
          [19.95, 50.02],
          [19.92, 50.05],
          [19.9, 50.0],
        ],
      ],
    };
    dbMock.enqueueFor("select", "observed_cells", [{ id: 50411 }]);
    scriptRecords(
      [
        {
          row,
          values: [
            { field: "areaCode", value: 7201, sampleCount: 30, lastSeenOn: "2026-10-20" },
            { field: "areaCode", value: 7202, sampleCount: 5, lastSeenOn: "2026-10-30" },
            { field: "pci", value: 214, sampleCount: 40 },
            { field: "pci", value: 301, sampleCount: 6 },
            { field: "channel", value: 1300 },
            { field: "ulChannel", value: 19300 },
            { field: "bandwidth", value: 20000 },
            { field: "ulBandwidth", value: 20000 },
            { field: "reportedBand", value: 7 },
            { field: "reportedBand", value: 3 },
            { field: "endcAvailable", value: 1 },
            { field: "barred", value: 0 },
          ],
          listed: ["26003", "26006"],
        },
      ],
      [
        {
          observedCellId: 50411,
          shapeVersion: 1,
          bearingDeg: 128.39999389648438,
          spreadDeg: 74,
          reachM: 6100,
          reachTaM: 7400,
          meanQualityCentiDb: -1040,
          meanSinrCentiDb: 1120,
          footprint: JSON.stringify(footprint),
        },
      ],
      [
        { observedCellId: 50411, shapeVersion: 1, distanceBand: 0, meanLevelCentiDb: -7100, meanSinrCentiDb: 1950 },
        { observedCellId: 50411, shapeVersion: 1, distanceBand: 1, meanLevelCentiDb: -7900, meanSinrCentiDb: null },
      ],
    );

    const response = await injectMutation(getObservedCell, { method: "GET", url: "/observed/cells/50411?include=footprint" }, signInAs("admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual({
      id: 50411,
      observedSiteId: 9205,
      plmns: ["26006", "26003"],
      copyOfObservedCellId: null,
      operatorId: 4,
      bandId: 3,
      bandwidthKhz: 20000,
      reportedBandNumbers: [3, 7],
      ulBandwidthKhz: null,
      supportsEndc: true,
      isAccessClosed: null,
      isBarred: false,
      isReservedForOperatorUse: null,
      sampleCount: 46,
      personCount: 2,
      squareCount: 38,
      firstSeenOn: "2026-10-22",
      lastSeenOn: "2026-10-30",
      match: "cell",
      networkMatch: "own",
      matchedCellId: 880345,
      matchedStationId: 40077,
      geometry: {
        bearingDegrees: 128.4,
        spreadDegrees: 74,
        reachMeters: 6100,
        reachByTimingAdvanceMeters: 7400,
        meanRsrqDb: -10.4,
        meanSinrDb: 11.2,
        levelByDistance: [
          { fromMeters: 0, toMeters: 250, meanDbm: -71, meanSinrDb: 19.5 },
          { fromMeters: 250, toMeters: 500, meanDbm: -79, meanSinrDb: null },
        ],
      },
      footprint,
      rat: "lte",
      eci: 31_604_747,
      enbid: 123_456,
      clid: 11,
      tac: 7202,
      pci: 214,
      earfcn: 1300,
      ulEarfcn: null,
    });
  });
});

describe("GET /observed/cells/:id?include=observedSite", () => {
  const request = { method: "GET" as const, url: "/observed/cells/50411?include=observedSite" };

  it("answers the cell's site to an administrator", async () => {
    dbMock.enqueueFor("select", "observed_cells", [{ id: 50411 }]);
    scriptRecords([{ row: cellRow(50411) }]);
    dbMock.enqueueFor("select", "users", [{ role: "admin" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow({ id: 9205, primarySiteId: 9205 })]);
    scriptSiteDetails([9205]);
    const response = await injectMutation(getObservedCell, request, signInAs("admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().data.observedSite).toMatchObject({ id: 9205, enbid: 31415, status: "suggested", latitude: 50.05177 });
  });

  it("answers an editor a public site outside their grants as everyone sees it", async () => {
    scriptEditor(7);
    dbMock.enqueueFor("select", "observed_cells", [{ id: 50411 }]);
    scriptRecords([{ row: cellRow(50411) }]);
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow({ id: 9205, primarySiteId: 9205, regionId: 6 })]);
    scriptSiteDetails([9205]);
    const response = await injectMutation(getObservedCell, request, signInAs("editor"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.observedSite).toMatchObject({ id: 9205, isPublic: true });
    expect(response.json().data.observedSite).not.toHaveProperty("ignore");
  });

  it("leaves out a site you may not see, for a user who did not measure it", async () => {
    authBoundary.getCurrentUser.mockResolvedValue(userSession());
    authBoundary.auth.api.userHasPermission.mockImplementation(async (input) => {
      const { permissions } = (input as { body: { permissions: Parameters<typeof userRole.authorize>[0] } }).body;
      return userRole.authorize(permissions);
    });
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "observed_cells", [{ id: 50411 }]);
    scriptRecords([{ row: cellRow(50411) }]);
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow({ id: 9205, primarySiteId: 9205, notPublicReasons: ["unconfirmed"] })]);
    scriptSiteDetails([9205]);
    dbMock.enqueueFor("select", "cell_contributors", []);
    const response = await injectMutation(getObservedCell, request, { runAuth: true });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ id: 50411, observedSiteId: 9205 });
    expect(response.json().data).not.toHaveProperty("observedSite");
  });
});

describe("GET /observed/cells", () => {
  it("shows an uplink only where it differs from what the band implies", async () => {
    const data = await listAsAdmin([
      {
        row: cellRow(1),
        values: [
          { field: "channel", value: 1300 },
          { field: "ulChannel", value: 19400 },
          { field: "bandwidth", value: 20000 },
          { field: "ulBandwidth", value: 10000 },
        ],
      },
      {
        row: cellRow(2, { cell: { id: 2, plmn: "26006", rat: "NR", cellKey: 256_005, observedSiteId: 9300 }, site: { rat: "NR", nodeId: 1000 } }),
        values: [
          { field: "channel", value: 640_000 },
          { field: "ulChannel", value: 640_000 },
        ],
      },
    ]);

    expect(data.map(({ ulEarfcn, ulArfcn, ulBandwidthKhz }: Record<string, unknown>) => ({ ulEarfcn, ulArfcn, ulBandwidthKhz }))).toEqual([
      { ulEarfcn: 19400, ulArfcn: undefined, ulBandwidthKhz: 10000 },
      { ulEarfcn: undefined, ulArfcn: null, ulBandwidthKhz: null },
    ]);
  });

  it("cuts an NR cell's identity as its site was cut", async () => {
    const [nr] = await listAsAdmin([
      {
        row: cellRow(2, {
          cell: { id: 2, plmn: "26006", rat: "NR", cellKey: 1000 * 2 ** 8 + 5, observedSiteId: 9300 },
          site: { rat: "NR", nodeId: 1000 },
        }),
      },
    ]);

    expect(nr).toMatchObject({ rat: "nr", nci: 256_005, gnbid: 1000, clid: 5 });
  });

  it("takes an unmatched cell's band from the plan of its network's country, and none when two bands of the plan hold the channel", async () => {
    const lte = await listAsAdmin([{ row: cellRow(1), values: [{ field: "channel", value: 1300 }], plan: [B3, B20] }]);
    const nr = await listAsAdmin([
      {
        row: cellRow(2, { cell: { id: 2, plmn: "26006", rat: "NR", cellKey: 256_005, observedSiteId: 9300 }, site: { rat: "NR", nodeId: 1000 } }),
        values: [{ field: "channel", value: 640_000 }],
        plan: [N77, N78],
      },
    ]);

    expect(lte[0].bandId).toBe(3);
    expect(nr[0].bandId).toBeNull();
  });
});
