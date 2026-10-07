import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import getPhotos from "../../../../../src/routes/v2/(get)/photos/index.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { readPhoto } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

describe("getPhotos", () => {
  it.each([false, true])("paginates photos and hides private author names with totals=%s", async (includeTotal) => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "location_photos", [readPhoto, { ...readPhoto, locationPhotoId: 2, fileId: "123e4567-e89b-42d3-a456-426614174002" }]);
    if (includeTotal) dbMock.enqueueFor("select", "location_photos", [{ total: 3 }]);
    dbMock.enqueueFor("select", "station_photo_selections", [{ locationPhotoId: 1, stationId: 1, isMain: true }]);
    const app = await createRouteHarness(getPhotos);
    const response = await app.inject({ method: "GET", url: `/photos?limit=1&includeTotal=${includeTotal}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({
      id: readPhoto.fileId,
      takenAt: null,
      note: "Lorem ipsum",
      author: { name: null },
      selections: [{ stationId: 1, isMain: true }],
      urls: { thumb: `/uploads/${readPhoto.fileId}.webp`, display: `/uploads/${readPhoto.fileId}.webp`, full: `/uploads/${readPhoto.fileId}.webp` },
    });
    expect(response.json().paging.nextCursor).toEqual(expect.any(String));
    if (includeTotal) expect(response.json().paging.total).toBe(3);
    else expect(response.json().paging).not.toHaveProperty("total");
  });

  it("uses upload time when a date filter targets a photo without a known taken date", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "location_photos", []);
    const app = await createRouteHarness(getPhotos);
    const response = await app.inject({ method: "GET", url: "/photos?isMain=false&takenAfter=2026-10-06T00:00:00Z&sort=takenAt&q=100%25" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null } });
    const query = new PgDialect().sqlToQuery(dbMock.calls.find((call) => call.table === "location_photos")?.clauses.where?.[0] as SQL);
    expect(query.sql).toContain("COALESCE");
    expect(query.params).toEqual(expect.arrayContaining([false, "%100\\%%"]));
  });

  it("filters by upload time, counts a shared network's members and keeps the countries the operators do not belong to", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "location_photos", [], [{ total: 0 }]);
    const app = await createRouteHarness(getPhotos);
    const response = await app.inject({
      method: "GET",
      url: "/photos?operatorIds=4,7&keepOtherCountries=true&createdAfter=2026-10-01T02:00:00%2B02:00&includeTotal=true",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null, total: 0 } });
    const conditions = dbMock.calls
      .filter((call) => call.table === "location_photos")
      .map((call) => new PgDialect().sqlToQuery(call.clauses.where?.[0] as SQL));
    expect(conditions).toHaveLength(2);
    for (const query of conditions) {
      expect(query.sql).toContain('"stations"."operator_id" in ($3, $4) OR "stations"."operator_id" in');
      expect(query.sql).toContain('OR "regions"."country_code" not in');
      expect(query.sql).toContain('"location_photos"."createdAt" >=');
      expect(query.sql).not.toContain("COALESCE");
      expect(query.params).toEqual(["published", "pending", 4, 7, 4, 7, "jv_member", 4, 7, 4, 7, "jv_member", "2026-10-01T00:00:00.000Z"]);
    }
  });

  it.each(["operatorIds=4,7", "operatorIds=4,7&keepOtherCountries=false", "keepOtherCountries=true"])(
    "narrows every country alike unless keepOtherCountries is true next to operatorIds: %s",
    async (filter) => {
      dbMock.enqueueFor("select", "countries", []);
      dbMock.enqueueFor("select", "location_photos", []);
      const app = await createRouteHarness(getPhotos);
      expect((await app.inject({ method: "GET", url: `/photos?${filter}` })).statusCode).toBe(200);
      const query = new PgDialect().sqlToQuery(dbMock.calls.find((call) => call.table === "location_photos")?.clauses.where?.[0] as SQL);
      const namesOperators = filter.includes("operatorIds");
      expect(query.sql).not.toContain("country_code");
      expect(query.sql.includes('"stations"."operator_id" in ($3, $4) OR "stations"."operator_id" in')).toBe(namesOperators);
      expect(query.params).toEqual(namesOperators ? ["published", "pending", 4, 7, 4, 7, "jv_member"] : ["published", "pending"]);
    },
  );

  it("keeps the upload time filter on the page a cursor points at", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "location_photos", [readPhoto, { ...readPhoto, locationPhotoId: 2, fileId: "123e4567-e89b-42d3-a456-426614174002" }]);
    dbMock.enqueueFor("select", "station_photo_selections", []);
    const app = await createRouteHarness(getPhotos);
    const first = await app.inject({ method: "GET", url: "/photos?limit=1&createdAfter=2026-10-01T00:00:00Z" });
    expect(first.statusCode).toBe(200);
    const cursor = String(first.json().paging.nextCursor);

    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "location_photos", []);
    const next = await app.inject({ method: "GET", url: `/photos?limit=1&createdAfter=2026-10-01T00:00:00Z&cursor=${encodeURIComponent(cursor)}` });
    expect(next.statusCode).toBe(200);
    const pages = dbMock.calls.filter((call) => call.table === "location_photos");
    expect(pages.map((call) => call.clauses.offset)).toEqual([[0], [1]]);
    for (const page of pages) {
      const query = new PgDialect().sqlToQuery(page.clauses.where?.[0] as SQL);
      expect(query.sql).toContain('"location_photos"."createdAt" >=');
      expect(query.params).toContain("2026-10-01T00:00:00.000Z");
    }
  });

  it.each([
    "limit=201",
    "cursor=x&offset=0",
    "sort=-id",
    "isMain=yes",
    "include=author",
    "takenAfter=2026-10-06",
    "createdAfter=2026-10-06",
    "createdAfter=",
    "createdBefore=2026-10-06T00:00:00Z",
    "keepOtherCountries=1",
  ])("rejects an unsupported photo query: %s", async (query) => {
    const app = await createRouteHarness(getPhotos);
    expect((await app.inject({ method: "GET", url: `/photos?${query}` })).statusCode).toBe(400);
    expect(dbMock.calls).toHaveLength(0);
  });
});
