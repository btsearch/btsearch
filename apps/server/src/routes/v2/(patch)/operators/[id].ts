import { operators } from "@openbts/drizzle";
import { operatorParamsSchema, operatorSchema, operatorUpdateSchema } from "@openbts/shared/contract";
import type { Operator, OperatorUpdate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { type AuditMetadata, runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { loadOperatorDetails } from "../../../../features/operators/details.js";
import { toOperator } from "../../../../features/operators/serialize.js";
import { primaryPlmnNumber, replaceLinks, replacePlmns, validateOperatorWrite } from "../../../../features/operators/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update an operator",
  description:
    "Updates an operator. `links` lists the shared networks this operator is a member of, " +
    "so to add or remove a member of a shared network you update the member, not the network. " +
    "You cannot move an operator to another country.",
  params: operatorParamsSchema,
  body: operatorUpdateSchema,
  response: {
    200: z.object({
      data: operatorSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The request is invalid, or the brand or a linked operator does not exist. Also returned when a link points to the operator itself, " +
    "to an operator in another country, or to an operator that is already a member of this one.",
  404: "The operator does not exist.",
  409: "The country already has an operator with this name, or one of the PLMNs already belongs to another operator.",
};
type ReqBody = { Body: OperatorUpdate };
type ReqParams = { Params: z.infer<typeof operatorParamsSchema> };
type RequestData = ReqBody & ReqParams;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Operator>>) {
  const { id } = req.params;
  const { brandId, name, legalName, shortCode, sortPriority, plmns, links } = req.body;

  const operator = await db.query.operators.findFirst({ where: { id } });
  if (!operator) throw new ErrorResponse("NOT_FOUND");

  try {
    const updated = await runAuditedOperation(standaloneAuditContext(req), { kind: "operator.update" }, async (tx, audit) => {
      await validateOperatorWrite(tx, { id, countryCode: operator.countryCode, name, plmns, links, brandId });
      const previous = (await loadOperatorDetails(tx, [id])).get(id);

      const columns = { brandId, name, full_name: legalName, shortCode, sortPriority, mnc: primaryPlmnNumber(plmns) };
      const hasColumnChange = Object.values(columns).some((value) => value !== undefined);
      const [result] = hasColumnChange ? await tx.update(operators).set(columns).where(eq(operators.id, id)).returning() : [operator];
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      if (plmns) await replacePlmns(tx, id, plmns);
      if (links) await replaceLinks(tx, id, links);
      const details = (await loadOperatorDetails(tx, [id])).get(id);

      const before = toOperator(operator, previous);
      const after = toOperator(result, details);
      const metadata: AuditMetadata = {};
      if (plmns) metadata.plmns = { old: before.plmns, new: after.plmns };
      if (links) metadata.links = { old: before.links, new: after.links };
      await audit.log({ entity: "operators", op: "update", recordId: id, old: operator, new: result, metadata });
      return after;
    });

    return res.send({ data: updated });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateOperator: Route<RequestData, Operator> = {
  url: "/operators/:id",
  method: "PATCH",
  config: {
    permissions: ["update:operators"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updateOperator;
