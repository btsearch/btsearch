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
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a country",
  description:
    "Updates a country. `isVisible` and `contributions` are two independent settings. " +
    "Setting `isVisible` to `false` hides the country. A hidden country and everything in it, such as its regions, operators and stations, " +
    "are only returned to administrators and to editors with a grant in that country. " +
    "Setting `contributions` to `closed` stops the country from accepting submissions.",
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

    return res.send({ data: toCountry(updated) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateCountry: Route<RequestData, Country> = {
  url: "/countries/:code",
  method: "PATCH",
  config: {
    permissions: ["update:countries"],
    errorReasons: { 404: "The country does not exist." },
  },
  schema: schemaRoute,
  handler,
};

export default updateCountry;
