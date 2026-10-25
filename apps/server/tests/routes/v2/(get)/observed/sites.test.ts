import { describe, expect, it } from "vitest";

import { PUBLIC_SITES_CACHE_CONTROL } from "../../../../../src/features/observed/sites/list.js";
import type { ApiToken } from "../../../../../src/interfaces/fastify.interface.js";
import { getRuntimeSettings, mergeRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import { userRole } from "../../../../../src/plugins/auth/permissions.js";
import route from "../../../../../src/routes/v2/(get)/observed/sites/[id].js";
import listRoute from "../../../../../src/routes/v2/(get)/observed/sites/index.js";
import mineRoute from "../../../../../src/routes/v2/(get)/observed/sites/mine.js";
import staffRoute from "../../../../../src/routes/v2/(get)/observed/sites/staff.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";
import { observedSiteRow, scriptSiteDetails } from "../../../../helpers/observedFixtures.js";
import { signInAs } from "../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/observed/sites/8124" };
const staff = { id: "44444444-4444-4444-8444-444444444444", username: "staff", name: "Staff Member", image: null };

function scriptAccess(role: "admin" | "editor", grants: object[] = []) {
  dbMock.enqueueFor("select", "users", [{ role }]);
  dbMock.enqueueFor("select", "role_grants", grants);
}

function scriptSite(row: ReturnType<typeof observedSiteRow>, role: "admin" | "editor", grants: object[] = []) {
  dbMock.enqueueFor("select", "observed_sites", [row]);
  scriptAccess(role, grants);
  scriptSiteDetails([row.id]);
}

function regionGrant(regionId: number) {
  return { countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId };
}

function scriptCellRecord(id: number, observedSiteId: number) {
  dbMock.enqueueFor("select", "observed_cells", [
    {
      cell: { id, plmn: "26006", rat: "LTE", cellKey: 31415 * 256 + 11, observedSiteId },
      site: { rat: "LTE", nodeId: 31415 },
      match: null,
      matchedCell: null,
      matchedBandValue: null,
      summary: { samples: 46, people: 2, squares: 38, firstSeenOn: "2026-10-28", lastSeenOn: "2026-11-03" },
      copyOfObservedCellId: null,
    },
  ]);
  dbMock.enqueueFor("select", "observed_cell_values", []);
  dbMock.enqueueFor("select", "cell_networks", []);
  dbMock.enqueueFor("select", "cell_shapes", []);
  dbMock.enqueueFor("select", "cell_level_profiles", []);
  dbMock.enqueueFor("select", "plmns", [{ code: "26006", operatorId: 4, countryCode: "PL" }]);
  dbMock.enqueueFor("select", "country_bands", []);
}

function refuseUsers() {
  authBoundary.getCurrentUser.mockResolvedValue(userSession());
  authBoundary.auth.api.userHasPermission.mockImplementation(async (input) => {
    const { permissions } = (input as { body: { permissions: Parameters<typeof userRole.authorize>[0] } }).body;
    return userRole.authorize(permissions);
  });
}

function signInAsUser() {
  refuseUsers();
  return { runAuth: true };
}

function scriptMeasured(siteIds: number[]) {
  dbMock.enqueueFor(
    "select",
    undefined,
    siteIds.map((id) => ({ id })),
  );
}

function switchObservationsOff() {
  Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: false }));
}

const linkedByStaff = { status: "matched", linkedBy: staff, linkedAt: new Date("2026-10-22T09:00:00Z") };
const ignoredByStaff = {
  notPublicReasons: ["ignored"],
  status: "ignored",
  linkStationId: null,
  ignore: { reason: "Femtocell", at: new Date() },
  ignoredBy: staff,
};

describe("GET /observed/sites/:id", () => {
  it("answers a fit with its radius and confidence, and no probability, privately", async () => {
    scriptSite(observedSiteRow(), "admin");
    const response = await injectMutation(route, request, signInAs("admin"));

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().data).toMatchObject({
      id: 8124,
      node: "enb",
      enbid: 31415,
      plmns: ["26006"],
      latitude: 50.05177,
      longitude: 19.92841,
      placement: {
        kind: "fit",
        radiusMeters: 206,
        confidence: 0.95,
        ellipse: { majorMeters: 240, minorMeters: 150, azimuthDegrees: 35 },
        alternative: null,
      },
      evidence: { samples: 9420, devices: 4, people: 3, squares: 611, timingAdvanceShare: 0.38 },
      status: "suggested",
      matchedStationId: null,
      suggestedStationId: 48870,
      firstSeenOn: "2026-10-28",
      lastSeenOn: "2026-11-03",
      estimatedAt: "2026-11-03T16:49:10.000Z",
    });
    expect(response.json().data.placement).not.toHaveProperty("probability");
    expect(response.json().data).not.toHaveProperty("gnbid");
  });

  it("answers a snap at its target's point with its probability and the place's address, and no radius", async () => {
    scriptSite(
      observedSiteRow({
        snapOfficialSiteId: 55210,
        snapProbability: 0.8612345,
        snapLatitude: 50.06412,
        snapLongitude: 19.94531,
        snapCity: "Kraków",
        snapAddress: "ul. Lubicz 23",
        status: "unmatched",
        linkStationId: null,
      }),
      "admin",
    );
    const { data } = (await injectMutation(route, request, signInAs("admin"))).json();

    expect(data).toMatchObject({
      latitude: 50.06412,
      longitude: 19.94531,
      placement: { kind: "officialSite", officialSiteId: 55210, probability: 0.861, city: "Kraków", address: "ul. Lubicz 23" },
    });
    expect(data.placement).not.toHaveProperty("radiusMeters");
    expect(data.evidence).toMatchObject({ samples: 9420 });
  });

  it("answers who ignored a site, why and when", async () => {
    const at = new Date("2026-10-21T08:30:00Z");
    scriptSite(observedSiteRow({ status: "ignored", linkStationId: null, ignore: { reason: "Femtocell", at }, ignoredBy: staff }), "admin");
    const { data } = (await injectMutation(route, request, signInAs("admin"))).json();

    expect(data).toMatchObject({ status: "ignored", ignore: { reason: "Femtocell", by: staff, at: at.toISOString() }, handLink: null });
  });

  it.each([
    [
      "an editor's link with who made it and when",
      { linkedBy: staff, linkedAt: new Date("2026-10-22T09:00:00Z") },
      { stationId: 48870, by: staff, at: "2026-10-22T09:00:00.000Z" },
    ],
    ["no hand link for the matcher's own link", { linkedBy: null, linkedAt: new Date("2026-10-22T09:00:00Z") }, null],
  ])("answers %s", async (_title, link, handLink) => {
    scriptSite(observedSiteRow({ status: "matched", ...link }), "admin");
    const { data } = (await injectMutation(route, request, signInAs("admin"))).json();

    expect(data).toMatchObject({ status: "matched", matchedStationId: 48870, handLink, ignore: null });
  });

  it("answers no ignore for a replaced site whose ignore row is still there", async () => {
    const replaced = {
      status: "replaced",
      retiredAt: new Date("2026-10-23T00:00:00Z"),
      ignore: { reason: "Femtocell", at: new Date() },
      ignoredBy: staff,
    };
    dbMock.enqueueFor("select", "site_replacements", []);
    scriptSite(observedSiteRow(replaced), "admin");

    expect((await injectMutation(route, request, signInAs("admin"))).json().data).toMatchObject({ status: "replaced", ignore: null });
  });

  it("shows an editor a site inside their grant with why it is not public, and hides one outside it that is not public", async () => {
    scriptSite(observedSiteRow({ notPublicReasons: ["unconfirmed", "possibleSmallCell"] }), "editor", [regionGrant(6)]);
    const inside = await injectMutation(route, request, signInAs("editor"));
    expect(inside.statusCode, inside.body).toBe(200);
    expect(inside.json().data).toMatchObject({ isPublic: false, notPublicReasons: ["unconfirmed", "possibleSmallCell"] });

    scriptSite(observedSiteRow({ notPublicReasons: ["unconfirmed"] }), "editor", [regionGrant(7)]);
    scriptMeasured([]);
    expectError(await injectMutation(route, request, signInAs("editor")), 404, "NOT_FOUND");
  });

  it("shows an editor a public site outside their grant as everyone sees it", async () => {
    scriptSite(observedSiteRow(linkedByStaff), "editor", [regionGrant(7)]);
    const response = await injectMutation(route, request, signInAs("editor"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.handLink).toEqual({ stationId: 48870, at: "2026-10-22T09:00:00.000Z" });
  });

  it("answers the site's own cells with include=cells", async () => {
    scriptAccess("admin");
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow()]);
    scriptSiteDetails([8124]);
    dbMock.enqueueFor("select", "observed_cells", [{ id: 50411 }]);
    scriptCellRecord(50411, 8124);
    const response = await injectMutation(route, { method: "GET", url: "/observed/sites/8124?include=cells" }, signInAs("admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.cells).toEqual([expect.objectContaining({ id: 50411, observedSiteId: 8124, rat: "lte", enbid: 31415, clid: 11 })]);
  });

  it("shows anyone a public site, leaving out who linked it and the editors' ignore", async () => {
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow(linkedByStaff)]);
    scriptSiteDetails([8124]);
    const response = await injectMutation(route, request, signInAsUser());

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    const { data } = response.json();
    expect(data).toMatchObject({ isPublic: true, handLink: { stationId: 48870 } });
    expect(data).not.toHaveProperty("ignore");
    expect(data.handLink).not.toHaveProperty("by");
  });

  it("shows you a site you measured that is not public, without who ignored it, and hides one you did not measure", async () => {
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow(ignoredByStaff)]);
    scriptSiteDetails([8124]);
    scriptMeasured([8124]);
    const response = await injectMutation(route, request, signInAsUser());
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ status: "ignored", isPublic: false });
    expect(response.json().data).not.toHaveProperty("ignore");

    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow({ notPublicReasons: ["unconfirmed"] })]);
    scriptSiteDetails([8124]);
    scriptMeasured([]);
    expectError(await injectMutation(route, request, signInAsUser()), 404, "NOT_FOUND");
  });

  it("hides a site you measured while its country does not publish observations", async () => {
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow({ notPublicReasons: ["privateCountry"], isCountryShown: false })]);
    scriptSiteDetails([8124]);
    expectError(await injectMutation(route, request, signInAsUser()), 404, "NOT_FOUND");
  });

  it("shows an API key public sites only, since a key measures nothing", async () => {
    const apiToken = { referenceId: userSession().user.id } as unknown as ApiToken;
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow()]);
    scriptSiteDetails([8124]);
    expect((await injectMutation(route, request, { apiToken })).statusCode).toBe(200);

    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow({ notPublicReasons: ["unconfirmed"] })]);
    scriptSiteDetails([8124]);
    expectError(await injectMutation(route, request, { apiToken }), 404, "NOT_FOUND");
  });

  it("refuses everyone but administrators while observations are off", async () => {
    switchObservationsOff();
    expectError(await injectMutation(route, request, signInAsUser()), 403, "FEATURE_DISABLED");
  });
});

describe("GET /observed/sites", () => {
  const list = (query = "") => ({ method: "GET" as const, url: `/observed/sites${query}` });

  it("answers everyone the same public sites, cacheable, without who linked them", async () => {
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow(linkedByStaff)]);
    scriptSiteDetails([8124]);
    const response = await injectMutation(listRoute, list(), signInAs("admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe(PUBLIC_SITES_CACHE_CONTROL);
    expect(response.json().data).toEqual([expect.objectContaining({ id: 8124, handLink: { stationId: 48870, at: "2026-10-22T09:00:00.000Z" } })]);
  });

  it("answers a guest, a person, an editor and an administrator byte for byte the same", async () => {
    const callers = [{}, signInAsUser(), signInAs("editor"), signInAs("admin")];
    const bodies: string[] = [];
    for (const caller of callers) {
      const row = observedSiteRow({ ...linkedByStaff, ignore: { reason: "Old", at: new Date(0) }, ignoredBy: staff });
      dbMock.enqueueFor("select", "observed_sites", [row]);
      scriptSiteDetails([8124]);
      // oxlint-disable-next-line no-await-in-loop
      bodies.push((await injectMutation(listRoute, list(), caller)).body);
    }

    expect(new Set(bodies).size).toBe(1);
    const [shown] = JSON.parse(bodies[0] ?? "{}").data;
    expect(shown).not.toHaveProperty("ignore");
    expect(shown.handLink).not.toHaveProperty("by");
  });

  it("refuses everyone while observations are off, administrators too", async () => {
    switchObservationsOff();
    const response = await injectMutation(listRoute, list(), signInAs("admin"));

    expectError(response, 403, "FEATURE_DISABLED");
    expect(response.headers["cache-control"]).not.toBe(PUBLIC_SITES_CACHE_CONTROL);
  });
});

describe("GET /observed/sites/mine", () => {
  const list = { method: "GET" as const, url: "/observed/sites/mine" };

  it("lists your sites that are not public, privately and as everyone sees them", async () => {
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow(ignoredByStaff)]);
    scriptSiteDetails([8124]);
    const response = await injectMutation(mineRoute, list, { session: userSession() });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().data).toEqual([expect.objectContaining({ id: 8124, status: "ignored" })]);
    expect(response.json().data[0]).not.toHaveProperty("ignore");
  });

  it("refuses a caller who is not signed in", async () => {
    expectError(await injectMutation(mineRoute, list), 401, "UNAUTHORIZED");
  });
});

describe("GET /observed/sites/staff", () => {
  const list = (query = "") => ({ method: "GET" as const, url: `/observed/sites/staff${query}` });

  it("pages the sites with the total, privately", async () => {
    scriptAccess("admin");
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow(), observedSiteRow({ id: 8120, primarySiteId: 8120 })]);
    dbMock.enqueueFor("select", undefined, [{ total: 2 }]);
    scriptSiteDetails([8124]);
    const response = await injectMutation(staffRoute, list("?limit=1&includeTotal=true"), signInAs("admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    const { data, paging } = response.json();
    expect(data.map((site: { id: number }) => site.id)).toEqual([8124]);
    expect(paging).toEqual({ limit: 1, nextCursor: expect.any(String), total: 2 });
  });

  it("answers who ignored a site", async () => {
    const at = new Date("2026-10-21T08:30:00Z");
    scriptAccess("admin");
    dbMock.enqueueFor("select", "observed_sites", [observedSiteRow({ ...ignoredByStaff, ignore: { reason: "Femtocell", at } })]);
    scriptSiteDetails([8124]);
    const { data } = (await injectMutation(staffRoute, list(), signInAs("admin"))).json();

    expect(data).toEqual([expect.objectContaining({ ignore: { reason: "Femtocell", by: staff, at: at.toISOString() } })]);
  });

  it("refuses someone who is neither an editor nor an administrator", async () => {
    refuseUsers();
    expectError(await injectMutation(staffRoute, list(), { runAuth: true }), 403, "INSUFFICIENT_PERMISSIONS");
  });
});
