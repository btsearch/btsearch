import { describe, expect, it } from "vitest";

import patchLocation from "../../../../src/routes/v1/(patch)/locations/[id].js";
import postLocation from "../../../../src/routes/v1/(post)/locations/index.js";
import { dbMock, userSession } from "../../../helpers/boundaries.js";
import { injectMutation, scriptAudit } from "../../../helpers/mutationAssertions.js";

const createdAt = new Date("2026-01-01T00:00:00Z");
const row = {
  id: 7,
  region_id: 1,
  city: "Warsaw",
  address: "Example 1",
  structure_type: null,
  structure_owner_id: null,
  structure_note: null,
  longitude: 21,
  latitude: 52,
  point: { x: 21, y: 52 },
  updatedAt: createdAt,
  createdAt,
};
const { structure_type: _type, structure_owner_id: _ownerId, structure_note: _note, ...publicRow } = row;
const served = { ...publicRow, updatedAt: createdAt.toISOString(), createdAt: createdAt.toISOString() };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };
const ownAddressRefusal = {
  errors: [
    {
      code: "VALIDATION_ERROR",
      message: "Validation error",
      details: [{ field: "address", validationMessage: "Address must not contain variants of własny" }],
    },
  ],
};

describe("POST /locations", () => {
  const place = { region_id: 1, longitude: 21, latitude: 52 };

  it("refuses the address before reading anything", async () => {
    const response = await injectMutation(
      postLocation,
      { method: "POST", url: "/locations", payload: { ...place, address: "teren własny" } },
      options,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(ownAddressRefusal);
    expect(dbMock.calls).toEqual([]);
    expect(dbMock.query.locations.findFirst).not.toHaveBeenCalled();
  });

  it("keeps taking any other address", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    const payload = { ...place, address: "Własnościowa 4" };
    const response = await injectMutation(postLocation, { method: "POST", url: "/locations", payload }, options);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: served });
  });
});

describe("PATCH /locations/:id", () => {
  it("refuses the address before reading anything", async () => {
    const response = await injectMutation(patchLocation, { method: "PATCH", url: "/locations/7", payload: { address: "teren własny" } }, options);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(ownAddressRefusal);
    expect(dbMock.calls).toEqual([]);
    expect(dbMock.query.locations.findFirst).not.toHaveBeenCalled();
  });

  it("keeps taking any other address", async () => {
    const saved = { ...row, address: "Własnościowa 4" };
    scriptAudit();
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.query.stations.findMany.mockResolvedValue([]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    dbMock.enqueueFor("update", "locations", [saved]);
    const payload = { address: "Własnościowa 4" };
    const response = await injectMutation(patchLocation, { method: "PATCH", url: "/locations/7", payload }, options);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { ...served, address: "Własnościowa 4" } });
  });
});
