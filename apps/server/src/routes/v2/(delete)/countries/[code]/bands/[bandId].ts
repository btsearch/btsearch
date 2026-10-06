import { bands, cells, countryBands, stations, ukePermits } from "@openbts/drizzle";
import { countryBandParamsSchema, noContentSchema } from "@openbts/shared/contract";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../../../../../constants.js";
import { ErrorResponse } from "../../../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../../../features/audit/index.js";
import { isUnknownBand } from "../../../../../../features/bands/unknown.js";
import { stationCountryCode, stationPlacementMatches } from "../../../../../../features/stations/country.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Remove a band from a country's band plan",
  description: "Removes the band from the country's band plan. The band itself is not deleted, but cells in that country can no longer use it.",
  params: countryBandParamsSchema,
  response: { 204: noContentSchema },
};
type ReqParams = { Params: z.infer<typeof countryBandParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { code, bandId } = req.params;

  try {
    await runAuditedOperation(standaloneAuditContext(req), { kind: "country.bands" }, async (tx, audit) => {
      const [band] = await tx.select({ value: bands.value }).from(bands).where(eq(bands.id, bandId)).limit(1);
      if (!band || isUnknownBand(band)) throw new ErrorResponse("NOT_FOUND");

      const countryBandKey = and(eq(countryBands.countryCode, code), eq(countryBands.bandId, bandId));
      const [existing] = await tx.select().from(countryBands).where(countryBandKey).for("update").limit(1);
      if (!existing) throw new ErrorResponse("NOT_FOUND");

      const [[cell], [permit]] = await Promise.all([
        tx
          .select({ id: cells.id })
          .from(cells)
          .innerJoin(stations, eq(stations.id, cells.station_id))
          .where(and(eq(cells.band_id, bandId), stationPlacementMatches(eq(stationCountryCode, code))))
          .limit(1),
        code === LEGACY_COUNTRY_CODE ? tx.select({ id: ukePermits.id }).from(ukePermits).where(eq(ukePermits.band_id, bandId)).limit(1) : [],
      ]);
      if (cell || permit) throw new ErrorResponse("CONFLICT", { message: "Cannot remove a band that cells or permits in this country still use" });

      await tx.delete(countryBands).where(countryBandKey);
      await audit.log({ entity: "country_bands", op: "delete", recordId: `${code}:${bandId}`, old: existing });
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteCountryBand: Route<ReqParams, void> = {
  url: "/countries/:code/bands/:bandId",
  method: "DELETE",
  config: {
    permissions: ["update:countries"],
    errorReasons: {
      404: "The band does not exist, or it is not in this country's band plan.",
      409: "Cells in this country, or permits in its official register, still use the band.",
    },
  },
  schema: schemaRoute,
  handler,
};

export default deleteCountryBand;
