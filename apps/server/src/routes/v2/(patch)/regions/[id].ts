import { regions } from "@openbts/drizzle";
import { regionParamsSchema, regionSchema, regionUpdateSchema } from "@openbts/shared/contract";
import type { Region, RegionUpdate } from "@openbts/shared/contract";
import { and, eq, ne, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { assertIsoCodeFree, assertIsoCodeMatchesCountry } from "../../../../features/regions/isoCode.js";
import { toRegion } from "../../../../features/regions/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a region",
  description:
    "Updates a region's `code`, `name` or `isoCode`. `code` and `name` must be unique within the country. " +
    "An `isoCode` must start with the country's code and be unique across all regions. You cannot move a region to another country.",
  params: regionParamsSchema,
  body: regionUpdateSchema,
  response: {
    200: z.object({
      data: regionSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, or `isoCode` does not start with the code of the region's country.",
  404: "The region does not exist.",
  409: "The country already has a region with this code or name, or another region already has this `isoCode`.",
};
type ReqBody = { Body: RegionUpdate };
type ReqParams = { Params: z.infer<typeof regionParamsSchema> };
type RequestData = ReqBody & ReqParams;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Region>>) {
  const { id } = req.params;
  const { code, name, isoCode } = req.body;

  const region = await db.query.regions.findFirst({ where: { id } });
  if (!region) throw new ErrorResponse("NOT_FOUND");
  if (isoCode !== undefined) assertIsoCodeMatchesCountry(isoCode, region.countryCode);

  try {
    const updated = await runAuditedOperation(standaloneAuditContext(req), { kind: "region.update" }, async (tx, audit) => {
      const sameCodeOrName = or(code === undefined ? undefined : eq(regions.code, code), name === undefined ? undefined : eq(regions.name, name));
      if (sameCodeOrName) {
        const [taken] = await tx
          .select({ id: regions.id })
          .from(regions)
          .where(and(eq(regions.countryCode, region.countryCode), ne(regions.id, id), sameCodeOrName))
          .limit(1);
        if (taken) throw new ErrorResponse("CONFLICT", { message: "This country already has a region with this code or name" });
      }
      if (isoCode !== undefined) await assertIsoCodeFree(tx, isoCode, id);

      const [result] = await tx.update(regions).set({ code, name, isoCode }).where(eq(regions.id, id)).returning();
      if (!result) throw new ErrorResponse("FAILED_TO_UPDATE");

      await audit.log({ entity: "regions", op: "update", recordId: id, old: region, new: result });
      return result;
    });

    return res.send({ data: toRegion(updated) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateRegion: Route<RequestData, Region> = {
  url: "/regions/:id",
  method: "PATCH",
  config: {
    permissions: ["update:regions"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default updateRegion;
