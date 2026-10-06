import { countries, regions } from "@openbts/drizzle";
import { regionCreateSchema, regionSchema } from "@openbts/shared/contract";
import type { Region, RegionCreate } from "@openbts/shared/contract";
import { and, eq, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { assertIsoCodeFree, assertIsoCodeMatchesCountry } from "../../../../features/regions/isoCode.js";
import { toRegion } from "../../../../features/regions/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create a region",
  description:
    "Creates a region in a country. `code` and `name` must be unique within the country. " +
    "If you send an `isoCode`, it must start with the country's code and be unique across all regions.",
  body: regionCreateSchema,
  response: {
    201: z.object({
      data: regionSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, the country does not exist, or `isoCode` does not start with the country's code.",
  409: "The country already has a region with this code or name, or another region already has this `isoCode`.",
};
type ReqBody = { Body: RegionCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<Region>>) {
  const { countryCode, code, name, isoCode = null } = req.body;
  assertIsoCodeMatchesCountry(isoCode, countryCode);

  try {
    const region = await runAuditedOperation(standaloneAuditContext(req), { kind: "region.create" }, async (tx, audit) => {
      const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, countryCode)).limit(1);
      if (!country) throw new ErrorResponse("BAD_REQUEST", { message: "Country not found" });

      const [taken] = await tx
        .select({ id: regions.id })
        .from(regions)
        .where(and(eq(regions.countryCode, countryCode), or(eq(regions.code, code), eq(regions.name, name))))
        .limit(1);
      if (taken) throw new ErrorResponse("CONFLICT", { message: "This country already has a region with this code or name" });
      await assertIsoCodeFree(tx, isoCode);

      const [created] = await tx.insert(regions).values({ countryCode, code, name, isoCode }).returning();
      if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

      await audit.log({ entity: "regions", op: "create", recordId: created.id, new: created });
      return created;
    });

    return res.status(201).send({ data: toRegion(region) });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createRegion: Route<ReqBody, Region> = {
  url: "/regions",
  method: "POST",
  config: {
    permissions: ["create:regions"],
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default createRegion;
