import { describe, expect, it } from "vitest";

import getLocationPhotos from "../../../../../../src/routes/v2/(get)/locations/[id]/photos.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { readLocation, readPhoto } from "../../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

describe("getLocationPhotos", () => {
  it("includes an unselected photo and its requested location", async () => {
    dbMock.enqueueFor("select", "locations", [readLocation], [readLocation]);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "location_photos", [readPhoto]);
    dbMock.enqueueFor("select", "station_photo_selections", []);
    const app = await createRouteHarness(getLocationPhotos);
    const response = await app.inject({ url: "/locations/1/photos?include=location" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({
      id: readPhoto.fileId,
      location: { id: 1, latitude: 52, longitude: 21, countryCode: "PL" },
      selections: [],
    });
  });

  it.each(["missing", "hidden"])("does not expose photos of a %s location", async (kind) => {
    dbMock.enqueueFor("select", "locations", kind === "missing" ? [] : [readLocation]);
    if (kind === "hidden") dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    const app = await createRouteHarness(getLocationPhotos);
    expect((await app.inject({ url: "/locations/1/photos" })).statusCode).toBe(404);
    expect(dbMock.calls.some((call) => call.table === "location_photos")).toBe(false);
  });
});
