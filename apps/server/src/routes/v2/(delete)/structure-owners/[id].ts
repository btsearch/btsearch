import { locations, proposedLocations, structureOwners, submissions } from "@openbts/drizzle";
import { noContentSchema, structureOwnerParamsSchema } from "@openbts/shared/contract";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a structure owner",
  params: structureOwnerParamsSchema,
  response: { 204: noContentSchema },
};
type ReqParams = { Params: z.infer<typeof structureOwnerParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const owner = await db.query.structureOwners.findFirst({ where: { id }, columns: { id: true } });
  if (!owner) throw new ErrorResponse("NOT_FOUND");

  try {
    await runAuditedOperation(standaloneAuditContext(req), { kind: "structure_owner.delete" }, async (tx, audit) => {
      const [[location], [pendingProposal]] = await Promise.all([
        tx.select({ id: locations.id }).from(locations).where(eq(locations.structure_owner_id, id)).limit(1),
        tx
          .select({ id: proposedLocations.id })
          .from(proposedLocations)
          .innerJoin(submissions, eq(submissions.id, proposedLocations.submission_id))
          .where(and(eq(proposedLocations.structure_owner_id, id), eq(submissions.status, "pending")))
          .limit(1),
      ]);
      if (location) throw new ErrorResponse("CONFLICT", { message: "Cannot delete a structure owner that locations still use" });
      if (pendingProposal) throw new ErrorResponse("CONFLICT", { message: "Cannot delete a structure owner that a pending submission still names" });

      const [deleted] = await tx.delete(structureOwners).where(eq(structureOwners.id, id)).returning();
      if (!deleted) throw new ErrorResponse("NOT_FOUND");

      await audit.log({ entity: "structure_owners", op: "delete", recordId: id, old: deleted });
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteStructureOwner: Route<ReqParams, void> = {
  url: "/structure-owners/:id",
  method: "DELETE",
  config: {
    permissions: ["delete:structure_owners"],
    errorReasons: {
      404: "The structure owner does not exist.",
      409: "The owner is still used by a location, or a pending submission refers to it.",
    },
  },
  schema: schemaRoute,
  handler,
};

export default deleteStructureOwner;
