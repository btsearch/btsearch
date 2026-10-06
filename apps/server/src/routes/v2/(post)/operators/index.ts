import { countries, operators } from "@openbts/drizzle";
import { operatorCreateSchema, operatorSchema } from "@openbts/shared/contract";
import type { Operator, OperatorCreate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { loadOperatorDetails } from "../../../../features/operators/details.js";
import { toOperator } from "../../../../features/operators/serialize.js";
import { primaryPlmnNumber, replaceLinks, replacePlmns, validateOperatorWrite } from "../../../../features/operators/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create an operator",
  description:
    "Creates an operator in a country. An operator represents a physical network. " +
    "Its name must be unique within the country, and a PLMN can only belong to one operator. " +
    "To make the operator a member of a shared network, add that network to `links`. " +
    "The shared network is an operator itself and must already exist.",
  body: operatorCreateSchema,
  response: {
    201: z.object({
      data: operatorSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, the country, the brand or a linked operator does not exist, or a linked operator belongs to another country.",
  409: "The country already has an operator with this name, or one of the PLMNs already belongs to another operator.",
};
type ReqBody = { Body: OperatorCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<Operator>>) {
  const { countryCode, brandId = null, name, legalName, shortCode = null, sortPriority = null, plmns = [], links = [] } = req.body;

  try {
    const operator = await runAuditedOperation(standaloneAuditContext(req), { kind: "operator.create" }, async (tx, audit) => {
      const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, countryCode)).limit(1);
      if (!country) throw new ErrorResponse("BAD_REQUEST", { message: "Country not found" });

      await validateOperatorWrite(tx, { countryCode, name, plmns, links, brandId });

      const [created] = await tx
        .insert(operators)
        .values({ countryCode, brandId, name, full_name: legalName, shortCode, sortPriority, mnc: primaryPlmnNumber(plmns) })
        .returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await replacePlmns(tx, created.id, plmns);
      await replaceLinks(tx, created.id, links);
      const details = (await loadOperatorDetails(tx, [created.id])).get(created.id);

      await audit.log({ entity: "operators", op: "create", recordId: created.id, new: created, metadata: { plmns, links } });
      return toOperator(created, details);
    });

    return res.status(201).send({ data: operator });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createOperator: Route<ReqBody, Operator> = {
  url: "/operators",
  method: "POST",
  config: {
    permissions: ["create:operators"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default createOperator;
