import { structureOwners } from "@openbts/drizzle";
import { structureOwnerListQuerySchema, structureOwnerSchema } from "@openbts/shared/contract";
import type { StructureOwner, StructureOwnerListQuery } from "@openbts/shared/contract";
import { inArray, isNull, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { toStructureOwner } from "../../../../features/structures/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List structure owners",
  description:
    "Returns the structure owners of the countries you can access, sorted by name. " +
    "Use `countryCodes` to narrow the list to certain countries. Owners that are not tied to a country are always included.",
  querystring: structureOwnerListQuerySchema,
  response: {
    200: z.object({
      data: z.array(structureOwnerSchema),
    }),
  },
};
type ReqQuery = { Querystring: StructureOwnerListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<StructureOwner[]>>) {
  const countryCodes = await loadVisibleCountryCodes(req, req.query.countryCodes);
  const withoutCountry = isNull(structureOwners.countryCode);

  const rows = await db
    .select()
    .from(structureOwners)
    .where(countryCodes.length === 0 ? withoutCountry : or(withoutCountry, inArray(structureOwners.countryCode, countryCodes)))
    .orderBy(structureOwners.name, structureOwners.id);

  return res.send({ data: rows.map(toStructureOwner) });
}

const getStructureOwners: Route<ReqQuery, StructureOwner[]> = {
  url: "/structure-owners",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStructureOwners;
