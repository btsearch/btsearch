import { brands, operators, structureOwners, ukeOperators } from "@openbts/drizzle";
import { brandParamsSchema, noContentSchema } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { deleteBrandLogo } from "../../../../features/brands/logo.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a brand",
  description: "Deletes the brand together with its logo file.",
  params: brandParamsSchema,
  response: { 204: noContentSchema },
};
type ReqParams = { Params: z.infer<typeof brandParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const brand = await db.query.brands.findFirst({ where: { id }, columns: { id: true } });
  if (!brand) throw new ErrorResponse("NOT_FOUND");

  let removedFile: string | null;
  try {
    removedFile = await runAuditedOperation(standaloneAuditContext(req), { kind: "brand.delete" }, async (tx, audit) => {
      const [[operator], [ukeOperator], [structureOwner]] = await Promise.all([
        tx.select({ id: operators.id }).from(operators).where(eq(operators.brandId, id)).limit(1),
        tx.select({ id: ukeOperators.id }).from(ukeOperators).where(eq(ukeOperators.brandId, id)).limit(1),
        tx.select({ id: structureOwners.id }).from(structureOwners).where(eq(structureOwners.brandId, id)).limit(1),
      ]);
      if (operator || ukeOperator || structureOwner) {
        throw new ErrorResponse("CONFLICT", { message: "Cannot delete a brand that operators or structure owners still use" });
      }

      const [deleted] = await tx.delete(brands).where(eq(brands.id, id)).returning();
      if (!deleted) throw new ErrorResponse("NOT_FOUND");

      await audit.log({ entity: "brands", op: "delete", recordId: id, old: deleted });
      return deleted.logoFile;
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }
  await deleteBrandLogo(removedFile);

  return res.status(204).send();
}

const deleteBrand: Route<ReqParams, void> = {
  url: "/brands/:id",
  method: "DELETE",
  config: {
    permissions: ["delete:brands"],
    errorReasons: {
      404: "The brand does not exist.",
      409: "An operator, an operator in the official register or a structure owner still uses this brand.",
    },
  },
  schema: schemaRoute,
  handler,
};

export default deleteBrand;
