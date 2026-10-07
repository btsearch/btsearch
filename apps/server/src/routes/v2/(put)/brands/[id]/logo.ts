import { brands } from "@openbts/drizzle";
import { BRAND_LOGO_MAX_BYTES, brandLogoUploadSchema, brandParamsSchema, brandSchema } from "@openbts/shared/contract";
import type { Brand } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../../features/audit/index.js";
import { deleteBrandLogo, encodeBrandLogo, writeBrandLogo } from "../../../../../features/brands/logo.js";
import { type BrandRow, toBrand } from "../../../../../features/brands/serialize.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { readUploadedFile } from "../../../../../utils/image.js";

const schemaRoute = {
  summary: "Upload a brand's logo",
  description:
    "Uploads a logo for the brand and replaces the one it had. The old file is deleted and the new logo gets a new `url`. " +
    "SVG files are kept as SVG. They are minified and stripped of scripts, but never converted to a bitmap. " +
    "PNG and WebP images are stored as WebP and scaled down to fit within 768 by 128 pixels.",
  params: brandParamsSchema,
  response: {
    200: z.object({
      data: brandSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The `id` is invalid, the request is not multipart or has no file, or the file is larger than 512 KB or not an SVG, PNG or WebP image. " +
    "An SVG also needs a `viewBox` or a width and height in pixels, and a PNG or WebP image has to be at least 48 pixels high.",
  404: "The brand does not exist.",
};
type ReqParams = { Params: z.infer<typeof brandParamsSchema> };

async function readLogoUpload(req: FastifyRequest): Promise<Buffer> {
  try {
    for await (const part of req.parts({ limits: { fileSize: BRAND_LOGO_MAX_BYTES, files: 1 } })) {
      if (part.type !== "file") continue;

      const content = await readUploadedFile(part.file);
      if (part.file.truncated) throw new ErrorResponse("BAD_REQUEST", { message: "The logo file is too large" });

      return content;
    }
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }

  throw new ErrorResponse("BAD_REQUEST", { message: "No file provided" });
}

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Brand>>) {
  const { id } = req.params;

  const isMultipart = (req.headers["content-type"] ?? "").includes("multipart/form-data");
  if (!isMultipart) throw new ErrorResponse("BAD_REQUEST", { message: "The logo must be sent as multipart/form-data" });

  const brand = await db.query.brands.findFirst({ where: { id }, columns: { id: true } });
  if (!brand) throw new ErrorResponse("NOT_FOUND");

  const logo = await encodeBrandLogo(await readLogoUpload(req));
  const logoFile = `${crypto.randomUUID()}.${logo.extension}`;

  let replaced: { previous: BrandRow; current: BrandRow };
  try {
    await writeBrandLogo(logoFile, logo.data);
    replaced = await runAuditedOperation(standaloneAuditContext(req), { kind: "brand.update" }, async (tx, audit) => {
      const [previous] = await tx.select().from(brands).where(eq(brands.id, id)).for("update").limit(1);
      if (!previous) throw new ErrorResponse("NOT_FOUND");

      const [current] = await tx
        .update(brands)
        .set({ logoFile, logoWidth: logo.width, logoHeight: logo.height, updatedAt: new Date() })
        .where(eq(brands.id, id))
        .returning();
      if (!current) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({ entity: "brands", op: "update", recordId: id, old: previous, new: current });
      return { previous, current };
    });
  } catch (error) {
    await deleteBrandLogo(logoFile);
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
  await deleteBrandLogo(replaced.previous.logoFile);

  return res.send({ data: toBrand(replaced.current) });
}

const replaceBrandLogo: Route<ReqParams, Brand> = {
  url: "/brands/:id/logo",
  method: "PUT",
  config: {
    permissions: ["update:brands"],
    multipartBody: brandLogoUploadSchema,
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default replaceBrandLogo;
