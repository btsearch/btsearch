import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../src/lib/runtimeSettings.js";
import getList from "../../../../src/routes/v1/(get)/lists/[uuid].js";
import patchList from "../../../../src/routes/v1/(patch)/lists/[uuid].js";
import postList from "../../../../src/routes/v1/(post)/lists/index.js";
import { dbMock, userSession } from "../../../helpers/boundaries.js";
import { injectMutation, scriptAudit } from "../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = {
  id: 1,
  uuid: "list-1",
  name: "Sites",
  description: null,
  is_public: true,
  notificationsEnabled: false,
  created_by: ownerId,
  stations: { internal: [12], official: [24] },
  radiolines: [36],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const options = { session: userSession(ownerId) };

function storedValues(operation: string) {
  return dbMock.calls.find((call) => call.operation === operation && call.table === "user_lists")?.values;
}

describe("v1 lists keep the uke key for official sites", () => {
  it("answers GET /lists/:uuid with the stored official sites under uke", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "stations", []);

    const response = await injectMutation(getList, { method: "GET", url: "/lists/list-1" }, options);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.stations).toEqual({ internal: [12], uke: [24] });
  });

  it("stores the uke sites of POST /lists as official and answers them as uke", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.enqueueFor("select", "user_lists", [{ count: 0 }]);
    dbMock.enqueueFor("select", "stations", []);
    scriptAudit();
    dbMock.enqueueFor("insert", "user_lists", [row]);
    const payload = { name: "Sites", stations: { internal: [12], uke: [24] }, radiolines: [36] };

    const response = await injectMutation(postList, { method: "POST", url: "/lists", payload }, options);

    expect(response.statusCode, response.body).toBe(200);
    expect(storedValues("insert")).toMatchObject({ stations: { internal: [12], official: [24] } });
    expect(response.json().data.stations).toEqual({ internal: [12], uke: [24] });
  });

  it("stores the uke sites of PATCH /lists/:uuid as official and answers them as uke", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "stations", []);
    scriptAudit();
    dbMock.enqueueFor("update", "user_lists", [{ ...row, stations: { internal: [12, 13], official: [24, 25] } }]);
    const payload = { stations: { internal: [12, 13], uke: [24, 25] } };

    const response = await injectMutation(patchList, { method: "PATCH", url: "/lists/list-1", payload }, options);

    expect(response.statusCode, response.body).toBe(200);
    expect(storedValues("update")).toMatchObject({ stations: { internal: [12, 13], official: [24, 25] } });
    expect(response.json().data.stations).toEqual({ internal: [12, 13], uke: [24, 25] });
  });
});
