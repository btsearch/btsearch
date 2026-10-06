import { emfInactiveSiteListQuerySchema, emfInactiveSiteListSchema } from "@openbts/shared/contract";
import type { EmfInactiveSiteList, EmfInactiveSiteListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { listEmfInactiveSites } from "../../../../features/emf/inactiveSites.js";
import { SI2PEM_UNAVAILABLE_REASON, answerFromSi2pem } from "../../../../features/emf/si2pem.js";
import { assertEmfCountryVisible } from "../../../../features/emf/site.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List inactive sites",
  description:
    "Returns the sites the register marks as no longer active, with the date each one was disabled, most recent first. " +
    "SI2PEM is the only register connected so far, so the data currently covers Poland. " +
    "The full list is fetched from SI2PEM once a day, so a newly disabled site can take up to a day to show up.",
  querystring: emfInactiveSiteListQuerySchema,
  response: {
    200: emfInactiveSiteListSchema,
  },
};
const errorReasons = {
  404: "You cannot access Poland, the country this data covers.",
  503: SI2PEM_UNAVAILABLE_REASON,
};
type ReqQuery = { Querystring: EmfInactiveSiteListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<EmfInactiveSiteList>>) {
  await assertEmfCountryVisible(req);

  return res.send(await answerFromSi2pem(res, () => listEmfInactiveSites(req.query)));
}

const getEmfInactiveSites: Route<ReqQuery, EmfInactiveSiteList> = {
  url: "/emf/inactive-sites",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getEmfInactiveSites;
