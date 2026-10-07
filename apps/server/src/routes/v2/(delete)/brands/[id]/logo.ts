import { brands } from "@openbts/drizzle";
import { brandParamsSchema, noContentSchema } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../../features/audit/index.js";
import { deleteBrandLogo } from "../../../../../features/brands/logo.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a brand's logo",
  description: "Removes the brand's logo and deletes the file. Returns 204 even if the brand has no logo.",
  params: brandParamsSchema,
  response: { 204: noContentSchema },
};
type ReqParams = { Params: z.infer<typeof brandParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { id } = req.params;

  const brand = await db.query.brands.findFirst({ where: { id }, columns: { logoFile: true } });
  if (!brand) throw new ErrorResponse("NOT_FOUND");
  if (brand.logoFile === null) return res.status(204).send();

  let removedFile: string | null;
  try {
    removedFile = await runAuditedOperation(standaloneAuditContext(req), { kind: "brand.update" }, async (tx, audit) => {
      const [previous] = await tx.select().from(brands).where(eq(brands.id, id)).for("update").limit(1);
      if (!previous) throw new ErrorResponse("NOT_FOUND");
      if (previous.logoFile === null) return null;

      const [current] = await tx
        .update(brands)
        .set({ logoFile: null, logoWidth: null, logoHeight: null, updatedAt: new Date() })
        .where(eq(brands.id, id))
        .returning();
      if (!current) throw new ErrorResponse("FAILED_TO_DELETE");

      await audit.log({ entity: "brands", op: "update", recordId: id, old: previous, new: current });
      return previous.logoFile;
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }
  await deleteBrandLogo(removedFile);

  return res.status(204).send();
}

const removeBrandLogo: Route<ReqParams, void> = {
  url: "/brands/:id/logo",
  method: "DELETE",
  config: {
    permissions: ["update:brands"],
    errorReasons: { 404: "The brand does not exist." },
  },
  schema: schemaRoute,
  handler,
};

export default removeBrandLogo;
