import { db } from "../../database/psql.js";
import { logger } from "../../utils/logger.js";
import { APP_ONLY_SCOPES } from "./scopes.js";

export type RouteCaller = "app" | "session";

const appOnlyScopes: ReadonlySet<string> = new Set(APP_ONLY_SCOPES);

export function appClientIds(): ReadonlySet<string> {
  const listed = (process.env.APP_OAUTH_CLIENT_IDS ?? "").split(",").map((clientId) => clientId.trim());
  return new Set(listed.filter((clientId) => clientId !== ""));
}

export function isAppClient(clientId: string): boolean {
  return appClientIds().has(clientId);
}

export function isAppOnlyScope(scope: string): boolean {
  return appOnlyScopes.has(scope);
}

export async function warnAboutAppClients(): Promise<void> {
  const clientIds = [...appClientIds()];
  if (clientIds.length === 0) {
    logger.warn("auth.app_client.unset", {
      message: "APP_OAUTH_CLIENT_IDS is not set, so the app's requests to the measurement routes answer 503",
    });
    return;
  }

  const clients = await db.query.oauthClients.findMany({
    where: { clientId: { in: clientIds } },
    columns: { clientId: true, scopes: true, disabled: true },
  });
  for (const clientId of clientIds) {
    const client = clients.find((candidate) => candidate.clientId === clientId);
    if (!client) logger.warn("auth.app_client.missing", { clientId });
    else if (client.disabled) logger.warn("auth.app_client.disabled", { clientId });
    else if (!APP_ONLY_SCOPES.every((scope) => client.scopes?.includes(scope))) logger.warn("auth.app_client.scopes_missing", { clientId });
  }
}
