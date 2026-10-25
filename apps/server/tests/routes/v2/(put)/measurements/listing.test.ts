import { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(put)/measurements/listing.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";

const userId = userSession().user.id;
const listedAt = new Date("2026-11-04T10:12:00Z");

function put(isListed: boolean) {
  return injectMutation(route, { method: "PUT", url: "/measurements/listing", payload: { isListed } }, { session: userSession() });
}

function savedListedAt(): unknown {
  return dbMock.calls.find((call) => call.operation === "update" && call.table === "contributors")?.values;
}

describe("PUT /measurements/listing", () => {
  it("records when you agreed, keeping the first time on a repeated yes, and says whether your profile is public", async () => {
    dbMock.enqueueFor("update", "contributors", [{ userId }]);
    dbMock.enqueueFor("select", "users", [{ listedAt, profileVisibility: "private" }]);
    const response = await put(true);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().data).toEqual({ isListed: true, listedAt: listedAt.toISOString(), hasPublicProfile: false });
    expect(savedListedAt()).toMatchObject({ listedAt: expect.any(SQL) });
  });

  it("forgets the time when you say no", async () => {
    dbMock.enqueueFor("update", "contributors", [{ userId }]);
    dbMock.enqueueFor("select", "users", [{ listedAt: null, profileVisibility: "public" }]);
    const response = await put(false);

    expect(response.json().data).toEqual({ isListed: false, listedAt: null, hasPublicProfile: true });
    expect(savedListedAt()).toMatchObject({ listedAt: null });
  });

  it("refuses someone who never accepted the contributor terms", async () => {
    dbMock.enqueueFor("update", "contributors", []);
    expectError(await put(true), 403, "TERMS_NOT_ACCEPTED");
  });
});
