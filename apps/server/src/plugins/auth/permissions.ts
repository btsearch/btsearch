import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

const permissionStatement = {
  ...defaultStatements,
  cells: ["create", "read", "update", "delete"],
  stations: ["create", "read", "update", "delete"],
  operators: ["create", "read", "update", "delete"],
  regions: ["create", "read", "update", "delete"],
  locations: ["create", "read", "update", "delete"],
  bands: ["create", "read", "update", "delete"],
  submissions: ["create", "read", "update", "delete", "read_all", "moderate", "delete_all", "cleanup"],
  settings: ["read", "update"],
  audit_operations: ["read", "revert"],
  analyzer: ["apply"],
  deleted_entries: ["read"],
  stats: ["read"],
  uke_permits: ["read", "read_unassigned"],
  uke_radiolines: ["read"],
  uke_import: ["read", "run"],
  user_lists: ["create", "read", "update", "delete", "read_all", "manage_all"],
  comments: ["create", "read", "update", "delete", "read_all", "moderate"],
  user: ["search", "resend-verification", "delete-avatar", ...defaultStatements.user],
} as const;

type PermissionStatement = typeof permissionStatement;
type PermissionResource = Extract<keyof PermissionStatement, string>;

export type RoutePermission = {
  [Resource in PermissionResource]: `${Extract<PermissionStatement[Resource][number], string>}:${Resource}`;
}[PermissionResource];

export type PermissionObject = Partial<{
  [Resource in PermissionResource]: Extract<PermissionStatement[Resource][number], string>[];
}>;

const canonicalTokenPermissions = new Set<string>(
  Object.entries(permissionStatement).flatMap(([resource, actions]) => actions.map((action) => `${action}:${resource}`)),
);

export function isKnownTokenPermission(permission: string): boolean {
  return canonicalTokenPermissions.has(permission);
}

export const accessControl = createAccessControl(permissionStatement);

export const userRole = accessControl.newRole({
  stations: ["read"],
  cells: ["read"],
  operators: ["read"],
  regions: ["read"],
  locations: ["read"],
  bands: ["read"],
  submissions: ["create", "read", "update", "delete"],
  settings: ["read"],
  deleted_entries: ["read"],
  stats: ["read"],
  uke_permits: ["read"],
  uke_radiolines: ["read"],
  user_lists: ["create", "read", "update", "delete"],
  comments: ["create", "read", "update", "delete"],
});

export const editorRole = accessControl.newRole({
  stations: ["create", "delete", "read", "update"],
  cells: ["create", "delete", "read", "update"],
  operators: ["read"],
  regions: ["read"],
  bands: ["read"],
  locations: ["create", "read", "update"],
  submissions: ["create", "read", "update", "delete", "read_all", "moderate"],
  settings: ["read"],
  deleted_entries: ["read"],
  stats: ["read"],
  uke_radiolines: ["read"],
  user_lists: ["create", "read", "update", "delete"],
  comments: ["create", "read", "update", "delete", "read_all", "moderate"],
  analyzer: ["apply"],
  uke_permits: ["read", "read_unassigned"],
  user: ["search"],
});

export const adminRole = accessControl.newRole({
  ...adminAc.statements,
  cells: ["read", "create", "update", "delete"],
  stations: ["read", "create", "update", "delete"],
  operators: ["read", "create", "update", "delete"],
  regions: ["read", "create", "update", "delete"],
  locations: ["read", "create", "update", "delete"],
  bands: ["read", "create", "update", "delete"],
  submissions: ["create", "read", "update", "delete", "read_all", "moderate", "delete_all", "cleanup"],
  settings: ["read", "update"],
  audit_operations: ["read", "revert"],
  analyzer: ["apply"],
  deleted_entries: ["read"],
  stats: ["read"],
  uke_permits: ["read", "read_unassigned"],
  uke_radiolines: ["read"],
  uke_import: ["read", "run"],
  user_lists: ["create", "read", "update", "delete", "read_all", "manage_all"],
  comments: ["create", "read", "update", "delete", "read_all", "moderate"],
  user: ["search", "resend-verification", "delete-avatar", ...adminAc.statements.user],
});
