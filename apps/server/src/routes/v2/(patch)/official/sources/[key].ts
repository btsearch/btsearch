import { officialSources } from "@openbts/drizzle";
import { officialSourceParamsSchema, officialSourceSchema, officialSourceUpdateSchema } from "@openbts/shared/contract";
import type { OfficialSource, OfficialSourceUpdate } from "@openbts/shared/contract";
import { eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../../features/audit/index.js";
import { loadOfficialSources } from "../../../../../features/official/sources.js";
import { forgetSourceVisibility } from "../../../../../features/official/visibility.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update an official source",
  description:
    "Switches a source's scheduled imports or its visibility. The two are independent: `isEnabled` only pauses or resumes the schedule, " +
    "and `isVisible` only decides whether public responses include the data that has been imported. " +
    "Everything else about a source is defined in the server's code and cannot be changed here.",
  params: officialSourceParamsSchema,
  body: officialSourceUpdateSchema,
  response: {
    200: z.object({
      data: officialSourceSchema,
    }),
  },
};
const errorReasons = {
  404: "The source does not exist.",
  409: "The source's terms do not allow its data to be published (`isRedistributable` is `false`), so it cannot be made visible.",
};
type ReqBody = { Body: OfficialSourceUpdate };
type ReqParams = { Params: z.infer<typeof officialSourceParamsSchema> };
type RequestData = ReqBody & ReqParams;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<OfficialSource>>) {
  const { key } = req.params;
  const { isEnabled, isVisible } = req.body;

  const [stored] = await db.select().from(officialSources).where(eq(officialSources.key, key)).limit(1);
  if (!stored) throw new ErrorResponse("NOT_FOUND");
  if (isVisible === true && !stored.isRedistributable) {
    throw new ErrorResponse("CONFLICT", { message: "The terms of this source do not allow its data to be published, so it cannot be made visible" });
  }

  try {
    const updated = await runAuditedOperation(standaloneAuditContext(req), { kind: "official_source.update" }, async (tx, audit) => {
      const [result] = await tx
        .update(officialSources)
        .set({ isEnabled, isVisible, updatedAt: sql`now()` })
        .where(eq(officialSources.id, stored.id))
        .returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      const isChanged = result.isEnabled !== stored.isEnabled || result.isVisible !== stored.isVisible;
      if (isChanged) await audit.log({ entity: "official_sources", op: "update", recordId: stored.id, old: stored, new: result });
      return result;
    });
    await forgetSourceVisibility();

    const [source] = await loadOfficialSources([updated]);
    if (!source) throw new ErrorResponse("FAILED_TO_UPDATE");

    return res.send({ data: source });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateOfficialSource: Route<RequestData, OfficialSource> = {
  url: "/official/sources/:key",
  method: "PATCH",
  config: {
    permissions: ["run:official_import"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updateOfficialSource;
