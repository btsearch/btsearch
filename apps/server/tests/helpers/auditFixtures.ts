import { authBoundary, dbMock } from "./boundaries.js";

export const auditOperationRow = {
  id: 7,
  kind: "settings.update",
  source: "api",
  client_key: null,
  actor_id: null,
  performed_by: null,
  ip_address: "192.0.2.1",
  user_agent: "Test Browser",
  metadata: { key: "value" },
  reverts_operation_id: null,
  reverted_by_operation_id: null,
  country_code: "PL",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

export function scriptMaintainer() {
  authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
  dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
  dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "maintainer", isCountryWide: true, regionId: null }]);
}

export function scriptAuditDetail(countryCode: string | null = "PL") {
  dbMock.enqueueFor("select", "audit_operations", [{ ...auditOperationRow, country_code: countryCode }], []);
  dbMock.enqueueFor("select", "audit_logs", [], []);
}
