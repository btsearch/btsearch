import { bands } from "@openbts/drizzle";
import { bandCreateSchema, bandSchema } from "@openbts/shared/contract";
import type { Band, BandCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { toBand } from "../../../../features/bands/serialize.js";
import { assertBandFree, requireCatalogBand } from "../../../../features/bands/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create a band",
  description:
    "Creates a band from the 3GPP catalogue. " +
    "You cannot invent a band, so `code` has to be a catalogue code such as `E-GSM900`, `VIII`, `B3` or `n78`. " +
    "The technology, duplex mode and frequency ranges are taken from the catalogue, and so is `labelMhz` if you leave it out. " +
    "Each catalogue band can exist once per `variant`, which defaults to `commercial`. " +
    "A new band is not in any country's band plan yet, so add it with `PUT /countries/{code}/bands/{bandId}` before cells there can use it.",
  body: bandCreateSchema,
  response: {
    201: z.object({
      data: bandSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, `code` is not in the 3GPP catalogue, or it is an uplink-only band, which cannot hold cells.",
  409: "This catalogue band already exists with the same `variant`, or another band already uses this `name`.",
};
type ReqBody = { Body: BandCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<Band>>) {
  const { code, name, variant = "commercial", labelMhz } = req.body;
  const { rat, duplex, labelMhz: catalogLabelMhz } = requireCatalogBand(code);

  try {
    const band = await runAuditedOperation(standaloneAuditContext(req), { kind: "band.create" }, async (tx, audit) => {
      await assertBandFree(tx, { rat, variant, code, name });

      const [created] = await tx
        .insert(bands)
        .values({ rat, value: labelMhz ?? catalogLabelMhz, name, duplex, variant, code })
        .returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "bands", op: "create", recordId: created.id, new: created });
      return created;
    });

    return res.status(201).send({ data: toBand(band) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createBand: Route<ReqBody, Band> = {
  url: "/bands",
  method: "POST",
  config: {
    permissions: ["create:bands"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default createBand;
