import { emfReportListQuerySchema, emfReportSchema } from "@openbts/shared/contract";
import type { EmfReport, EmfReportListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { listEmfReports } from "../../../../features/emf/reports.js";
import { SI2PEM_UNAVAILABLE_REASON, answerFromSi2pem } from "../../../../features/emf/si2pem.js";
import { resolveEmfSite } from "../../../../features/emf/site.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List the EMF reports of a site",
  description:
    "Returns the reports published for a site, newest first. This includes the measurement reports for the site and the reports " +
    "the operator attached to its filings. SI2PEM is the only register connected so far, so the data currently covers Poland.\n\n" +
    "Identify the site with exactly one of `stationId`, `officialSiteId`, or `siteId` together with `latitude` and `longitude`. " +
    "To get the antennas from a report marked with `hasAntennaTable`, pass its `url` as `reportUrl` to `GET /emf/antennas`.\n\n" +
    "A station without a location returns an empty list. If SI2PEM fails for one of the two kinds of report, you still get the other. " +
    "Results are cached for a day, and while SI2PEM is down you get the cached result for up to a week.",
  querystring: emfReportListQuerySchema,
  response: {
    200: z.object({
      data: z.array(emfReportSchema),
    }),
  },
};
const errorReasons = {
  404:
    "The station, official site or operator does not exist, or the station is not in Poland. " +
    "Also returned when you cannot access Poland, the country this data covers.",
  503: SI2PEM_UNAVAILABLE_REASON,
};
type ReqQuery = { Querystring: EmfReportListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<EmfReport[]>>) {
  const site = await resolveEmfSite(req, req.query);
  if (site === null) return res.send({ data: [] });

  return res.send({ data: await answerFromSi2pem(res, () => listEmfReports(site)) });
}

const getEmfReports: Route<ReqQuery, EmfReport[]> = {
  url: "/emf/reports",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getEmfReports;
