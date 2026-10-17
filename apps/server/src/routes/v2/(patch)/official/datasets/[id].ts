import { officialDatasets, officialSources } from "@openbts/drizzle";
import { officialDatasetParamsSchema, officialDatasetSchema, officialDatasetUpdateSchema } from "@openbts/shared/contract";
import type { OfficialDataset, OfficialDatasetUpdate } from "@openbts/shared/contract";
import { eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../../features/audit/index.js";
import { loadDatasetSlices, toOfficialDataset } from "../../../../../features/official/sources.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a dataset of an official source",
  description:
    "Pauses or resumes one dataset, changes how often it is checked for a new release, or changes when its slices are held. " +
    "A dataset's key and what it holds are defined in the server's code and cannot be changed here.",
  params: officialDatasetParamsSchema,
  body: officialDatasetUpdateSchema,
  response: {
    200: z.object({
      data: officialDatasetSchema,
    }),
  },
};
type ReqBody = { Body: OfficialDatasetUpdate };
type ReqParams = { Params: z.infer<typeof officialDatasetParamsSchema> };
type RequestData = ReqBody & ReqParams;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<OfficialDataset>>) {
  const { id } = req.params;
  const { isEnabled, checkEveryHours, holdShrinkPercent } = req.body;

  const [stored] = await db
    .select({ dataset: officialDatasets, sourceKey: officialSources.key })
    .from(officialDatasets)
    .innerJoin(officialSources, eq(officialSources.id, officialDatasets.sourceId))
    .where(eq(officialDatasets.id, id))
    .limit(1);
  if (!stored) throw new ErrorResponse("NOT_FOUND");

  try {
    const updated = await runAuditedOperation(standaloneAuditContext(req), { kind: "official_dataset.update" }, async (tx, audit) => {
      const [result] = await tx
        .update(officialDatasets)
        .set({ isEnabled, checkEveryHours, holdShrinkPercent, updatedAt: sql`now()` })
        .where(eq(officialDatasets.id, id))
        .returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      const isChanged =
        result.isEnabled !== stored.dataset.isEnabled ||
        result.checkEveryHours !== stored.dataset.checkEveryHours ||
        result.holdShrinkPercent !== stored.dataset.holdShrinkPercent;
      if (isChanged) await audit.log({ entity: "official_datasets", op: "update", recordId: id, old: stored.dataset, new: result });
      return result;
    });

    return res.send({ data: toOfficialDataset(updated, stored.sourceKey, await loadDatasetSlices([id])) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateOfficialDataset: Route<RequestData, OfficialDataset> = {
  url: "/official/datasets/:id",
  method: "PATCH",
  config: {
    permissions: ["run:official_import"],
  },
  schema: schemaRoute,
  handler,
};

export default updateOfficialDataset;
