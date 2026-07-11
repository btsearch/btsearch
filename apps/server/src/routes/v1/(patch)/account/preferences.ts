import { type CloudPreferences, users } from "@openbts/drizzle";
import { eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { cloudPreferencesPatchSchema, cloudPreferencesSchema, normalizeCloudPreferences } from "../../../../lib/accountPreferences.js";

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

  const currentPreferences = sql`coalesce(${users.cloudPreferences}, '{}'::jsonb)`;

  const [updated] = await db
    .update(users)
    .set({ cloudPreferences: sql`${currentPreferences} || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(users.id, session.user.id))
    .returning({ cloudPreferences: users.cloudPreferences });

  if (!updated) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: normalizeCloudPreferences(updated.cloudPreferences) });
}

const patchAccountPreferences: Route<ReqBody, CloudPreferences> = {
  url: "/account/preferences",
  method: "PATCH",
  schema: schemaRoute,
  handler,
};

export default patchAccountPreferences;
