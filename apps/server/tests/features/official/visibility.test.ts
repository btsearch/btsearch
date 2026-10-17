import { microwaveLinks, officialLocations, officialSites, officialSources } from "@openbts/drizzle";
import { type SQL, getTableUniqueName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import { loadHiddenCountryCodes, loadVisibleCountryCodes } from "../../../src/features/countries/visibility.js";
import {
  type OfficialVisibility,
  loadOfficialVisibility,
  loadPublicOfficialVisibility,
  loadPublicSiteSourceNames,
  microwaveLinkIsPublic,
  officialLocationIsPublic,
} from "../../../src/features/official/visibility.js";
import { authBoundary, cacheInRedis, dbMock, redisMock, userSession } from "../../helpers/boundaries.js";

const dialect = new PgDialect();
const sourcesTable = getTableUniqueName(officialSources);
const userId = userSession().user.id;

const everything: OfficialVisibility = { sourceIds: null, hiddenCountryCodes: [] };
const publicView: OfficialVisibility = { sourceIds: [1], hiddenCountryCodes: ["XX"] };

const guest = { userSession: null, apiToken: null } as unknown as FastifyRequest;
function signedIn(role: "user" | "editor" | "admin"): FastifyRequest {
  return { userSession: userSession(undefined, role), apiToken: null } as unknown as FastifyRequest;
}

function rendered(condition: SQL | undefined) {
  if (!condition) return undefined;
  const { sql, params } = dialect.sqlToQuery(condition);
  return { sql: sql.replace(/\s+/g, " "), params };
}

function sourcesQuery() {
  const call = dbMock.calls.find((candidate) => candidate.table === sourcesTable);
  return rendered(call?.clauses.where?.[0] as SQL | undefined);
}

const storedCountries = [
  { code: "PL", isVisible: true },
  { code: "XX", isVisible: false },
];
const storedSources = [
  { id: 1, countryCode: "PL", isVisible: true, layers: ["sites", "microwave_links"] },
  { id: 2, countryCode: "XX", isVisible: true, layers: ["sites"] },
  { id: 3, countryCode: "PL", isVisible: false, layers: [] },
];
const maintainerOfXX = [{ countryCode: "XX", grantRole: "maintainer", isCountryWide: true, regionId: null }];

function scriptStoredLists() {
  dbMock.enqueueFor("select", "countries", storedCountries);
  dbMock.enqueueFor("select", sourcesTable, storedSources);
}

describe("loadOfficialVisibility", () => {
  it("gives a guest the visible sources outside the hidden countries", async () => {
    scriptStoredLists();

    expect(await loadOfficialVisibility(guest)).toEqual({ sourceIds: [1], hiddenCountryCodes: ["XX"] });
    expect(sourcesQuery()).toBeUndefined();
    expect(authBoundary.auth.api.userHasPermission).not.toHaveBeenCalled();
  });

  it("gives a signed-in user without grants the same view as a guest", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    scriptStoredLists();
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);

    expect(await loadOfficialVisibility(signedIn("user"))).toEqual({ sourceIds: [1], hiddenCountryCodes: ["XX"] });
    expect(authBoundary.auth.api.userHasPermission).toHaveBeenCalledWith({ body: { userId, permissions: { official_import: ["read"] } } });
  });

  it("lets a maintainer of a hidden country see its visible sources, never the hidden ones", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    scriptStoredLists();
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", maintainerOfXX);

    expect(await loadOfficialVisibility(signedIn("editor"))).toEqual({ sourceIds: [1, 2], hiddenCountryCodes: [] });
  });

  it("lets an administrator see every source and country, hidden or not", async () => {
    scriptStoredLists();
    dbMock.enqueueFor("select", "users", [{ role: "admin" }]);
    dbMock.enqueueFor("select", "role_grants", []);

    expect(await loadOfficialVisibility(signedIn("admin"))).toEqual(everything);
  });

  it("reads both lists once and filters the cached copies for every later caller", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    scriptStoredLists();
    expect(await loadOfficialVisibility(guest)).toEqual({ sourceIds: [1], hiddenCountryCodes: ["XX"] });

    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", maintainerOfXX);
    expect(await loadOfficialVisibility(signedIn("editor"))).toEqual({ sourceIds: [1, 2], hiddenCountryCodes: [] });
    expect(await loadPublicOfficialVisibility()).toEqual({ sourceIds: [1], hiddenCountryCodes: ["XX"] });

    const listReads = dbMock.calls.map((call) => call.table).filter((table) => table === "countries" || table === sourcesTable);
    expect(listReads.sort()).toEqual(["countries", sourcesTable]);
    expect(redisMock.setEx).toHaveBeenCalledWith("countries:v2:visibility", 120, expect.any(String));
    expect(redisMock.setEx).toHaveBeenCalledWith("official:v3:source-visibility", 120, expect.any(String));
    expect(JSON.parse(String(await redisMock.get("official:v3:source-visibility")))).toMatchObject({ value: storedSources });
  });

  it("reads the database on every call while Redis is not ready", async () => {
    redisMock.isReady = false;
    scriptStoredLists();
    scriptStoredLists();

    expect(await loadPublicOfficialVisibility()).toEqual({ sourceIds: [1], hiddenCountryCodes: ["XX"] });
    expect(await loadPublicOfficialVisibility()).toEqual({ sourceIds: [1], hiddenCountryCodes: ["XX"] });
    expect(dbMock.pendingResults()).toBe(0);
    expect(redisMock.get).not.toHaveBeenCalled();
  });
});

describe("country visibility", () => {
  it("filters the cached countries by the codes asked for, and looks up access only while a country is hidden", async () => {
    cacheInRedis("countries:v2:visibility", [
      { code: "DE", isVisible: true },
      { code: "PL", isVisible: true },
    ]);

    expect(await loadVisibleCountryCodes(signedIn("user"), ["PL", "FR"])).toEqual(["PL"]);
    expect(await loadVisibleCountryCodes(guest)).toEqual(["DE", "PL"]);
    expect(await loadHiddenCountryCodes(signedIn("user"))).toEqual([]);
    expect(dbMock.calls).toEqual([]);
  });

  it("shows a hidden country only to those with a grant in it", async () => {
    cacheInRedis("countries:v2:visibility", storedCountries);
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", maintainerOfXX);
    const editor = signedIn("editor");

    expect(await loadVisibleCountryCodes(guest, ["XX", "PL"])).toEqual(["PL"]);
    expect(await loadHiddenCountryCodes(guest)).toEqual(["XX"]);
    expect(await loadVisibleCountryCodes(editor, ["XX"])).toEqual(["XX"]);
    expect(await loadHiddenCountryCodes(editor)).toEqual([]);
    expect(dbMock.calls.map((call) => call.table)).toEqual(["users", "role_grants"]);
  });
});

describe("loadPublicSiteSourceNames", () => {
  it("names the visible sources of sites in the country, and none in a hidden country", async () => {
    cacheInRedis("countries:v2:visibility", storedCountries);
    cacheInRedis("official:v3:source-visibility", [
      { id: 1, countryCode: "PL", shortName: "UKE", isVisible: true, layers: ["sites", "microwave_links"] },
      { id: 2, countryCode: "XX", shortName: "XXR", isVisible: true, layers: ["sites"] },
      { id: 3, countryCode: "PL", shortName: "HIDDEN", isVisible: false, layers: ["sites"] },
      { id: 4, countryCode: "PL", shortName: "LINKS", isVisible: true, layers: ["microwave_links"] },
    ]);

    expect(await loadPublicSiteSourceNames("PL")).toEqual(["UKE"]);
    expect(await loadPublicSiteSourceNames("XX")).toEqual([]);
    expect(await loadPublicSiteSourceNames(null)).toEqual([]);
    expect(dbMock.calls).toEqual([]);
  });
});

describe("officialLocationIsPublic", () => {
  it("needs a public source and a region in a visible country", () => {
    expect(rendered(officialLocationIsPublic(officialSites.location_id, publicView))).toEqual({
      sql:
        'exists select "public_location"."id" from "public_location" where (("public_location"."id" = "official"."sites"."location_id") ' +
        'and ((("public_location"."source_id" in ($1)) and (not exists select "hidden_region"."id" from "hidden_region" ' +
        'where (("hidden_region"."id" = "public_location"."region_id") and ("hidden_region"."country_code" in ($2)))))))',
      params: [1, "XX"],
    });
  });

  it("checks only the country for a caller who sees every source", () => {
    const condition = rendered(officialLocationIsPublic(officialLocations.id, { sourceIds: null, hiddenCountryCodes: ["XX"] }));

    expect(condition?.sql).toContain('not exists select "hidden_region"."id" from "hidden_region"');
    expect(condition?.sql).not.toContain("source_id");
    expect(condition?.params).toEqual(["XX"]);
  });
});

describe("microwaveLinkIsPublic", () => {
  it("follows the link's source alone, whatever countries are hidden", () => {
    expect(rendered(microwaveLinkIsPublic(microwaveLinks.dataset_id, publicView))).toEqual({
      sql:
        'exists select "link_dataset"."id" from "link_dataset" where (("link_dataset"."id" = "official"."microwave_links"."dataset_id") ' +
        'and ("link_dataset"."source_id" in ($1)))',
      params: [1],
    });
  });
});
