import { brands } from "@openbts/drizzle";
import { brandCreateSchema, brandSchema } from "@openbts/shared/contract";
import type { Brand, BrandCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { toBrand } from "../../../../features/brands/serialize.js";
import { assertBrandSlugFree } from "../../../../features/brands/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create a brand",
  description: "Creates a brand without a logo. Upload one afterwards with `PUT /brands/{id}/logo`.",
  body: brandCreateSchema,
  response: {
    201: z.object({
      data: brandSchema,
    }),
  },
};
type ReqBody = { Body: BrandCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<Brand>>) {
  const { slug, name, color } = req.body;

  try {
    const brand = await runAuditedOperation(standaloneAuditContext(req), { kind: "brand.create" }, async (tx, audit) => {
      await assertBrandSlugFree(tx, slug);

      const [created] = await tx.insert(brands).values({ slug, name, color }).returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "brands", op: "create", recordId: created.id, new: created });
      return created;
    });

    return res.status(201).send({ data: toBrand(brand) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createBrand: Route<ReqBody, Brand> = {
  url: "/brands",
  method: "POST",
  config: {
    permissions: ["create:brands"],
    errorReasons: { 409: "Another brand already uses this `slug`." },
  },
  schema: schemaRoute,
  handler,
};

export default createBrand;
