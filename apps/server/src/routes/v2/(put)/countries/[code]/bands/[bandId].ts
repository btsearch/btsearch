import { bands, countries, countryBands } from "@openbts/drizzle";
import { countryBandParamsSchema, countryBandSchema } from "@openbts/shared/contract";
import type { CountryBand } from "@openbts/shared/contract";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../../../features/audit/index.js";
import { toCountryBand } from "../../../../../../features/bands/serialize.js";
import { isUnknownBand } from "../../../../../../features/bands/unknown.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Add a band to a country's band plan",
  description:
    "Adds the band to the country's band plan and returns the entry. The request has no body, and nothing changes if the band is already " +
    "in the plan. Cells in that country can use any band in the plan.",
  params: countryBandParamsSchema,
  response: {
    200: z.object({
      data: countryBandSchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof countryBandParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<CountryBand>>) {
  const { code, bandId } = req.params;
  const recordId = `${code}:${bandId}`;

  try {
    const countryBand = await runAuditedOperation(standaloneAuditContext(req), { kind: "country.bands" }, async (tx, audit) => {
      const [[country], [band]] = await Promise.all([
        tx.select({ code: countries.code }).from(countries).where(eq(countries.code, code)).limit(1),
        tx.select({ value: bands.value }).from(bands).where(eq(bands.id, bandId)).limit(1),
      ]);
      if (!country || !band || isUnknownBand(band)) throw new ErrorResponse("NOT_FOUND");

      const countryBandKey = and(eq(countryBands.countryCode, code), eq(countryBands.bandId, bandId));
      const [existing] = await tx.select().from(countryBands).where(countryBandKey).for("update").limit(1);
      if (existing) return existing;

      const [created] = await tx.insert(countryBands).values({ countryCode: code, bandId }).returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "country_bands", op: "create", recordId, new: created });
      return created;
    });

    return res.send({ data: toCountryBand(countryBand) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const putCountryBand: Route<ReqParams, CountryBand> = {
  url: "/countries/:code/bands/:bandId",
  method: "PUT",
  config: {
    permissions: ["update:countries"],
    errorReasons: { 404: "The country or the band does not exist." },
  },
  schema: schemaRoute,
  handler,
};

export default putCountryBand;
