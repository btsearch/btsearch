import { spectrumHoldings } from "@openbts/drizzle";
import { spectrumHoldingParamsSchema, spectrumHoldingSchema, spectrumHoldingUpdateSchema } from "@openbts/shared/contract";
import type { SpectrumHolding, SpectrumHoldingUpdate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { assertManagesHoldings } from "../../../../features/spectrumHoldings/access.js";
import { toSpectrumHolding } from "../../../../features/spectrumHoldings/serialize.js";
import { findOperatorCountry, validateSpectrumHoldingWrite } from "../../../../features/spectrumHoldings/write.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a spectrum holding",
  description: "The holding is checked again as a whole, with the fields you send in place of the stored ones.",
  params: spectrumHoldingParamsSchema,
  body: spectrumHoldingUpdateSchema,
  response: {
    200: z.object({
      data: spectrumHoldingSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The new operator does not exist or is in another country, the joint operator is the same operator or is in another country, " +
    "the band is not in the plan or does not contain the ranges, " +
    "the uplink does not match the band's duplex mode, the region is in another country, or `validFrom` is after `validTo`.",
  403: "You are neither an administrator nor a maintainer of the operator's country.",
  409: "The holding would overlap another one in the same country, in the same region or nationwide, on at least one day.",
};
type ReqBody = { Body: SpectrumHoldingUpdate };
type ReqParams = { Params: z.infer<typeof spectrumHoldingParamsSchema> };
type RequestData = ReqBody & ReqParams;

function sentOrStored<T>(sent: T | undefined, stored: T): T {
  return sent === undefined ? stored : sent;
}

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<SpectrumHolding>>) {
  const { id } = req.params;
  const { operatorId, jointOperatorId, bandId, regionId, downlinkKhz, uplinkKhz, validFrom, validTo, source } = req.body;

  const holding = await db.query.spectrumHoldings.findFirst({ where: { id } });
  if (!holding) throw new ErrorResponse("NOT_FOUND");

  const countryCode = await findOperatorCountry(holding.operatorId);
  await assertManagesHoldings(req, "update", countryCode);
  if (operatorId !== undefined && operatorId !== holding.operatorId) {
    const newCountryCode = await findOperatorCountry(operatorId);
    if (newCountryCode !== countryCode) throw new ErrorResponse("BAD_REQUEST", { message: "The operator belongs to another country" });
  }

  const changes = {
    operatorId,
    jointOperatorId,
    bandId,
    regionId,
    downlinkLowKhz: downlinkKhz?.[0],
    downlinkHighKhz: downlinkKhz?.[1],
    uplinkLowKhz: uplinkKhz === undefined ? undefined : (uplinkKhz?.[0] ?? null),
    uplinkHighKhz: uplinkKhz === undefined ? undefined : (uplinkKhz?.[1] ?? null),
    validFrom,
    validTo,
    source,
  };
  const next = {
    operatorId: sentOrStored(changes.operatorId, holding.operatorId),
    jointOperatorId: sentOrStored(changes.jointOperatorId, holding.jointOperatorId),
    bandId: sentOrStored(changes.bandId, holding.bandId),
    regionId: sentOrStored(changes.regionId, holding.regionId),
    downlinkLowKhz: sentOrStored(changes.downlinkLowKhz, holding.downlinkLowKhz),
    downlinkHighKhz: sentOrStored(changes.downlinkHighKhz, holding.downlinkHighKhz),
    uplinkLowKhz: sentOrStored(changes.uplinkLowKhz, holding.uplinkLowKhz),
    uplinkHighKhz: sentOrStored(changes.uplinkHighKhz, holding.uplinkHighKhz),
    validFrom: sentOrStored(changes.validFrom, holding.validFrom),
    validTo: sentOrStored(changes.validTo, holding.validTo),
  };
  if (next.validFrom !== null && next.validTo !== null && next.validFrom > next.validTo) {
    throw new ErrorResponse("BAD_REQUEST", { message: "validFrom must not be after validTo" });
  }

  try {
    const updated = await runAuditedOperation(standaloneAuditContext(req), { kind: "spectrum_holding.update" }, async (tx, audit) => {
      await validateSpectrumHoldingWrite(tx, countryCode, next, id);

      const [result] = await tx
        .update(spectrumHoldings)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(spectrumHoldings.id, id))
        .returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({ entity: "spectrum_holdings", op: "update", recordId: id, old: holding, new: result });
      return result;
    });

    return res.send({ data: toSpectrumHolding(updated) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateSpectrumHolding: Route<RequestData, SpectrumHolding> = {
  url: "/spectrum-holdings/:id",
  method: "PATCH",
  config: {
    permissionsCheckedByHandler: ["update:spectrum_holdings"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updateSpectrumHolding;
