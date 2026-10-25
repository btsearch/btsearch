export const IDENTITY_SCOPES = ["openid", "profile", "email"] as const;
export const OFFLINE_SCOPE = "offline_access";
const MEASUREMENT_UPLOAD_SCOPE = "upload:observations";

const KNOWN_WRITE_SCOPES = new Set([
  "create:comments",
  "create:user_lists",
  "update:user_lists",
  "create:submissions",
  "update:submissions",
  "delete:submissions",
  "moderate:observations",
]);

export type GroupedScopes = {
  identity: string[];
  read: string[];
  write: string[];
  unknown: string[];
  measurementUpload: boolean;
  offline: boolean;
};

export function scopeKey(scope: string) {
  return scope.replace(":", "_");
}

export function groupScopes(scopes: string[]): GroupedScopes {
  const identity: string[] = [];
  const read: string[] = [];
  const write: string[] = [];
  const unknown: string[] = [];
  let measurementUpload = false;
  let offline = false;

  for (const scope of scopes) {
    if (scope === OFFLINE_SCOPE) offline = true;
    else if (scope === MEASUREMENT_UPLOAD_SCOPE) measurementUpload = true;
    else if ((IDENTITY_SCOPES as readonly string[]).includes(scope)) identity.push(scope);
    else if (scope.startsWith("read:")) read.push(scope);
    else if (KNOWN_WRITE_SCOPES.has(scope)) write.push(scope);
    else unknown.push(scope);
  }

  return { identity, read, write, unknown, measurementUpload, offline };
}
