import { countries } from "@openbts/drizzle";
import { countryCreateSchema, countrySchema } from "@openbts/shared/contract";
import type { Country, CountryCreate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { toCountry } from "../../../../features/countries/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create a country",
  description:
    "Creates a country. By default it starts hidden (`isVisible` is `false`) and closed to contributions (`contributions` is `closed`). " +
    "Its band plan starts empty, so add bands to it before anyone saves cells in that country.",
  body: countryCreateSchema,
  response: {
    201: z.object({
      data: countrySchema,
    }),
  },
};
type ReqBody = { Body: CountryCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<Country>>) {
  const { code, isVisible, contributions, defaultView } = req.body;

  try {
    const country = await runAuditedOperation(standaloneAuditContext(req), { kind: "country.create" }, async (tx, audit) => {
      const [existing] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, code)).limit(1);
      if (existing) throw new ErrorResponse("CONFLICT", { message: "This country already exists" });

      const [created] = await tx
        .insert(countries)
        .values({
          code,
          isVisible,
          contributions,
          viewWest: defaultView?.west,
          viewSouth: defaultView?.south,
          viewEast: defaultView?.east,
          viewNorth: defaultView?.north,
        })
        .returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "countries", op: "create", recordId: code, new: created });
      return created;
    });

    return res.status(201).send({ data: toCountry(country) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createCountry: Route<ReqBody, Country> = {
  url: "/countries",
  method: "POST",
  config: {
    permissions: ["create:countries"],
    errorReasons: { 409: "A country with this code already exists." },
  },
  schema: schemaRoute,
  handler,
};

export default createCountry;
