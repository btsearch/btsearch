import { stations } from "@openbts/drizzle";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import getStationPhotos from "../../../../../../src/routes/v2/(get)/stations/[id]/photos.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { readPhoto, readStation } from "../../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

describe("getStationPhotos", () => {
  it("returns all selections while protecting a private author's name", async () => {
    dbMock.enqueueFor("select", getTableName(stations), [{ station: readStation, countryCode: null }]);
    dbMock.enqueueFor(
      "select",
      "station_photo_selections",
      [readPhoto],
      [
        { locationPhotoId: 1, stationId: 1, isMain: true },
        { locationPhotoId: 1, stationId: 2, isMain: false },
      ],
    );
    const app = await createRouteHarness(getStationPhotos);
    const response = await app.inject({ url: "/stations/1/photos" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({
      id: readPhoto.fileId,
      author: { id: readPhoto.authorId, name: null },
      selections: [
        { stationId: 1, isMain: true },
        { stationId: 2, isMain: false },
      ],
    });
  });

  it("returns an empty collection for an existing station", async () => {
    dbMock.enqueueFor("select", getTableName(stations), [{ station: readStation, countryCode: null }]);
    dbMock.enqueueFor("select", "station_photo_selections", []);
    const app = await createRouteHarness(getStationPhotos);
    expect((await app.inject({ url: "/stations/1/photos" })).json()).toEqual({ data: [] });
  });

  it("does not look up photos for a missing parent", async () => {
    dbMock.enqueueFor("select", getTableName(stations), []);
    const app = await createRouteHarness(getStationPhotos);
    expect((await app.inject({ url: "/stations/1/photos" })).statusCode).toBe(404);
    expect(dbMock.calls.some((call) => call.table === "station_photo_selections")).toBe(false);
  });
});
