import { emfAntennaQuerySchema, emfAntennaReportSchema } from "@openbts/shared/contract";
import type { EmfAntennaQuery, EmfAntennaReport } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { readEmfAntennas } from "../../../../features/emf/antennas.js";
import { SI2PEM_UNAVAILABLE_REASON, answerFromSi2pem } from "../../../../features/emf/si2pem.js";
import { resolveEmfSite } from "../../../../features/emf/site.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { UNLIMITED, countAgainstLimit } from "../../../../lib/requestLimit.js";
import type { RouteRateLimit } from "../../../../plugins/ratelimit/rateLimiter.js";

const REPORT_READ_LIMIT: RouteRateLimit = { url: "emf-report-read", max: 15, window: 300, roles: { admin: UNLIMITED, editor: UNLIMITED } };

const schemaRoute = {
  summary: "Get the antennas from a site's EMF report",
  description:
    "Returns the antennas listed in one laboratory report of a site, with the model, height and azimuth of each antenna and the frequency, " +
    "power and tilt of each of its bands. SI2PEM is the only register connected so far, so the data currently covers Poland.\n\n" +
    "Identify the site with exactly one of `stationId`, `officialSiteId`, or `siteId` together with `latitude` and `longitude`. " +
    "The site's newest laboratory report is read unless you pick another one with `reportUrl`. " +
    "`report` is `null` when the site has no laboratory report or the station has no location.\n\n" +
    "The first request for a report is slower, because the server has to download the document and read the table from it. " +
    "The result is then cached for a week.",
  querystring: emfAntennaQuerySchema,
  response: {
    200: z.object({
      data: emfAntennaReportSchema,
    }),
  },
};
const errorReasons = {
  404:
    "The station, official site or operator does not exist, the station is not in Poland, or `reportUrl` is not one of the site's " +
    "laboratory reports. Also returned when you cannot access Poland, the country this data covers.",
  429:
    "You can have up to 15 reports read every 5 minutes. Reports that are already cached do not count, and editors and administrators " +
    "have no limit unless they use an API key. The general rate limits apply as well.",
  503:
    `${SI2PEM_UNAVAILABLE_REASON} Also returned when too many reports are being read at once, ` +
    "or when the rate limit cannot be checked right now, in which case no `Retry-After` is sent.",
};
type ReqQuery = { Querystring: EmfAntennaQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<EmfAntennaReport>>) {
  const site = await resolveEmfSite(req, req.query);
  if (site === null) return res.send({ data: { report: null, antennas: [] } });

  const data = await answerFromSi2pem(res, () => readEmfAntennas(site, req.query.reportUrl, () => countAgainstLimit(req, res, REPORT_READ_LIMIT)));
  return res.send({ data });
}

const getEmfAntennas: Route<ReqQuery, EmfAntennaReport> = {
  url: "/emf/antennas",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getEmfAntennas;
