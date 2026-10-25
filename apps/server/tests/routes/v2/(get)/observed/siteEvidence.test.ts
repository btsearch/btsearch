import type { RouteOptions } from "fastify";
import { describe, expect, it } from "vitest";

import { findDocumentationGap } from "../../../../../src/features/openapi/document.js";
import route from "../../../../../src/routes/v2/(get)/observed/sites/[id]/evidence.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { scriptAccess } from "../../../../helpers/flagFixtures.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";
import { observedSiteRow, scriptSiteDetails } from "../../../../helpers/observedFixtures.js";
import { signInAs } from "../../../../helpers/officialFixtures.js";
import { readLocation } from "../../../../helpers/readFixtures.js";

const request = { method: "GET" as const, url: "/observed/sites/8124/evidence" };
const grid = { latitude: 50.04, longitude: 19.9, cellMeters: 50, columns: 3, rows: 2, cost: Buffer.from([0, 1, 2, 3, 4, 5]) };
const tested = {
  locationId: 30551,
  officialSiteId: null,
  observedSiteId: null,
  difference: 2.6,
  probability: 0.41,
  isSnap: false,
  latitude: 50.05,
  longitude: 19.93,
};

function scriptSite(role: "admin" | "editor", regionIds: number[] = []) {
  dbMock.enqueueFor("select", "observed_sites", [observedSiteRow()]);
  scriptSiteDetails([8124]);
  scriptAccess(
    role,
    regionIds.map((regionId) => ({ countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId })),
  );
}

function scriptEvidence(grids: object[], places: object[] = [tested]) {
  dbMock.enqueueFor("select", "site_evidence_grids", grids);
  dbMock.enqueueFor("select", "snap_tests", places);
  dbMock.enqueueFor("select", "observed_cells", []);
}

function scriptTestedLocation() {
  dbMock.enqueueFor("select", "locations", [{ ...readLocation, location: { ...readLocation.location, id: 30551 } }]);
  dbMock.enqueueFor("select", "stations", []);
}

describe("GET /observed/sites/:id/evidence", () => {
  it("answers the fit, the grid's bytes in base64 and every tested place with what stands there, privately", async () => {
    scriptSite("admin");
    scriptEvidence([grid]);
    scriptTestedLocation();
    const response = await injectMutation(route, request, signInAs("admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().data).toEqual({
      observedSiteId: 8124,
      fit: {
        latitude: 50.05177,
        longitude: 19.92841,
        radiusMeters: 206,
        confidence: 0.95,
        ellipse: { majorMeters: 240, minorMeters: 150, azimuthDegrees: 35 },
        alternative: null,
      },
      grid: { origin: { latitude: 50.04, longitude: 19.9 }, cellMeters: 50, columns: 3, rows: 2, cost: "AAECAwQF" },
      timingAdvanceSquares: [],
      timingAdvanceSquaresTruncated: false,
      cells: [],
      candidates: [
        {
          kind: "location",
          locationId: 30551,
          latitude: 50.05,
          longitude: 19.93,
          difference: 2.6,
          probability: 0.41,
          isSnap: false,
          location: expect.objectContaining({ id: 30551, city: "Łódź", address: "Main Street 1", stations: [] }),
        },
      ],
    });
  });

  it("names another estimated site it was tested against as you may see it, and leaves it out when you may not", async () => {
    const otherSite = { ...tested, locationId: null, observedSiteId: 8200 };
    const nameOtherSite = (regionId: number) => {
      dbMock.enqueueFor("select", "observed_sites", [
        observedSiteRow({ id: 8200, primarySiteId: 8200, regionId, notPublicReasons: ["unconfirmed"] }),
      ]);
      scriptSiteDetails([8200]);
    };

    scriptSite("editor", [6]);
    scriptEvidence([], [otherSite]);
    nameOtherSite(6);
    const inside = await injectMutation(route, request, signInAs("editor"));
    expect(inside.statusCode, inside.body).toBe(200);
    expect(inside.json().data.candidates).toMatchObject([
      { kind: "observedSite", observedSiteId: 8200, observedSite: { id: 8200, status: "suggested", ignore: null } },
    ]);

    scriptSite("editor", [6]);
    scriptEvidence([], [otherSite]);
    nameOtherSite(7);
    dbMock.enqueueFor("select", "cell_contributors", []);
    const outside = await injectMutation(route, request, signInAs("editor"));
    expect(outside.statusCode, outside.body).toBe(200);
    expect(outside.json().data.candidates).toEqual([expect.objectContaining({ kind: "observedSite", observedSiteId: 8200 })]);
    expect(outside.json().data.candidates[0]).not.toHaveProperty("observedSite");
  });

  it("answers 404 to an editor whose grants do not cover where the site is shown", async () => {
    scriptSite("editor", [7]);

    expectError(await injectMutation(route, request, signInAs("editor")), 404, "NOT_FOUND");
  });

  it("can be documented", () => {
    expect(findDocumentationGap(route as unknown as RouteOptions)).toBeUndefined();
  });
});
