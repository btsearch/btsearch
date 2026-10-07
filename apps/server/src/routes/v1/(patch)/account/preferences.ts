import { type CloudPreferences, users } from "@openbts/drizzle";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import {
  MAX_CLOUD_PREFERENCES_BYTES,
  cloudPreferencesPatchSchema,
  cloudPreferencesSchema,
  normalizeCloudPreferences,
} from "../../../../lib/accountPreferences.js";

const schemaRoute = {
  body: cloudPreferencesPatchSchema,
  response: {
    200: z.object({
      data: cloudPreferencesSchema,
    }),
  },
};

type ReqBody = { Body: z.infer<typeof cloudPreferencesPatchSchema> };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<CloudPreferences>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const patch = req.body;
  const patchKeys = Object.keys(patch);

  if (patchKeys.length === 0) {
    const user = await db.query.users.findFirst({
      where: { id: session.user.id },
      columns: { cloudPreferences: true },
    });

    if (!user) throw new ErrorResponse("NOT_FOUND");

    return res.send({ data: normalizeCloudPreferences(user.cloudPreferences) });
  }

  const merged = sql`coalesce(${users.cloudPreferences}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`;

  const [updated] = await db
    .update(users)
    .set({ cloudPreferences: merged })
    .where(and(eq(users.id, session.user.id), sql`octet_length((${merged})::text) <= ${MAX_CLOUD_PREFERENCES_BYTES}`))
    .returning({ cloudPreferences: users.cloudPreferences });

  if (!updated) {
    const user = await db.query.users.findFirst({ where: { id: session.user.id }, columns: { id: true } });
    if (!user) throw new ErrorResponse("NOT_FOUND");
    throw new ErrorResponse("BAD_REQUEST", { message: "Preferences are too large" });
  }

  return res.send({ data: normalizeCloudPreferences(updated.cloudPreferences) });
}

const patchAccountPreferences: Route<ReqBody, CloudPreferences> = {
  url: "/account/preferences",
  method: "PATCH",
  schema: schemaRoute,
  handler,
};

export default patchAccountPreferences;
