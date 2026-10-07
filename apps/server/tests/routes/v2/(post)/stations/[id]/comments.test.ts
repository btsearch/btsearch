import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(post)/stations/[id]/comments.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { commentRow, commentView, commenterId } from "../../../../../helpers/commentFixtures.js";
import { multipartPayload } from "../../../../../helpers/multipart.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";

describe("POST /stations/:id/comments", () => {
  it("requires a multipart content type even when no body is sent", async () => {
    getRuntimeSettings().enableStationComments = true;
    expectError(
      await injectMutation(route, { method: "POST", url: "/stations/12/comments" }, { session: userSession(commenterId) }),
      400,
      "BAD_REQUEST",
      "A comment must be sent as multipart/form-data",
    );
    expect(dbMock.calls).toEqual([]);
  });

  it("honors the comments feature switch for an authenticated author", async () => {
    expectError(
      await injectMutation(route, { method: "POST", url: "/stations/12/comments" }, { session: userSession(commenterId) }),
      403,
      "FEATURE_DISABLED",
    );
    expect(dbMock.calls).toEqual([]);
  });

  it.each(["", "  ", "x".repeat(1001)])("rejects invalid multipart text before creating a comment", async (content) => {
    getRuntimeSettings().enableStationComments = true;
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "stations", [{ station: { id: 12 }, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", []);
    expectError(
      await injectMutation(
        route,
        { method: "POST", url: "/stations/12/comments", ...multipartPayload([{ name: "content", content }]) },
        { session: userSession(commenterId) },
      ),
      400,
      "BAD_REQUEST",
    );
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("rejects an attachment with a non-image media type", async () => {
    getRuntimeSettings().enableStationComments = true;
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "stations", [{ station: { id: 12 }, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", []);
    const body = multipartPayload([
      { name: "content", content: "Valid text" },
      { name: "attachments", filename: "file.txt", contentType: "text/plain", content: "Text" },
    ]);
    expectError(
      await injectMutation(route, { method: "POST", url: "/stations/12/comments", ...body }, { session: userSession(commenterId) }),
      400,
      "BAD_REQUEST",
      "Only image files are allowed",
    );
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });
  it("requires an authenticated author", async () => {
    const response = await injectMutation(route, { method: "POST", url: "/stations/12/comments" });
    expectError(response, 401, "UNAUTHORIZED");
  });

  it("rejects a non-multipart comment before checking its station", async () => {
    getRuntimeSettings().enableStationComments = true;
    const response = await injectMutation(
      route,
      { method: "POST", url: "/stations/12/comments", payload: { content: "Text" } },
      { session: userSession(commenterId) },
    );
    expectError(response, 400, "BAD_REQUEST", "A comment must be sent as multipart/form-data");
    expect(dbMock.calls).toEqual([]);
  });

  it.each([false, true])("creates a trimmed comment with review queue enabled=%s", async (queueEnabled) => {
    getRuntimeSettings().enableStationComments = true;
    getRuntimeSettings().commentQueueEnabled = queueEnabled;
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    scriptAudit();
    dbMock.enqueueFor("select", "stations", [{ station: { id: 12 }, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", []);
    const status = queueEnabled ? "pending" : "approved";
    dbMock.enqueueFor("insert", "station_comments", [{ ...commentRow, status }]);
    dbMock.enqueueFor("select", "station_comments", [{ ...commentView, status }]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    const response = await injectMutation(
      route,
      {
        method: "POST",
        url: "/stations/12/comments",
        ...multipartPayload([{ name: "content", content: "  A meaningful comment  " }]),
      },
      { session: userSession(commenterId) },
    );
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { content: "A meaningful comment", status, attachments: [] } });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "station_comments")?.values).toMatchObject({
      user_id: commenterId,
      station_id: 12,
      content: "A meaningful comment",
      status,
    });
  });
});
