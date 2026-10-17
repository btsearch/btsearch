import { licenseeParamsSchema, licenseeSchema } from "@openbts/shared/contract";
import type { Licensee } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { fetchLicenseePage } from "../../../../../features/official/licensees.js";
import { loadOfficialVisibility } from "../../../../../features/official/visibility.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a licensee",
  description:
    "Returns one licensee of an official source. " +
    "A licensee of a hidden source, or of a source in a country you cannot access, is only returned to administrators.",
  params: licenseeParamsSchema,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: licenseeSchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof licenseeParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<Licensee>>) {
  const page = await fetchLicenseePage({ ids: [req.params.id], limit: 1 }, await loadOfficialVisibility(req));
  const [licensee] = page.data;
  if (!licensee) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: licensee });
}

const getLicensee: Route<ReqParams, Licensee> = {
  url: "/official/licensees/:id",
  method: "GET",
  config: {
    permissions: ["read:microwave_links"],
    allowGuestAccess: true,
    errorReasons: { 404: "The licensee does not exist, or its source is hidden from you." },
  },
  schema: schemaRoute,
  handler,
};

export default getLicensee;
