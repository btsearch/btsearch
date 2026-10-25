import { dbMock, queryOf } from "./boundaries.js";
import { operatorRow, primaryPlmn } from "./operatorFixtures.js";

type Network = { operatorId?: number; countryCode?: string; countryTools?: string[] };

export function scriptNetwork(code: string, { operatorId = 1, countryCode = "PL", countryTools = ["analyzer"] }: Network = {}): void {
  dbMock.enqueueFor("select", "plmns", [{ code, operatorId, countryCode, countryTools }]);
  dbMock.enqueueFor("select", "operator_links", []);
  dbMock.enqueueFor("select", "operators", [operatorRow(operatorId, null, countryCode)], []);
  dbMock.enqueueFor("select", "plmns", [primaryPlmn(operatorId, code)], []);
  dbMock.enqueueFor("select", "operator_links", []);
}

export function scriptMatcherLocks(transactions = 1): void {
  dbMock.enqueueFor("execute", undefined, ...Array.from({ length: transactions }, () => []));
}

export function written(operation: string, table: string): unknown[] {
  return dbMock.calls.filter((call) => call.operation === operation && call.table === table).map((call) => call.values);
}

export function writes(): unknown[] {
  return dbMock.calls
    .filter((call) => ["insert", "update", "delete"].includes(call.operation))
    .map((call) => [call.operation, call.table, call.values]);
}

export function movedCells(): unknown[][] {
  return dbMock.calls
    .filter((call) => call.operation === "update" && call.table === "observed_cells")
    .flatMap((call) => {
      const params = queryOf(call.clauses.from?.[0]).params;
      return params.flatMap((cellId, index) => (index % 2 === 0 ? [[cellId, params[index + 1]]] : []));
    });
}

export function observedSiteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 8124,
    plmn: "26006",
    rat: "LTE",
    nodeId: 31415,
    stationId: null,
    retiredAt: null,
    primarySiteId: 8124,
    copyOfObservedSiteId: null,
    leadSiteId: null,
    algorithmVersion: 1,
    estimateOf: "site",
    calibrationRunId: 41,
    estimatedAt: new Date("2026-11-03T16:49:10Z"),
    latitude: 50.05177,
    longitude: 19.92841,
    uncertaintyM: 206,
    ellipseMajorM: 240,
    ellipseMinorM: 150,
    ellipseAzimuthDeg: 35,
    alternativeLatitude: null,
    alternativeLongitude: null,
    isConsistent: true,
    sampleCount: "9420",
    contributorCount: 4,
    personCount: 3,
    binCount: 611,
    taSampleCount: "3580",
    angularCoverageDeg: 230,
    distinctDays: 11,
    maxDistanceM: 4200,
    snapLocationId: null,
    snapOfficialSiteId: null,
    snapObservedSiteId: null,
    snapProbability: null,
    snapLatitude: null,
    snapLongitude: null,
    snapCity: null,
    snapAddress: null,
    status: "suggested",
    linkStationId: 48870,
    linkedBy: null,
    linkedAt: null,
    ignore: null,
    ignoredBy: null,
    isConfirmed: true,
    notPublicReasons: [] as string[],
    isCountryShown: true,
    countryCode: "PL",
    regionId: 6,
    ...overrides,
  };
}

export function scriptSiteDetails(siteIds: readonly number[]): void {
  dbMock.enqueueFor("select", "cell_networks", []);
  dbMock.enqueueFor(
    "select",
    "observed_cells",
    siteIds.map((siteId) => ({ siteId, firstSeenOn: "2026-10-28", lastSeenOn: "2026-11-03" })),
  );
  dbMock.enqueueFor("select", "plmns", []);
}
