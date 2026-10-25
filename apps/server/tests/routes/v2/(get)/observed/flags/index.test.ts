import { describe, expect, it } from "vitest";

import type { ApiToken } from "../../../../../../src/interfaces/fastify.interface.js";
import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(get)/observed/flags/index.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { EDITOR_ID, REGIONAL_GRANT, listedFlag, pciFlagRow, scriptAccess } from "../../../../../helpers/flagFixtures.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";

const request = { method: "GET" as const, url: "/observed/flags" };
const editor = { session: userSession(EDITOR_ID, "editor") };
const admin = { session: userSession(EDITOR_ID, "admin") };

describe("GET /observed/flags", () => {
  it("answers a flag with its evidence and suggestion", async () => {
    scriptAccess("editor", [REGIONAL_GRANT]);
    dbMock.enqueueFor("select", "observation_flags", [listedFlag()]);

    const response = await injectMutation(route, request, editor);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          id: 4101,
          status: "open",
          closedReason: null,
          dismissedReason: null,
          observedSiteId: 9205,
          observedCellId: 50411,
          stationId: 40077,
          cellId: 880345,
          sectorId: null,
          bandId: null,
          deviceId: null,
          userId: null,
          countryCode: "PL",
          regionId: 7,
          note: null,
          createdAt: "2026-10-30T12:00:00.000Z",
          updatedAt: "2026-10-30T12:00:00.000Z",
          resolvedAt: null,
          resolvedBy: null,
          kind: "valueDiffers",
          evidence: { field: "pci", observed: 301, stored: 214, samples: 46, people: 2, lastSeenOn: "2026-10-30" },
          suggestion: { cells: [{ action: "update", id: 880345, pci: 301 }] },
        },
      ],
      paging: { limit: 50, nextCursor: null },
    });
  });

  it("answers the flags that closed since a time, oldest change first, for a client that follows the queue", async () => {
    scriptAccess("editor", [REGIONAL_GRANT]);
    const closed = {
      ...pciFlagRow,
      closedReason: "fixedElsewhere" as const,
      resolvedAt: new Date(),
      suggestion: null,
    };
    dbMock.enqueueFor("select", "observation_flags", [listedFlag(closed)]);
    const url = "/observed/flags?sort=updatedAt&updatedAfter=2026-10-30T11:59:00Z&statuses=open,resolved,dismissed";

    const response = await injectMutation(route, { ...request, url }, editor);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject([{ id: 4101, status: "resolved", closedReason: "fixedElsewhere", suggestion: null }]);
  });

  it("counts each kind as if you sent no kinds and each status as if you sent every status, next to the total of what it lists", async () => {
    scriptAccess("editor", [REGIONAL_GRANT]);
    dbMock.enqueueFor(
      "select",
      "observation_flags",
      [listedFlag()],
      [{ kind: "valueDiffers", closedReason: null, flags: 3 }],
      [
        { kind: "valueDiffers", closedReason: null, flags: 3 },
        { kind: "valueDiffers", closedReason: "dismissed", flags: 2 },
        { kind: "valueDiffers", closedReason: "fixedElsewhere", flags: 1 },
        { kind: "valueDiffers", closedReason: "applied", flags: 4 },
        { kind: "cellMissing", closedReason: null, flags: 5 },
        { kind: "cellMissing", closedReason: "applied", flags: 1 },
      ],
    );
    const url = "/observed/flags?kinds=valueDiffers&includeTotal=true&includeCounts=true";

    const response = await injectMutation(route, { ...request, url }, editor);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().paging).toEqual({ limit: 50, nextCursor: null, total: 3 });
    expect(response.json().counts).toEqual({ kinds: { valueDiffers: 3, cellMissing: 5 }, statuses: { open: 3, dismissed: 2, resolved: 5 } });
  });

  it("pages flags sorted by station by their position, and refuses a cursor made for another sort", async () => {
    scriptAccess("editor", [REGIONAL_GRANT]);
    dbMock.enqueueFor("select", "observation_flags", [listedFlag(), listedFlag({ ...pciFlagRow, id: 4100 })]);
    const first = await injectMutation(route, { ...request, url: "/observed/flags?sort=stationId&limit=1" }, editor);
    expect(first.statusCode, first.body).toBe(200);
    const { nextCursor } = first.json().paging;

    scriptAccess("editor", [REGIONAL_GRANT]);
    dbMock.enqueueFor("select", "observation_flags", [listedFlag({ ...pciFlagRow, id: 4100 })]);
    const second = await injectMutation(route, { ...request, url: `/observed/flags?sort=stationId&limit=1&cursor=${nextCursor}` }, editor);
    expect(second.statusCode, second.body).toBe(200);
    expect(dbMock.calls.filter((call) => call.table === "observation_flags").map((call) => call.clauses.offset)).toEqual([[0], [1]]);

    scriptAccess("editor", [REGIONAL_GRANT]);
    dbMock.enqueueFor("select", "observation_flags", [listedFlag(), listedFlag({ ...pciFlagRow, id: 4100 })]);
    const byTime = await injectMutation(route, { ...request, url: "/observed/flags?limit=1" }, editor);
    scriptAccess("editor", [REGIONAL_GRANT]);
    const mixed = await injectMutation(
      route,
      { ...request, url: `/observed/flags?sort=stationId&cursor=${byTime.json().paging.nextCursor}` },
      editor,
    );
    expectError(mixed, 400, "INVALID_QUERY");
  });

  it.each([
    ["a user", { session: userSession(EDITOR_ID, "user") }, false],
    ["an API key", { apiToken: { id: "key", referenceId: "api-user" } as unknown as ApiToken }, true],
    [
      "an editor's token without moderate:observations",
      { ...editor, oauthToken: { clientId: "client", userId: EDITOR_ID, scopes: ["read:observations"] } },
      true,
    ],
  ])("refuses %s before reading anything", async (_title, options, hasPermission) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: hasPermission });

    expectError(await injectMutation(route, request, options), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });

  it("refuses editors with FEATURE_DISABLED while observations are off, and keeps the queue for administrators", async () => {
    getRuntimeSettings().observationsEnabled = false;
    authBoundary.auth.api.userHasPermission.mockImplementation(async (input) => ({ success: !JSON.stringify(input).includes("manage") }));
    expectError(await injectMutation(route, request, editor), 403, "FEATURE_DISABLED");

    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: true });
    scriptAccess("admin");
    dbMock.enqueueFor("select", "observation_flags", []);
    expect((await injectMutation(route, request, admin)).statusCode).toBe(200);
  });
});
