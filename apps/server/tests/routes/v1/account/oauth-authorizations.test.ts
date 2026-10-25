import { describe, expect, it } from "vitest";

import deleteOAuthAuthorization from "../../../../src/routes/v1/(delete)/account/oauth-authorizations/[client_id].js";
import { dbMock, userSession } from "../../../helpers/boundaries.js";
import { auditCalls, injectMutation, scriptAudit } from "../../../helpers/mutationAssertions.js";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const options = { session: userSession(userId) };
const request = { method: "DELETE", url: "/account/oauth-authorizations/coverage-map" } as const;

describe("DELETE /account/oauth-authorizations/:client_id", () => {
  it("removes the consent, revokes the app's tokens and records the consent it removed", async () => {
    dbMock.query.oauthConsents.findFirst.mockResolvedValue({ id: "consent-1", scopes: ["openid", "read:stations"] });
    scriptAudit();
    dbMock.enqueueFor("delete", "oauth_consents", []);
    dbMock.enqueueFor("update", "oauth_access_tokens", []);
    dbMock.enqueueFor("update", "oauth_refresh_tokens", []);

    const response = await injectMutation(deleteOAuthAuthorization, request, options);

    expect(response.statusCode).toBe(204);
    expect(dbMock.calls.map((call) => `${call.operation} ${call.table}`)).toEqual(
      expect.arrayContaining(["delete oauth_consents", "update oauth_access_tokens", "update oauth_refresh_tokens"]),
    );
    expect(auditCalls().operations).toEqual([expect.objectContaining({ kind: "oauth_consent.delete", actor_id: userId })]);
    expect(auditCalls().entries).toEqual([
      expect.objectContaining({
        entity: "oauth_consents",
        op: "delete",
        record_id: "consent-1",
        old_values: { clientId: "coverage-map", scopes: ["openid", "read:stations"] },
        metadata: { user_id: userId, username: userId },
      }),
    ]);
  });

  it("answers 404 and writes nothing for an app the user never authorized", async () => {
    dbMock.query.oauthConsents.findFirst.mockResolvedValue(undefined);

    const response = await injectMutation(deleteOAuthAuthorization, request, options);

    expect(response.statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
});
