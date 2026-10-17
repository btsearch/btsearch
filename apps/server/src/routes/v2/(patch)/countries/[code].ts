import { countries } from "@openbts/drizzle";
import { countryParamsSchema, countrySchema, countryUpdateSchema } from "@openbts/shared/contract";
import type { Country, CountryUpdate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { toCountry, viewColumns } from "../../../../features/countries/serialize.js";
import { forgetCountryVisibility } from "../../../../features/countries/visibility.js";
import { loadSourceCapabilities } from "../../../../features/official/capabilities.js";
import { loadOfficialVisibility } from "../../../../features/official/visibility.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a country",
  params: countryParamsSchema,
  body: countryUpdateSchema,
  response: {
    200: z.object({
      data: countrySchema,
    }),
  },
};
type ReqBody = { Body: CountryUpdate };
type ReqParams = { Params: z.infer<typeof countryParamsSchema> };
type RequestData = ReqBody & ReqParams;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Country>>) {
  const { code } = req.params;
  const { isVisible, contributions, features, defaultView } = req.body;

  const country = await db.query.countries.findFirst({ where: { code } });
  if (!country) throw new ErrorResponse("NOT_FOUND");

  try {
    const updated = await runAuditedOperation(standaloneAuditContext(req), { kind: "country.update" }, async (tx, audit) => {
      const [result] = await tx
        .update(countries)
        .set({ isVisible, contributions, ...features, ...viewColumns(defaultView), updatedAt: new Date() })
        .where(eq(countries.code, code))
        .returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({ entity: "countries", op: "update", recordId: code, old: country, new: result });
      return result;
    });
    await forgetCountryVisibility();

    return res.send({ data: toCountry(updated, await loadSourceCapabilities(await loadOfficialVisibility(req))) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateCountry: Route<RequestData, Country> = {
  url: "/countries/:code",
  method: "PATCH",
  config: { permissions: ["update:countries"] },
  schema: schemaRoute,
  handler,
};

export default updateCountry;
