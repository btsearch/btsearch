import { licenseeParamsSchema, licenseeUpdateAnswerSchema, licenseeUpdateSchema } from "@openbts/shared/contract";
import type { LicenseeUpdate, LicenseeUpdateAnswer } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../../features/audit/index.js";
import { fetchImportRun, recordRunRequest } from "../../../../../features/official/importRuns.js";
import { changeLicensee, fetchLicensee } from "../../../../../features/official/licensees.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a licensee",
  description:
    "What happens to `operatorId` depends on the licensee.\n\n" +
    "If the licensee has no operator, the operator you send replaces the licensee's own brand. " +
    "If the source has enabled datasets with the layer `sites`, the request also queues a `replay` import run for them, " +
    "which imports the official sites and permits that were skipped under this name.\n\n" +
    "If the licensee already has an operator, its official sites belong to that operator and have to be moved first, " +
    "so the request queues a `remap` import run. The licensee only changes once a `remap` run that is not a dry run has completed. " +
    "With `null`, the permits published under the licensee stop being listed, as for any licensee without an operator.",
  params: licenseeParamsSchema,
  body: licenseeUpdateSchema,
  response: {
    200: licenseeUpdateAnswerSchema,
  },
};
const errorReasons = {
  400: "The operator or the brand does not exist.",
  409: "You sent a brand for a licensee that has an operator, or the licensee already has a `remap` run that is queued or running.",
};
type ReqBody = { Body: LicenseeUpdate };
type ReqParams = { Params: z.infer<typeof licenseeParamsSchema> };
type RequestData = ReqBody & ReqParams;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<LicenseeUpdateAnswer>>) {
  const { id } = req.params;

  try {
    const runId = await runAuditedOperation(standaloneAuditContext(req), { kind: "licensee.update" }, (tx, audit) =>
      changeLicensee(tx, audit, id, req.body, req.userSession?.user?.id ?? null),
    );
    if (runId !== null) await recordRunRequest(req, runId, { licenseeId: id, ...req.body });

    const licensee = await fetchLicensee(id);
    if (!licensee) throw new ErrorResponse("NOT_FOUND");

    return res.send({ data: licensee, importRun: runId === null ? null : await fetchImportRun(runId) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateLicensee: Route<RequestData, LicenseeUpdateAnswer> = {
  url: "/official/licensees/:id",
  method: "PATCH",
  config: {
    permissions: ["run:official_import"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updateLicensee;
