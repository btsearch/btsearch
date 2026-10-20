import { spectrumHoldings } from "@openbts/drizzle";
import { noContentSchema, spectrumHoldingParamsSchema } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { assertManagesHoldings } from "../../../../features/spectrumHoldings/access.js";
import { findOperatorCountry } from "../../../../features/spectrumHoldings/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a spectrum holding",
  params: spectrumHoldingParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  403: "You are neither an administrator nor a maintainer of the operator's country.",
};
type ReqParams = { Params: z.infer<typeof spectrumHoldingParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const holding = await db.query.spectrumHoldings.findFirst({ where: { id } });
  if (!holding) throw new ErrorResponse("NOT_FOUND");

  const countryCode = await findOperatorCountry(holding.operatorId);
  await assertManagesHoldings(req, "delete", countryCode);

  try {
    await runAuditedOperation(standaloneAuditContext(req), { kind: "spectrum_holding.delete" }, async (tx, audit) => {
      await tx.delete(spectrumHoldings).where(eq(spectrumHoldings.id, id));
      await audit.log({ entity: "spectrum_holdings", op: "delete", recordId: id, old: holding });
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteSpectrumHolding: Route<ReqParams, void> = {
  url: "/spectrum-holdings/:id",
  method: "DELETE",
  config: {
    permissionsCheckedByHandler: ["delete:spectrum_holdings"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default deleteSpectrumHolding;
