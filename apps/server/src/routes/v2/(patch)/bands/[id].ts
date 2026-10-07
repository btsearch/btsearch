import { bands } from "@openbts/drizzle";
import { bandParamsSchema, bandSchema, bandUpdateSchema } from "@openbts/shared/contract";
import type { Band, BandUpdate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { toBand } from "../../../../features/bands/serialize.js";
import { isUnknownBand } from "../../../../features/bands/unknown.js";
import { assertBandFree, assertCodelessBandFree, requireCatalogBand } from "../../../../features/bands/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a band",
  description:
    "Updates a band. A band cannot move to another technology, so a new `code` has to be a 3GPP catalogue code of the same technology. " +
    "When you change `code`, the duplex mode follows the catalogue, and so does `labelMhz` unless you send it.",
  params: bandParamsSchema,
  body: bandUpdateSchema,
  response: {
    200: z.object({
      data: bandSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, `code` is not in the 3GPP catalogue, it is an uplink-only band, or it belongs to another technology than the band.",
  404: "The band does not exist.",
  409: "The change would make this band a duplicate of another one, or another band already uses this `name`.",
};
type ReqBody = { Body: BandUpdate };
type ReqParams = { Params: z.infer<typeof bandParamsSchema> };
type RequestData = ReqBody & ReqParams;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Band>>) {
  const { id } = req.params;
  const { code, name, variant, labelMhz } = req.body;

  const band = await db.query.bands.findFirst({ where: { id } });
  if (!band || isUnknownBand(band)) throw new ErrorResponse("NOT_FOUND");

  const catalog = code === undefined ? null : requireCatalogBand(code);
  if (catalog && catalog.rat !== band.rat) throw new ErrorResponse("BAD_REQUEST", { message: "A band cannot move to another technology" });
  const value = labelMhz ?? (code === band.code ? undefined : catalog?.labelMhz);

  try {
    const updated = await runAuditedOperation(standaloneAuditContext(req), { kind: "band.update" }, async (tx, audit) => {
      const changesIdentity = code !== undefined || variant !== undefined;
      const nextVariant = variant ?? band.variant;
      await assertBandFree(tx, { id, rat: band.rat, variant: nextVariant, code: changesIdentity ? (code ?? band.code) : null, name });
      if (code === undefined && band.code === null && (variant !== undefined || labelMhz !== undefined)) {
        await assertCodelessBandFree(tx, { ...band, variant: nextVariant, value: labelMhz ?? band.value });
      }

      const [result] = await tx.update(bands).set({ code, name, variant, value, duplex: catalog?.duplex }).where(eq(bands.id, id)).returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({ entity: "bands", op: "update", recordId: id, old: band, new: result });
      return result;
    });

    return res.send({ data: toBand(updated) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateBand: Route<RequestData, Band> = {
  url: "/bands/:id",
  method: "PATCH",
  config: {
    permissions: ["update:bands"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updateBand;
