import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/observed/flags/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { EDITOR_ID, REGIONAL_GRANT, bandFlagRow, listedFlag, pciFlagRow, scriptAccess } from "../../../../../helpers/flagFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";

const NOTE = "A femtocell inside the shopping centre";
const dismissal = {
  method: "PATCH" as const,
  url: "/observed/flags/4101",
  payload: { status: "dismissed", dismissedReason: "notAnIssue", note: NOTE },
};
const reopening = { ...dismissal, payload: { status: "open" } };
const editor = { session: userSession(EDITOR_ID, "editor") };
const dismissedRow = {
  ...pciFlagRow,
  closedReason: "dismissed" as const,
  dismissedReason: "notAnIssue" as const,
  resolvedAt: new Date("2026-10-31T08:00:00.000Z"),
  resolvedById: EDITOR_ID,
  note: NOTE,
  suggestion: null,
};

function flagUpdates() {
  return dbMock.calls.filter((call) => call.operation === "update" && call.table === "observation_flags").map((call) => call.values);
}

describe("PATCH /observed/flags/:id", () => {
  it("dismisses a flag with the editor's reason and note, drops its suggestion and audits it with its station", async () => {
    scriptAccess("editor", [REGIONAL_GRANT]);
    scriptAudit();
    const resolver = { id: EDITOR_ID, username: "ania", name: "Ania", image: null };
    dbMock.enqueueFor("select", "observation_flags", [pciFlagRow], [listedFlag(dismissedRow, { resolver })]);
    dbMock.enqueueFor("update", "observation_flags", [dismissedRow]);

    const response = await injectMutation(route, dismissal, editor);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      id: 4101,
      status: "dismissed",
      closedReason: "dismissed",
      dismissedReason: "notAnIssue",
      note: NOTE,
      resolvedBy: { id: EDITOR_ID },
      suggestion: null,
    });
    expect(flagUpdates()).toMatchObject([
      { closedReason: "dismissed", dismissedReason: "notAnIssue", resolvedById: EDITOR_ID, note: NOTE, suggestion: null },
    ]);
    const operation = dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations");
    const entries = dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs");
    expect(operation?.values).toMatchObject({ kind: "observations.flag_update" });
    expect(entries?.values).toMatchObject([{ entity: "observation_flags", op: "update", record_id: "4101", station_id: 40077 }]);
  });

  it("dismisses without a note", async () => {
    scriptAccess("editor", [REGIONAL_GRANT]);
    scriptAudit();
    const withoutNote = { ...dismissedRow, dismissedReason: "needsSurvey" as const, note: null };
    dbMock.enqueueFor("select", "observation_flags", [pciFlagRow], [listedFlag(withoutNote)]);
    dbMock.enqueueFor("update", "observation_flags", [withoutNote]);

    const response = await injectMutation(route, { ...dismissal, payload: { status: "dismissed", dismissedReason: "needsSurvey" } }, editor);

    expect(response.statusCode, response.body).toBe(200);
    expect(flagUpdates()).toMatchObject([{ dismissedReason: "needsSurvey", note: null }]);
  });

  it("reopens a dismissed flag and clears why it closed", async () => {
    scriptAccess("editor", [REGIONAL_GRANT]);
    scriptAudit();
    dbMock.enqueueFor("select", "observation_flags", [dismissedRow], [], [listedFlag(pciFlagRow)]);
    dbMock.enqueueFor("update", "observation_flags", [pciFlagRow]);

    const response = await injectMutation(route, reopening, editor);

    expect(response.statusCode, response.body).toBe(200);
    expect(flagUpdates()).toMatchObject([{ closedReason: null, dismissedReason: null, note: null, resolvedById: null }]);
  });

  it("refuses to reopen a resolved flag, saying so in the details", async () => {
    scriptAccess("editor", [REGIONAL_GRANT]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "observation_flags", [{ ...pciFlagRow, closedReason: "applied", resolvedAt: new Date() }]);

    const response = await injectMutation(route, reopening, editor);

    expectError(response, 409, "CONFLICT", "The flag is resolved");
    expect(response.json().errors[0].details).toEqual([{ kind: "resolved" }]);
    expect(flagUpdates()).toEqual([]);
  });

  it("refuses to reopen a dismissed flag while another flag of its kind is open for the same subject, and names that flag", async () => {
    scriptAccess("editor", [REGIONAL_GRANT]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "observation_flags", [dismissedRow], [{ id: 4188 }]);

    const response = await injectMutation(route, reopening, editor);

    expectError(response, 409, "CONFLICT", "Another flag of the same kind is open for the same subject");
    expect(response.json().errors[0].details).toEqual([{ kind: "openFlag", observationFlagId: 4188 }]);
    expect(flagUpdates()).toEqual([]);
  });

  it("answers 404 to a country-wide editor who does not maintain the country of a bandNotInPlan flag", async () => {
    scriptAccess("editor", [{ countryCode: "PL", grantRole: "editor", isCountryWide: true, regionId: null }]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "observation_flags", [bandFlagRow]);

    expectError(await injectMutation(route, { ...dismissal, url: "/observed/flags/4201" }, editor), 404, "NOT_FOUND");
    expect(flagUpdates()).toEqual([]);
  });

  it("answers 403 to an editor for a flag about a station outside their grants", async () => {
    const { session } = editor;
    authBoundary.getCurrentUser.mockResolvedValue(session);
    scriptAccess("editor", [REGIONAL_GRANT]);
    dbMock.enqueueFor("select", "observation_flags", [{ stationId: 40077, countryCode: null, regionId: null }]);
    dbMock.enqueueFor("select", "stations", [{ countryCode: "PL", regionId: 8 }]);

    expectError(await injectMutation(route, dismissal, { session, runAuth: true }), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("answers 404 to an editor for a flag that does not exist", async () => {
    const { session } = editor;
    authBoundary.getCurrentUser.mockResolvedValue(session);
    scriptAccess("editor", [REGIONAL_GRANT]);
    dbMock.enqueueFor("select", "observation_flags", []);

    expectError(await injectMutation(route, dismissal, { session, runAuth: true }), 404, "NOT_FOUND");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
});
