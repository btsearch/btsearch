import { describe, it } from "vitest";

import route from "../../../../../../src/routes/v2/(post)/measurements/uploads/withdrawals.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";

const uploadIds = ["01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e", "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0f"];

function withdraw(payload: object) {
  return injectMutation(route, { method: "POST", url: "/measurements/uploads/withdrawals", payload }, { session: userSession() });
}

describe("POST /measurements/uploads/withdrawals", () => {
  it("withdraws nothing when one of the named uploads is not yours", async () => {
    dbMock.enqueueFor("select", "uploads", [{ total: 1 }]);
    expectError(await withdraw({ uploadIds }), 404, "NOT_FOUND", "Not every upload in `uploadIds` is yours");
  });
});
