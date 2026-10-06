import { structureOwners } from "@openbts/drizzle";
import { structureOwnerParamsSchema, structureOwnerSchema, structureOwnerUpdateSchema } from "@openbts/shared/contract";
import type { StructureOwner, StructureOwnerUpdate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { toStructureOwner } from "../../../../features/structures/serialize.js";
import { validateStructureOwnerWrite } from "../../../../features/structures/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a structure owner",
  params: structureOwnerParamsSchema,
  body: structureOwnerUpdateSchema,
  response: {
    200: z.object({
      data: structureOwnerSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, the country, brand or operator does not exist, or the operator belongs to a different country than the owner.",
  404: "The structure owner does not exist.",
  409:
    "An owner with the same `name`, compared case-insensitively, already exists in that country or among the owners without a country. " +
    "Also returned when the operator already has an owner entry, or when you set a country while locations elsewhere still use the owner.",
};
type ReqBody = { Body: StructureOwnerUpdate };
type ReqParams = { Params: z.infer<typeof structureOwnerParamsSchema> };
type RequestData = ReqBody & ReqParams;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<StructureOwner>>) {
  const { id } = req.params;
  const { name, countryCode, brandId, operatorId } = req.body;

  const owner = await db.query.structureOwners.findFirst({ where: { id } });
  if (!owner) throw new ErrorResponse("NOT_FOUND");

  const next = {
    name: name ?? owner.name,
    countryCode: countryCode === undefined ? owner.countryCode : countryCode,
    brandId: brandId === undefined ? owner.brandId : brandId,
    operatorId: operatorId === undefined ? owner.operatorId : operatorId,
  };

  try {
    const updated = await runAuditedOperation(standaloneAuditContext(req), { kind: "structure_owner.update" }, async (tx, audit) => {
      await validateStructureOwnerWrite(tx, next, owner);

      const [result] = await tx
        .update(structureOwners)
        .set({ name, countryCode, brandId, operatorId, updatedAt: new Date() })
        .where(eq(structureOwners.id, id))
        .returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({ entity: "structure_owners", op: "update", recordId: id, old: owner, new: result });
      return result;
    });

    return res.send({ data: toStructureOwner(updated) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateStructureOwner: Route<RequestData, StructureOwner> = {
  url: "/structure-owners/:id",
  method: "PATCH",
  config: {
    permissions: ["update:structure_owners"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updateStructureOwner;
