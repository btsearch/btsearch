import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/comments/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { commentRow, commenterId } from "../../../../helpers/commentFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const request = { method: "DELETE" as const, url: "/comments/11111111-1111-4111-8111-111111111111" };
const options = { session: userSession(commenterId) };

describe("DELETE /comments/:id", () => {
  it("requires an account", async () => {
    const response = await injectMutation(route, request);
    expectError(response, 401, "UNAUTHORIZED");
  });

  it("returns 404 when the comment is absent", async () => {
    dbMock.query.stationComments.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
  });

  it("rejects changing someone else's comment without moderation permission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.stationComments.findFirst.mockResolvedValue({ ...commentRow, user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FORBIDDEN");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("lets the author delete their comment while comments are disabled", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.stationComments.findFirst.mockResolvedValue(commentRow);
    scriptAudit();
    dbMock.enqueueFor("delete", "station_comments", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });
});
