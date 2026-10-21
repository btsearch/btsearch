import { spectrumHoldings } from "@openbts/drizzle";
import { spectrumHoldingCreateSchema, spectrumHoldingSchema } from "@openbts/shared/contract";
import type { SpectrumHolding, SpectrumHoldingCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { assertManagesHoldings } from "../../../../features/spectrumHoldings/access.js";
import { toSpectrumHolding } from "../../../../features/spectrumHoldings/serialize.js";
import { findOperatorCountry, validateSpectrumHoldingWrite } from "../../../../features/spectrumHoldings/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create a spectrum holding",
  body: spectrumHoldingCreateSchema,
  response: {
    201: z.object({
      data: spectrumHoldingSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The operator does not exist, the joint operator is the same operator or is in another country, " +
    "the band is not in the plan of the operator's country or does not contain the ranges, " +
    "the uplink does not match the band's duplex mode, or the region is in another country.",
  403: "You are neither an administrator nor a maintainer of the operator's country.",
  409: "The holding overlaps another one in the same country, in the same region or nationwide, on at least one day.",
};
type ReqBody = { Body: SpectrumHoldingCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<SpectrumHolding>>) {
  const {
    operatorId,
    jointOperatorId = null,
    bandId,
    regionId = null,
    downlinkKhz,
    uplinkKhz = null,
    validFrom = null,
    validTo = null,
    source = null,
  } = req.body;
  const countryCode = await findOperatorCountry(operatorId);
  await assertManagesHoldings(req, "create", countryCode);

  const values = {
    operatorId,
    jointOperatorId,
    bandId,
    regionId,
    downlinkLowKhz: downlinkKhz[0],
    downlinkHighKhz: downlinkKhz[1],
    uplinkLowKhz: uplinkKhz?.[0] ?? null,
    uplinkHighKhz: uplinkKhz?.[1] ?? null,
    validFrom,
    validTo,
  };

  try {
    const holding = await runAuditedOperation(standaloneAuditContext(req), { kind: "spectrum_holding.create" }, async (tx, audit) => {
      await validateSpectrumHoldingWrite(tx, countryCode, values);

      const [created] = await tx
        .insert(spectrumHoldings)
        .values({ ...values, source })
        .returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "spectrum_holdings", op: "create", recordId: created.id, new: created });
      return created;
    });

    return res.status(201).send({ data: toSpectrumHolding(holding) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createSpectrumHolding: Route<ReqBody, SpectrumHolding> = {
  url: "/spectrum-holdings",
  method: "POST",
  config: {
    permissionsCheckedByHandler: ["create:spectrum_holdings"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default createSpectrumHolding;
