import { stationCreateSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditRecorder } from "../../../../src/features/audit/index.js";
import { createStationFromSite } from "../../../../src/features/observed/review/stationFromSite.js";
import type * as stationEdits from "../../../../src/features/stations/edit.js";
import type { AppliedChange } from "../../../../src/features/submissions/actions.js";
import route from "../../../../src/routes/v2/(post)/observed/sites/[id]/station.js";
import { authBoundary, dbMock, userSession } from "../../../helpers/boundaries.js";
import { scriptAccess } from "../../../helpers/flagFixtures.js";
import { expectError, injectMutation } from "../../../helpers/mutationAssertions.js";
import { written } from "../../../helpers/observedFixtures.js";
import { STAFF_ID, signInAs } from "../../../helpers/officialFixtures.js";
import { siteRecord } from "../../../helpers/siteRecordFixtures.js";

const mocks = vi.hoisted(() => ({
  loadObservedSites: vi.fn(),
  findNetworkOperators: vi.fn(),
  matchCellsNow: vi.fn(),
  applyStationChange: vi.fn(),
  refreshSiteFlags: vi.fn(),
}));
vi.mock("../../../../src/features/observed/sites/read.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadObservedSites: mocks.loadObservedSites,
}));
vi.mock("../../../../src/features/analyzer/match.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findNetworkOperators: mocks.findNetworkOperators,
}));
vi.mock("../../../../src/features/observed/cells/matching.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  matchCellsNow: mocks.matchCellsNow,
}));
vi.mock("../../../../src/features/observed/flags/sites/pass.js", () => ({ refreshSiteFlags: mocks.refreshSiteFlags }));
vi.mock("../../../../src/features/stations/edit.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  applyStationChange: mocks.applyStationChange,
}));

const PLAY = "26006";
const PLAY_ID = 4;
const LEAD_ID = 7310;
const MEMBER_ID = 7311;
const STATION_ID = 48230;
const FLAG_ID = 3301;
const FIT = { latitude: 53.13251, longitude: 23.16884 };
const ALTERNATIVE = { latitude: 53.14, longitude: 23.17 };
const CANDIDATE = { latitude: 53.133, longitude: 23.169 };
const NOWHERE = { latitude: 53.134, longitude: 23.175 };
const lteCell = { bandId: 3, rat: "lte", plmns: [PLAY], tac: 51010, enbid: 24494, clid: 1, pci: 101, earfcn: 1850 };
const editorRequest = { userSession: userSession(STAFF_ID, "editor") } as unknown as FastifyRequest;

function bodyAt(location: { latitude: number; longitude: number } | null, cells: object[] = [lteCell], operatorId = PLAY_ID) {
  return stationCreateSchema.parse({ station: { operatorId }, ...(location === null ? {} : { location }), cells });
}

const recorder = { operationId: 9, tx: dbMock, entryMetadata: null, log: vi.fn(), logMany: vi.fn(), withEntryMetadata: vi.fn() };

function applyLikeTheEditorRoute() {
  mocks.applyStationChange.mockImplementation(async (_req, _edit, _kind, operation: Parameters<typeof stationEdits.applyStationChange>[3]) => {
    const audit = recorder as unknown as AuditRecorder;
    const applied = { stationId: STATION_ID, attachmentUuidsToDelete: [], photosAdded: false } as unknown as AppliedChange;
    await operation?.beforeChange?.(audit);
    await operation?.afterChange?.(audit, applied);
    return applied;
  });
}

function scriptStationsOfSite({ links = [] as object[], origins = [] as object[] } = {}) {
  dbMock.enqueueFor("select", "site_links", links);
  dbMock.enqueueFor("select", "station_origins", origins);
}

function scriptPreparation(stationsOfSite: Parameters<typeof scriptStationsOfSite>[0] = {}) {
  const tested = { locationId: 30551, officialSiteId: null, observedSiteId: null, difference: 0.4, probability: 0.52, isSnap: true, ...CANDIDATE };
  scriptStationsOfSite(stationsOfSite);
  dbMock.enqueueFor("select", "snap_tests", [tested]);
  dbMock.enqueueFor("select", "observation_flags", [{ id: FLAG_ID }]);
}

function scriptLocks(cells: object[], stationsOfSite: Parameters<typeof scriptStationsOfSite>[0] = {}) {
  dbMock.enqueueFor("select", "observed_cells", cells);
  dbMock.enqueueFor("select", "observed_sites", []);
  scriptStationsOfSite(stationsOfSite);
}

function scriptOperation(cells: object[] = [{ id: 50911, plmn: PLAY, rat: "LTE", cellKey: 24494 * 256 + 1, observedSiteId: LEAD_ID }]) {
  scriptLocks(cells);
  dbMock.enqueueFor("insert", "station_origins", []);
  dbMock.enqueueFor("select", "observation_flags", [{ id: FLAG_ID, observedCellId: null, observedSiteId: LEAD_ID }]);
  dbMock.enqueueFor("update", "observation_flags", []);
  dbMock.enqueueFor("select", "observed_cells", [{ id: 50911 }]);
  dbMock.enqueueFor("delete", "site_ignores", []);
  dbMock.enqueueFor("insert", "match_queue", [], []);
}

function stationOrigins() {
  return written("insert", "station_origins");
}

describe("POST /observed/sites/:id/station", () => {
  beforeEach(() => {
    mocks.loadObservedSites.mockReset().mockResolvedValue([siteRecord()]);
    mocks.findNetworkOperators.mockReset().mockResolvedValue(new Map([[PLAY, [PLAY_ID]]]));
    mocks.matchCellsNow.mockReset().mockResolvedValue(undefined);
    mocks.applyStationChange.mockReset();
    mocks.refreshSiteFlags.mockReset().mockResolvedValue(undefined);
    applyLikeTheEditorRoute();
  });

  it("creates the station as POST /stations does, in one station.create operation that names the site and closes its flag", async () => {
    scriptPreparation();
    scriptOperation();

    await expect(createStationFromSite(editorRequest, LEAD_ID, bodyAt(FIT))).resolves.toBe(STATION_ID);

    const [, edit, kind, operation] = mocks.applyStationChange.mock.calls[0] ?? [];
    expect(kind).toBe("station.create");
    expect(edit).toEqual({
      action: "create",
      station: { operatorId: PLAY_ID },
      location: FIT,
      sectors: undefined,
      cells: [{ action: "create", ...lteCell }],
    });
    expect(operation.metadata).toEqual({ observed_site_id: LEAD_ID, observation_flag_ids: [FLAG_ID] });
    expect(written("update", "observation_flags")).toEqual([expect.objectContaining({ closedReason: "applied", resolvedById: STAFF_ID })]);
    expect(written("insert", "match_queue").at(-1)).toEqual([{ observedCellId: 50911 }]);
    expect(mocks.matchCellsNow).toHaveBeenCalledWith([50911]);
  });

  it("leaves the flag open when the station cannot be created", async () => {
    scriptPreparation();
    mocks.applyStationChange.mockRejectedValue(new Error("The station cannot be created"));

    await expect(createStationFromSite(editorRequest, LEAD_ID, bodyAt(FIT))).rejects.toThrow("The station cannot be created");
    expect(written("update", "observation_flags")).toEqual([]);
    expect(mocks.matchCellsNow).not.toHaveBeenCalled();
  });

  it.each([
    ["snapped", "on a place the estimate was tested against", CANDIDATE],
    ["estimate", "within 10 m of the fit", { latitude: FIT.latitude + 0.00005, longitude: FIT.longitude }],
    ["estimate", "on the fit's alternative point", ALTERNATIVE],
    ["editor", "anywhere else", NOWHERE],
  ])("records the coordinates as %s when the location lies %s", async (coordinatesFrom, _where, location) => {
    const { estimate } = siteRecord();
    mocks.loadObservedSites.mockResolvedValue([siteRecord({ estimate: estimate && { ...estimate, alternative: ALTERNATIVE } })]);
    scriptPreparation();
    scriptOperation();

    await createStationFromSite(editorRequest, LEAD_ID, bodyAt(location));

    expect(stationOrigins()).toEqual([{ stationId: STATION_ID, observedSiteId: LEAD_ID, coordinatesFrom }]);
  });

  it("makes one station for a whole group from any member, records the lead and matches every member's cells", async () => {
    const group = { leadSiteId: LEAD_ID, memberSiteIds: [LEAD_ID, MEMBER_ID] };
    const cells = [
      { id: 50911, plmn: PLAY, rat: "LTE", cellKey: 24494 * 256 + 1, observedSiteId: LEAD_ID },
      { id: 50912, plmn: PLAY, rat: "LTE", cellKey: 24495 * 256 + 11, observedSiteId: MEMBER_ID },
    ];
    mocks.loadObservedSites.mockResolvedValue([siteRecord({ id: MEMBER_ID, primarySiteId: MEMBER_ID, group })]);
    scriptPreparation();
    scriptOperation(cells);

    await createStationFromSite(editorRequest, MEMBER_ID, bodyAt(FIT));

    expect(mocks.applyStationChange.mock.calls[0]?.[3].metadata).toMatchObject({ observed_site_id: LEAD_ID });
    expect(stationOrigins()).toEqual([expect.objectContaining({ observedSiteId: LEAD_ID })]);
    expect(mocks.matchCellsNow).toHaveBeenCalledWith([50911, 50912]);
    expect(mocks.refreshSiteFlags).toHaveBeenCalledWith([LEAD_ID, MEMBER_ID], STAFF_ID);
  });

  it("still answers with the new station when matching it at once fails, leaving the cells queued", async () => {
    scriptPreparation();
    scriptOperation();
    mocks.matchCellsNow.mockRejectedValue(new Error("matcher down"));

    await expect(createStationFromSite(editorRequest, LEAD_ID, bodyAt(FIT))).resolves.toBe(STATION_ID);
    expect(written("insert", "match_queue").at(-1)).toEqual([{ observedCellId: 50911 }]);
  });

  it("still answers with the new station when refreshing the site's flags fails", async () => {
    scriptPreparation();
    scriptOperation();
    mocks.refreshSiteFlags.mockRejectedValue(new Error("flag pass down"));

    await expect(createStationFromSite(editorRequest, LEAD_ID, bodyAt(FIT))).resolves.toBe(STATION_ID);
  });

  it("answers a retry after a lost response, whose cells were matched at once, with 409 naming the station the first request made", async () => {
    mocks.loadObservedSites.mockResolvedValue([siteRecord({ status: "matched", matchedStationId: STATION_ID })]);
    scriptPreparation({ origins: [{ stationId: STATION_ID }], links: [{ stationId: STATION_ID }] });

    await expect(createStationFromSite(editorRequest, LEAD_ID, bodyAt(FIT))).rejects.toMatchObject({
      statusCode: 409,
      message: "A station was made from this site already",
      details: [{ kind: "madeFromSite", stationId: STATION_ID }],
    });
    expect(mocks.applyStationChange).not.toHaveBeenCalled();
  });

  it.each([
    ["made a station from the site", { origins: [{ stationId: 48231 }] }, "A station was made from this site already", "madeFromSite"],
    ["linked the site to a station", { links: [{ stationId: 48231 }] }, "The site is matched to a station already", "matched"],
  ])("answers 409 naming the station when a request that %s committed first, and writes nothing", async (_title, stationsOfSite, message, kind) => {
    scriptPreparation();
    scriptLocks([{ id: 50911, plmn: PLAY, rat: "LTE", cellKey: 24494 * 256 + 1, observedSiteId: LEAD_ID }], stationsOfSite);

    await expect(createStationFromSite(editorRequest, LEAD_ID, bodyAt(FIT))).rejects.toMatchObject({
      statusCode: 409,
      message,
      details: [{ kind, stationId: 48231 }],
    });
    expect(stationOrigins()).toEqual([]);
    expect(mocks.matchCellsNow).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a copy",
      { copyOfObservedSiteId: 9101, primarySiteId: 9101 },
      "A copy is changed through the site it copies",
      { kind: "copy", observedSiteId: 9101 },
    ],
    [
      "a replaced site",
      { retiredAt: new Date("2026-10-22T00:00:00.000Z"), status: "replaced" as const, replacedByObservedSiteIds: [9420] },
      "The site was replaced by other sites",
      { kind: "replaced", replacedByObservedSiteIds: [9420] },
    ],
  ])("answers 409 for %s", async (_title, overrides, message, detail) => {
    mocks.loadObservedSites.mockResolvedValue([siteRecord(overrides)]);

    await expect(createStationFromSite(editorRequest, LEAD_ID, bodyAt(FIT))).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
      message,
      details: [detail],
    });
    expect(mocks.applyStationChange).not.toHaveBeenCalled();
  });

  it.each([
    ["without a location", bodyAt(null), "location", "A station made from an estimated site needs a location"],
    [
      "for an operator that neither runs nor shares the network, nor broadcasts it from its stations",
      bodyAt(FIT, [lteCell], 3),
      "station/operatorId",
      "The operator neither runs nor shares the site's network, and none of its stations broadcasts it",
    ],
  ])("answers 400 %s", async (_title, body, field, validationMessage) => {
    await expect(createStationFromSite(editorRequest, LEAD_ID, body)).rejects.toMatchObject({
      statusCode: 400,
      details: [{ field, validationMessage }],
    });
    expect(mocks.applyStationChange).not.toHaveBeenCalled();
  });

  it("takes an operator whose stations broadcast the network", async () => {
    dbMock.enqueueNetworks([{ cellId: 880345 }]);
    scriptPreparation();
    scriptOperation();

    await expect(createStationFromSite(editorRequest, LEAD_ID, bodyAt(FIT, [lteCell], 3))).resolves.toBe(STATION_ID);
  });

  it("answers 403 to an editor without create:cells who sends cells", async () => {
    const actual = await vi.importActual<typeof stationEdits>("../../../../src/features/stations/edit.js");
    mocks.applyStationChange.mockImplementation(actual.applyStationChange);
    authBoundary.auth.api.userHasPermission.mockImplementation(async (input) => {
      const { permissions } = (input as { body: { permissions: Record<string, string[]> } }).body;
      return { success: permissions.cells === undefined };
    });
    scriptPreparation();

    const request = { method: "POST" as const, url: `/observed/sites/${LEAD_ID}/station`, payload: bodyAt(FIT) };
    expectError(await injectMutation(route, request, { session: userSession(STAFF_ID, "editor") }), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("answers 403 to an editor whose grants do not cover the destination", async () => {
    const editor = signInAs("editor");
    scriptAccess("editor", [{ countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId: 7 }]);
    dbMock.enqueueFor("select", "observed_sites", [{ id: LEAD_ID }]);
    dbMock.enqueueFor("select", "locations", []);
    dbMock.enqueueFor("execute", undefined, [{ regionId: 8 }]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL", regionId: 8 }]);

    const request = { method: "POST" as const, url: `/observed/sites/${LEAD_ID}/station`, payload: bodyAt(FIT) };
    expectError(await injectMutation(route, request, editor), 403, "INSUFFICIENT_PERMISSIONS", "Your editor access does not cover this region");
    expect(mocks.loadObservedSites).not.toHaveBeenCalled();
  });

  it("answers 404 to an editor for a site that does not exist", async () => {
    const editor = signInAs("editor");
    scriptAccess("editor", [{ countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId: 7 }]);
    dbMock.enqueueFor("select", "observed_sites", []);

    const request = { method: "POST" as const, url: `/observed/sites/${LEAD_ID}/station`, payload: bodyAt(FIT) };
    expectError(await injectMutation(route, request, editor), 404, "NOT_FOUND");
    expect(mocks.loadObservedSites).not.toHaveBeenCalled();
  });
});
