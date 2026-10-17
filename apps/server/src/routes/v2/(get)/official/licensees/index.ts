import { licenseeListQuerySchema, licenseeListSchema } from "@openbts/shared/contract";
import type { LicenseeList, LicenseeListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchLicenseePage } from "../../../../../features/official/licensees.js";
import { loadOfficialVisibility } from "../../../../../features/official/visibility.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List licensees",
  description:
    "Returns the licensees that the official sources name, ordered by name. " +
    "A licensee is a company the way one source spells it, so the same company can appear once per source and once per spelling. " +
    "`operatorId` maps a licensee to an operator.\n\n" +
    "Imports skip the official sites and permits published under a licensee that has no operator, and count them as `unmappedLicensee`. " +
    "For sites and permits, a name the source has not used before is only stored when it maps to one of the operators of the source's country. " +
    "A name behind those skips is therefore only listed here when the licensee was stored for another reason, " +
    "for example because it also holds microwave links. Microwave links are imported either way, and their holders are stored " +
    "with or without an operator. A licensee without an operator that nothing names any more is removed by the next import.\n\n" +
    "Many licensees hold nothing but microwave links and are left without an operator on purpose. " +
    "Add `hasMicrowaveLinks=false` to leave out every licensee that holds a link. " +
    "This also leaves out a licensee that holds links and also has skipped sites and permits. " +
    "`hasMicrowaveLinks=true` gives you the holders of microwave links, and with `limit=1000` usually all of them in one response.\n\n" +
    "You get the licensees of the visible sources in the countries you can access. Administrators also get those of hidden sources.",
  querystring: licenseeListQuerySchema,
  response: {
    200: licenseeListSchema,
  },
};
type ReqQuery = { Querystring: LicenseeListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<LicenseeList>>) {
  const page = await fetchLicenseePage(req.query, await loadOfficialVisibility(req));

  return res.send({ data: page.data, paging: { limit: req.query.limit, nextCursor: page.nextCursor } });
}

const getLicensees: Route<ReqQuery, LicenseeList> = {
  url: "/official/licensees",
  method: "GET",
  config: { permissions: ["read:microwave_links"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getLicensees;
