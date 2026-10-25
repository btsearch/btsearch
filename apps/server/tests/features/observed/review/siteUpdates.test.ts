import { beforeEach, describe, expect, it, vi } from "vitest";

import route from "../../../../src/routes/v2/(patch)/observed/sites/[id].js";
import { dbMock, userSession } from "../../../helpers/boundaries.js";
import { scriptAccess } from "../../../helpers/flagFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../helpers/mutationAssertions.js";
import { written } from "../../../helpers/observedFixtures.js";
import { STAFF_ID, signInAs } from "../../../helpers/officialFixtures.js";
import { siteRecord } from "../../../helpers/siteRecordFixtures.js";
import { stationRow, visibleStation } from "../../../helpers/stationFixtures.js";

const loader = vi.hoisted(() => ({ loadObservedSites: vi.fn(), findNetworkOperators: vi.fn(), refreshSiteFlags: vi.fn() }));
vi.mock("../../../../src/features/observed/sites/read.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadObservedSites: loader.loadObservedSites,
}));
vi.mock("../../../../src/features/analyzer/match.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findNetworkOperators: loader.findNetworkOperators,
}));
vi.mock("../../../../src/features/observed/flags/sites/pass.js", () => ({ refreshSiteFlags: loader.refreshSiteFlags }));

const PLAY = "26006";
const PLAY_ID = 4;
const SITE_ID = 7310;
const STATION_ID = 40122;
const REASON = "Femtocell inside a shopping centre";
const lockedCell = (id: number, observedSiteId = SITE_ID) => ({ id, plmn: PLAY, rat: "LTE", cellKey: 24494 * 256 + 1, observedSiteId });
const linkedAt = new Date("2026-10-20T10:00:00.000Z");

function patch(payload: object, siteId = SITE_ID) {
  return { method: "PATCH" as const, url: `/observed/sites/${siteId}`, payload };
}

const asEditor = { session: userSession(STAFF_ID, "editor") };

function scriptLocks({ cells = [lockedCell(50911)], ignores = [] as object[], links = [] as object[] } = {}) {
  dbMock.enqueueFor("select", "observed_cells", cells);
  dbMock.enqueueFor("select", "site_ignores", ignores);
  dbMock.enqueueFor("select", "site_links", links);
}

function auditEntries() {
  return dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values as object[]);
}

function operationKind() {
  return (dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values as { kind?: string })?.kind;
}

describe("PATCH /observed/sites/:id", () => {
  beforeEach(() => {
    loader.loadObservedSites.mockReset();
    loader.findNetworkOperators.mockReset().mockResolvedValue(new Map([[PLAY, [PLAY_ID]]]));
    loader.refreshSiteFlags.mockReset().mockResolvedValue(undefined);
  });

  it("ignores a snapped site with its cells, the point it is shown at and its fit's radius", async () => {
    const snap = {
      target: { kind: "location" as const, locationId: 30560 },
      probability: 0.9,
      latitude: 53.1327,
      longitude: 23.1691,
      city: null,
      address: null,
    };
    const ignored = {
      observedSiteId: SITE_ID,
      ignoredById: STAFF_ID,
      reason: REASON,
      observedCellIds: [50911],
      point: { x: 23.1691, y: 53.1327 },
      uncertaintyM: 140,
    };
    loader.loadObservedSites.mockResolvedValueOnce([siteRecord({ snap })]).mockResolvedValueOnce([siteRecord({ snap, status: "ignored" })]);
    scriptAudit();
    scriptLocks();
    dbMock.enqueueFor("delete", "site_links", []);
    dbMock.enqueueFor("insert", "site_ignores", [{ ...ignored, ignoredAt: linkedAt }]);
    dbMock.enqueueFor("insert", "match_queue", []);

    const response = await injectMutation(route, patch({ ignore: { reason: ` ${REASON} ` } }), asEditor);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ id: SITE_ID, status: "ignored" });
    expect(written("insert", "site_ignores")).toEqual([[ignored]]);
    expect(written("insert", "match_queue")).toEqual([[{ observedCellId: 50911 }]]);
    expect(written("insert", "dirty_sites")).toEqual([]);
    expect(operationKind()).toBe("observations.site_ignore");
    expect(auditEntries()).toEqual([expect.objectContaining({ entity: "site_ignores", op: "create", record_id: String(SITE_ID) })]);
  });

  it("still answers with the changed site when refreshing its flags fails", async () => {
    loader.loadObservedSites.mockResolvedValueOnce([siteRecord()]).mockResolvedValueOnce([siteRecord({ status: "ignored" })]);
    loader.refreshSiteFlags.mockRejectedValue(new Error("flag pass down"));
    scriptAudit();
    scriptLocks();
    dbMock.enqueueFor("delete", "site_links", []);
    dbMock.enqueueFor("insert", "site_ignores", [{ observedSiteId: SITE_ID }]);
    dbMock.enqueueFor("insert", "match_queue", []);

    const response = await injectMutation(route, patch({ ignore: { reason: REASON } }), asEditor);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ id: SITE_ID, status: "ignored" });
  });

  it("ignores every member of a group, each with its own cells", async () => {
    const group = { leadSiteId: 7310, memberSiteIds: [7310, 7311] };
    loader.loadObservedSites.mockResolvedValue([siteRecord({ id: 7311, primarySiteId: 7311, group })]);
    scriptAudit();
    scriptLocks({ cells: [lockedCell(1, 7310), lockedCell(2, 7311), lockedCell(3, 7311)] });
    dbMock.enqueueFor("delete", "site_links", []);
    dbMock.enqueueFor("insert", "site_ignores", [{ observedSiteId: 7310 }, { observedSiteId: 7311 }]);
    dbMock.enqueueFor("insert", "match_queue", []);

    const response = await injectMutation(route, patch({ ignore: { reason: REASON } }, 7311), asEditor);

    expect(response.statusCode, response.body).toBe(200);
    expect(written("insert", "site_ignores")).toEqual([
      [
        expect.objectContaining({ observedSiteId: 7310, observedCellIds: [1] }),
        expect.objectContaining({ observedSiteId: 7311, observedCellIds: [2, 3] }),
      ],
    ]);
    expect(loader.refreshSiteFlags).toHaveBeenCalledWith([7310, 7311], STAFF_ID);
  });

  it("links a site by hand to a station that broadcasts its network, lifts its ignore and names the station in the audit", async () => {
    const ignore = {
      observedSiteId: SITE_ID,
      ignoredById: STAFF_ID,
      reason: REASON,
      ignoredAt: linkedAt,
      observedCellIds: [50911],
      point: null,
      uncertaintyM: null,
    };
    const link = { observedSiteId: SITE_ID, stationId: STATION_ID, kind: "matched", linkedById: STAFF_ID, linkedAt };
    loader.loadObservedSites
      .mockResolvedValueOnce([siteRecord({ status: "ignored" })])
      .mockResolvedValueOnce([siteRecord({ status: "matched", matchedStationId: STATION_ID })]);
    visibleStation(stationRow({ id: STATION_ID, operator_id: 3 }));
    dbMock.enqueueNetworks([{ cellId: 880345 }]);
    scriptAudit();
    dbMock.enqueueFor("insert", "audit_logs", []);
    scriptLocks({ ignores: [ignore] });
    dbMock.enqueueFor("insert", "site_links", [link]);
    dbMock.enqueueFor("delete", "site_ignores", [ignore]);
    dbMock.enqueueFor("insert", "match_queue", []);
    dbMock.enqueueFor("insert", "dirty_sites", []);

    const response = await injectMutation(route, patch({ handLink: { stationId: STATION_ID } }), asEditor);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ status: "matched", matchedStationId: STATION_ID });
    expect(written("insert", "site_links")).toEqual([[{ observedSiteId: SITE_ID, stationId: STATION_ID, kind: "matched", linkedById: STAFF_ID }]]);
    expect(written("insert", "dirty_sites")).toEqual([[{ observedSiteId: SITE_ID }]]);
    expect(operationKind()).toBe("observations.site_link");
    expect(auditEntries()).toEqual([
      expect.objectContaining({ entity: "site_links", op: "create", station_id: STATION_ID }),
      expect.objectContaining({ entity: "site_ignores", op: "delete", old_values: expect.objectContaining({ countryCode: "PL" }) }),
    ]);
  });

  it("refuses a station whose operator neither runs nor shares the network and that does not broadcast it", async () => {
    loader.loadObservedSites.mockResolvedValue([siteRecord()]);
    visibleStation(stationRow({ id: STATION_ID, operator_id: 3 }));

    const response = await injectMutation(route, patch({ handLink: { stationId: STATION_ID } }), asEditor);

    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([
      {
        field: "handLink/stationId",
        validationMessage: "The station's operator neither runs nor shares the site's network, and none of its cells broadcasts it",
      },
    ]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("answers 404 for a station you cannot see, naming the field", async () => {
    loader.loadObservedSites.mockResolvedValue([siteRecord()]);
    dbMock.enqueueFor("select", "stations", []);

    const response = await injectMutation(route, patch({ handLink: { stationId: STATION_ID } }), asEditor);

    expectError(response, 404, "NOT_FOUND", "No station you can see has this id");
    expect(response.json().errors[0].details).toEqual([{ field: "handLink/stationId" }]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("takes back a link made by hand, and the matcher's own link returns at once", async () => {
    const handLink = { observedSiteId: SITE_ID, stationId: STATION_ID, kind: "matched", linkedById: STAFF_ID, linkedAt };
    loader.loadObservedSites
      .mockResolvedValueOnce([siteRecord({ status: "matched", matchedStationId: STATION_ID })])
      .mockResolvedValueOnce([siteRecord({ status: "matched", matchedStationId: 20 })]);
    scriptAudit();
    scriptLocks({ links: [handLink] });
    dbMock.enqueueFor("delete", "site_links", [handLink]);
    dbMock.enqueueFor("select", "cell_matches", [
      { siteId: SITE_ID, siteRat: "LTE", cellRat: "LTE", matchedStationId: null, cellStationId: 20, cellCount: 1 },
    ]);
    dbMock.enqueueFor("select", "site_links", [], [{ observedSiteId: SITE_ID, stationId: 20, kind: "matched", linkedById: null }]);
    dbMock.enqueueFor("insert", "site_links", []);
    dbMock.enqueueFor("insert", "match_queue", []);
    dbMock.enqueueFor("insert", "dirty_sites", []);

    const response = await injectMutation(route, patch({ handLink: null }), asEditor);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ status: "matched", matchedStationId: 20 });
    expect(written("delete", "site_ignores")).toEqual([]);
    expect(written("insert", "site_links")).toEqual([[{ observedSiteId: SITE_ID, stationId: 20, kind: "matched" }]]);
    expect(operationKind()).toBe("observations.site_link");
    expect(auditEntries()).toEqual([expect.objectContaining({ entity: "site_links", op: "delete", station_id: STATION_ID })]);
  });

  it("takes back an ignore without touching links, and queues the cells for the matcher", async () => {
    const ignore = {
      observedSiteId: SITE_ID,
      ignoredById: STAFF_ID,
      reason: REASON,
      ignoredAt: linkedAt,
      observedCellIds: [50911],
      point: null,
      uncertaintyM: null,
    };
    loader.loadObservedSites.mockResolvedValueOnce([siteRecord({ status: "ignored" })]).mockResolvedValueOnce([siteRecord()]);
    scriptAudit();
    scriptLocks({ ignores: [ignore] });
    dbMock.enqueueFor("delete", "site_ignores", [ignore]);
    dbMock.enqueueFor("insert", "match_queue", []);

    const response = await injectMutation(route, patch({ ignore: null }), asEditor);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ status: "unmatched", ignore: null });
    expect(written("delete", "site_links")).toEqual([]);
    expect(written("insert", "match_queue")).toEqual([[{ observedCellId: 50911 }]]);
    expect(operationKind()).toBe("observations.site_ignore");
    expect(auditEntries()).toEqual([expect.objectContaining({ entity: "site_ignores", op: "delete", record_id: String(SITE_ID) })]);
  });

  it.each([
    [
      "a copy, naming the site it copies",
      { copyOfObservedSiteId: 9101, primarySiteId: 9101 },
      "A copy is changed through the site it copies",
      { kind: "copy", observedSiteId: 9101 },
    ],
    [
      "a replaced site, naming the sites that replaced it",
      { retiredAt: new Date("2026-10-22T00:00:00.000Z"), status: "replaced" as const, replacedByObservedSiteIds: [9420, 9421] },
      "The site was replaced by other sites",
      { kind: "replaced", replacedByObservedSiteIds: [9420, 9421] },
    ],
    [
      "a station's own site, naming the station",
      { stationId: 48230, rat: null, nodeId: null },
      "The site holds the cells of a station in the database and belongs to it",
      { kind: "stationSite", stationId: 48230 },
    ],
  ])("answers 409 for %s", async (_title, overrides, message, detail) => {
    loader.loadObservedSites.mockResolvedValue([siteRecord(overrides)]);

    const response = await injectMutation(route, patch({ ignore: { reason: REASON } }), asEditor);

    expectError(response, 409, "CONFLICT", message);
    expect(response.json().errors[0].details).toEqual([detail]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("refuses a body that both ignores the site and links it", async () => {
    const response = await injectMutation(route, patch({ ignore: { reason: REASON }, handLink: { stationId: STATION_ID } }), asEditor);

    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "handLink", validationMessage: "Send either `ignore` or `handLink`, not both" }]);
    expect(loader.loadObservedSites).not.toHaveBeenCalled();
  });

  describe("an editor's area", () => {
    function regionGrant(regionId: number) {
      return { countryCode: "PL", grantRole: "editor" as const, isCountryWide: false, regionId };
    }

    it("takes an editor inside it, and writes nothing when there is nothing to take back", async () => {
      const editor = signInAs("editor");
      scriptAccess("editor", [regionGrant(9)]);
      loader.loadObservedSites.mockResolvedValue([siteRecord()]);
      dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
      scriptLocks();
      dbMock.enqueueFor("delete", "site_ignores", []);
      dbMock.enqueueFor("delete", "audit_operations", []);

      const response = await injectMutation(route, patch({ ignore: null }), editor);

      expect(response.statusCode, response.body).toBe(200);
      expect(written("delete", "site_links")).toEqual([]);
      expect(written("insert", "audit_logs")).toEqual([]);
      expect(written("delete", "audit_operations")).toHaveLength(1);
    });

    it("refuses an editor outside it", async () => {
      const editor = signInAs("editor");
      scriptAccess("editor", [regionGrant(8)]);
      loader.loadObservedSites.mockResolvedValue([siteRecord()]);

      const response = await injectMutation(route, patch({ ignore: null }), editor);

      expectError(response, 403, "INSUFFICIENT_PERMISSIONS", "Your editor access does not cover this region");
      expect(dbMock.transaction).not.toHaveBeenCalled();
    });

    it("answers 404 to an editor for a site that does not exist", async () => {
      const editor = signInAs("editor");
      scriptAccess("editor", [regionGrant(9)]);
      loader.loadObservedSites.mockResolvedValue([]);

      expectError(await injectMutation(route, patch({ ignore: null }), editor), 404, "NOT_FOUND");
      expect(dbMock.transaction).not.toHaveBeenCalled();
    });
  });
});
