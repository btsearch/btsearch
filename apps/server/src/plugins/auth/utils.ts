import { ErrorResponse } from "../../errors.js";
import { auth } from "../betterauth.plugin.js";
import { isKnownTokenPermission } from "./permissions.js";
import type { PermissionObject, RoutePermission } from "./permissions.js";

export function convertToPermissionObject(permissions: readonly RoutePermission[] | undefined): PermissionObject | undefined {
  if (!permissions?.length) return undefined;

  const converted: Record<string, string[]> = {};
  for (const permission of permissions) {
    const separatorIndex = permission.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex !== permission.lastIndexOf(":"))
      throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: `Invalid route permission: ${permission}` });

    const action = permission.slice(0, separatorIndex);
    const resource = permission.slice(separatorIndex + 1);
    if (!isKnownTokenPermission(permission)) throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: `Invalid route permission: ${permission}` });

    const resourcePermissions = (converted[resource] ??= []);
    if (!resourcePermissions.includes(action)) resourcePermissions.push(action);
  }

  return converted;
}

export async function verifyPermissions(userId: string, permissions: PermissionObject): Promise<boolean> {
  const hasPerm = await auth.api.userHasPermission({
    body: {
      userId,
      permissions,
    },
  });

  return hasPerm.success === true;
}
