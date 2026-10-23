import { appSigningKeys, oauthClients } from "@openbts/drizzle";
import { sql as connection, db } from "@openbts/drizzle/db";
import { eq } from "drizzle-orm";
import { parseArgs } from "node:util";

import { collectorClientIds } from "../plugins/auth/appClient.js";
import { APP_ONLY_SCOPES, OAUTH_SCOPES } from "../plugins/auth/scopes.js";

const USAGE = [
  "usage: setupAppClient --client-id <id> [--name <name>] --redirect-uri <uri> [--redirect-uri <uri> ...] --package <name> --signing-digest <sha256> [--signing-digest <sha256> ...] [--development] [--apply]",
  "writes the OAuth client of a collector app and the app's signing keys",
  "--client-id must be one of COLLECTOR_OAUTH_CLIENT_IDS; --name is what the consent screen shows, BTSearch unless given",
  "--redirect-uri is the https App Link the app signs in through",
  "--development also allows loopback and custom-scheme redirects, such as http://127.0.0.1/callback; any app on a phone can receive those, so never on production",
  "--signing-digest is the SHA-256 of a certificate the app is signed with, in hex, with or without colons; repeat it for every key",
  "without --apply nothing is written, and the script prints what it would write",
].join("\n");

const SHA256_HEX = /^[0-9a-f]{64}$/;

function usageError(problem: string): Error {
  return new Error(`${problem}\n${USAGE}`);
}

function readArguments() {
  const { values } = parseArgs({
    options: {
      "client-id": { type: "string" },
      name: { type: "string", default: "BTSearch" },
      "redirect-uri": { type: "string", multiple: true, default: [] },
      package: { type: "string" },
      "signing-digest": { type: "string", multiple: true, default: [] },
      development: { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
    },
  });
  const clientId = values["client-id"];
  const digests = values["signing-digest"].map((digest) => digest.replaceAll(":", "").toLowerCase());
  const redirectUris = values["redirect-uri"];
  if (!clientId || !values.package || redirectUris.length === 0 || digests.length === 0) throw new Error(USAGE);
  if (!collectorClientIds().has(clientId)) throw usageError(`${clientId} is not listed in COLLECTOR_OAUTH_CLIENT_IDS.`);
  if (!digests.every((digest) => SHA256_HEX.test(digest))) throw usageError("Every --signing-digest must be a SHA-256 in hex.");
  if (!redirectUris.every((uri) => URL.canParse(uri))) throw usageError("Every --redirect-uri must be an absolute URI.");
  const isEveryRedirectHttps = redirectUris.every((uri) => new URL(uri).protocol === "https:");
  if (!values.development && !isEveryRedirectHttps) throw usageError("Without --development every --redirect-uri must be https.");

  return { clientId, name: values.name, packageName: values.package, redirectUris, digests, apply: values.apply };
}

async function main() {
  const { clientId, name, packageName, redirectUris, digests, apply } = readArguments();
  const client = {
    clientId,
    name,
    userId: null,
    clientSecret: null,
    disabled: false,
    skipConsent: false,
    tokenEndpointAuthMethod: "none",
    applicationType: "native",
    requirePKCE: true,
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    redirectUris,
    scopes: [...OAUTH_SCOPES, ...APP_ONLY_SCOPES],
  };

  const existing = await db.query.oauthClients.findFirst({ where: { clientId }, columns: { id: true } });
  console.log(`${existing ? "update" : "create"} OAuth client ${clientId}: redirect URIs ${redirectUris.join(", ")}; ${client.scopes.length} scopes`);
  for (const digest of digests) console.log(`signing key ${digest} for ${packageName}`);
  if (!apply) {
    console.log("dry run: nothing written. Run again with --apply");
    return;
  }

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(oauthClients)
        .set({ ...client, updatedAt: new Date() })
        .where(eq(oauthClients.id, existing.id));
    } else {
      await tx.insert(oauthClients).values(client);
    }
    for (const digest of digests) {
      await tx
        .insert(appSigningKeys)
        .values({ digest: Buffer.from(digest, "hex"), package: packageName })
        .onConflictDoUpdate({ target: appSigningKeys.digest, set: { package: packageName } });
    }
  });
  console.log("written");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await connection.end();
    process.exit();
  });
