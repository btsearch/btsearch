import type { FastifyContextConfig } from "fastify";

import { API_KEY_PERMISSIONS } from "../../plugins/auth/permissions.js";
import { OAUTH_SCOPES, OIDC_SCOPES } from "../../plugins/auth/scopes.js";

export type SecurityRequirement = Record<string, readonly string[]>;

const AUTH_BASE_PATH = "/api/v1/auth";
const SIGNED_IN_USER_SCOPE = "profile";
const OIDC_SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: "Sign the user in and identify them",
  profile: "Act as the signed-in user wherever no specific permission is needed: their account, lists, notifications and watched stations",
  email: "Read the user's email address",
  offline_access: "Keep access through a refresh token after the user has left",
} satisfies Record<(typeof OIDC_SCOPES)[number], string>;

export const SECURITY_FOR_ANY_ACCOUNT_CREDENTIAL: SecurityRequirement[] = [{ session: [] }, { apiKey: [] }, { oauth: [SIGNED_IN_USER_SCOPE] }];

const apiKeyPermissions: ReadonlySet<string> = new Set(
  Object.entries(API_KEY_PERMISSIONS).flatMap(([resource, actions]) => actions.map((action) => `${action}:${resource}`)),
);
const oauthScopes: ReadonlySet<string> = new Set(OAUTH_SCOPES);

function describeScope(scope: string): string {
  const oidcDescription = OIDC_SCOPE_DESCRIPTIONS[scope];
  if (oidcDescription !== undefined) return oidcDescription;

  const [action = "", resource = ""] = scope.split(":");
  const words = `${action} ${resource}`.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function buildSecuritySchemes(baseUrl: string) {
  return {
    session: {
      type: "apiKey" as const,
      in: "cookie",
      name: "openbts.session_token",
      description:
        `The session cookie the site sets when you sign in through ${AUTH_BASE_PATH}. Over HTTPS its name gets the \`__Secure-\` prefix. ` +
        "The names listed on an endpoint are the permissions your role needs. " +
        "Editors also need access to the country or region the request touches.",
    },
    apiKey: {
      type: "apiKey" as const,
      in: "header",
      name: "X-Api-Key",
      description:
        "A personal API key (`sk_...`), meant for reading public data. API keys never carry staff permissions. " +
        "The names listed on an endpoint are the permissions the key needs. " +
        "Publishable keys (`pk_...`) work on every endpoint that is also open to guests.",
    },
    oauth: {
      type: "oauth2" as const,
      description:
        "An access token issued to an application the user has approved, sent as `Authorization: Bearer <token>`. " +
        "The names listed on an endpoint are the scopes the token needs. Staff scopes only work if the user also has the matching role.",
      flows: {
        authorizationCode: {
          authorizationUrl: `${baseUrl}${AUTH_BASE_PATH}/oauth2/authorize`,
          tokenUrl: `${baseUrl}${AUTH_BASE_PATH}/oauth2/token`,
          refreshUrl: `${baseUrl}${AUTH_BASE_PATH}/oauth2/token`,
          scopes: Object.fromEntries(OAUTH_SCOPES.map((scope) => [scope, describeScope(scope)])),
        },
      },
    },
  };
}

export function securityFor(config: FastifyContextConfig): SecurityRequirement[] {
  const { permissions = [], permissionsCheckedByHandler = [], allowGuestAccess = false } = config;
  const required = [...permissions, ...permissionsCheckedByHandler];
  const needsSignedInUser = !allowGuestAccess && required.length === 0;
  const isOpenToApiKeys = !needsSignedInUser && required.every((permission) => apiKeyPermissions.has(permission));
  const isOpenToTokens = required.every((permission) => oauthScopes.has(permission));

  const requirements: SecurityRequirement[] = [];
  if (allowGuestAccess) requirements.push({});
  requirements.push({ session: allowGuestAccess ? [] : required });
  if (isOpenToApiKeys) requirements.push({ apiKey: required });
  if (isOpenToTokens) requirements.push({ oauth: needsSignedInUser ? [SIGNED_IN_USER_SCOPE] : required });
  return requirements;
}
