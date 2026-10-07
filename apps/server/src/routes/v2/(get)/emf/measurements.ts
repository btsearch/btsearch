import { emfMeasurementListQuerySchema, emfMeasurementListSchema } from "@openbts/shared/contract";
import type { EmfMeasurementList, EmfMeasurementListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { listEmfMeasurements } from "../../../../features/emf/measurements.js";
import { SI2PEM_UNAVAILABLE_REASON, answerFromSi2pem } from "../../../../features/emf/si2pem.js";
import { assertEmfCountryVisible } from "../../../../features/emf/site.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List EMF measurements",
  description:
    "Returns electromagnetic field measurements across sites, each with its site, dates, status, laboratory and a link to the report " +
    "if there is one. SI2PEM is the only register connected so far, so the data currently covers Poland.\n\n" +
    "Without `bbox` the list comes from SI2PEM's register and shows planned measurements unless you ask for other `statuses`. " +
    "Each combination of status, operator and region is a separate request to SI2PEM, so at most 16 combinations are allowed.\n\n" +
    "With `bbox` the list comes from SI2PEM's map layer instead, which only has planned measurements. " +
    "Those rows have no `id` or `regionId`, there is one row per site, and measurements that ended more than 30 days ago are left out.",
  querystring: emfMeasurementListQuerySchema,
  response: {
    200: emfMeasurementListSchema,
  },
};
const errorReasons = {
  400:
    "A query parameter or the cursor is invalid. Also returned when the area in `bbox` contains too many measurements, " +
    "in which case you should request a smaller area.",
  404: "You cannot access Poland, the country this data covers.",
  503: SI2PEM_UNAVAILABLE_REASON,
};
type ReqQuery = { Querystring: EmfMeasurementListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<EmfMeasurementList>>) {
  await assertEmfCountryVisible(req);

  return res.send(await answerFromSi2pem(res, () => listEmfMeasurements(req.query)));
}

const getEmfMeasurements: Route<ReqQuery, EmfMeasurementList> = {
  url: "/emf/measurements",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getEmfMeasurements;
