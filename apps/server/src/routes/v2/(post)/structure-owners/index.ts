import { structureOwners } from "@openbts/drizzle";
import { structureOwnerCreateSchema, structureOwnerSchema } from "@openbts/shared/contract";
import type { StructureOwner, StructureOwnerCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { assertCanCreateStructureOwner } from "../../../../features/structures/access.js";
import { toStructureOwner } from "../../../../features/structures/serialize.js";
import { validateStructureOwnerWrite } from "../../../../features/structures/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create a structure owner",
  description:
    "Creates a structure owner. An owner with a `countryCode` can only be used on locations in that country, " +
    "so leave it out for a company that owns structures in several countries. " +
    "Administrators can create any owner. Editors can only create an owner for a country they have a grant in: " +
    "it needs a `countryCode` of such a country, and it cannot have a `brandId` or an `operatorId`.",
  body: structureOwnerCreateSchema,
  response: {
    201: z.object({
      data: structureOwnerSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, the country, brand or operator does not exist, or the operator belongs to a different country than the owner.",
  403:
    "You need to be an administrator, or an editor with a grant in the owner's country. " +
    "Only administrators can create an owner without a `countryCode`, or with a `brandId` or an `operatorId`.",
  409:
    "An owner with the same `name`, compared case-insensitively, already exists in that country or among the owners without a country. " +
    "Also returned when the operator already has an owner entry.",
};
type ReqBody = { Body: StructureOwnerCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<StructureOwner>>) {
  const { name, countryCode = null, brandId = null, operatorId = null } = req.body;
  await assertCanCreateStructureOwner(req, { countryCode, brandId, operatorId });

  try {
    const owner = await runAuditedOperation(standaloneAuditContext(req), { kind: "structure_owner.create" }, async (tx, audit) => {
      await validateStructureOwnerWrite(tx, { name, countryCode, brandId, operatorId });

      const [created] = await tx.insert(structureOwners).values({ name, countryCode, brandId, operatorId }).returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "structure_owners", op: "create", recordId: created.id, new: created });
      return created;
    });

    return res.status(201).send({ data: toStructureOwner(owner) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createStructureOwner: Route<ReqBody, StructureOwner> = {
  url: "/structure-owners",
  method: "POST",
  config: {
    permissionsCheckedByHandler: ["create:structure_owners"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default createStructureOwner;
