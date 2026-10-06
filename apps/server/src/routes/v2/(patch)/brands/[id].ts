import { brands } from "@openbts/drizzle";
import { brandParamsSchema, brandSchema, brandUpdateSchema } from "@openbts/shared/contract";
import type { Brand, BrandUpdate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { toBrand } from "../../../../features/brands/serialize.js";
import { assertBrandSlugFree } from "../../../../features/brands/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a brand",
  params: brandParamsSchema,
  body: brandUpdateSchema,
  response: {
    200: z.object({
      data: brandSchema,
    }),
  },
};
type ReqBody = { Body: BrandUpdate };
type ReqParams = { Params: z.infer<typeof brandParamsSchema> };
type RequestData = ReqBody & ReqParams;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Brand>>) {
  const { id } = req.params;
  const { slug, name, color } = req.body;

  const brand = await db.query.brands.findFirst({ where: { id } });
  if (!brand) throw new ErrorResponse("NOT_FOUND");

  try {
    const updated = await runAuditedOperation(standaloneAuditContext(req), { kind: "brand.update" }, async (tx, audit) => {
      if (slug !== undefined) await assertBrandSlugFree(tx, slug, id);

      const [result] = await tx.update(brands).set({ slug, name, color, updatedAt: new Date() }).where(eq(brands.id, id)).returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({ entity: "brands", op: "update", recordId: id, old: brand, new: result });
      return result;
    });

    return res.send({ data: toBrand(updated) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateBrand: Route<RequestData, Brand> = {
  url: "/brands/:id",
  method: "PATCH",
  config: {
    permissions: ["update:brands"],
    errorReasons: { 404: "The brand does not exist.", 409: "Another brand already uses this `slug`." },
  },
  schema: schemaRoute,
  handler,
};

export default updateBrand;
