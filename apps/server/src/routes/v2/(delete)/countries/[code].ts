import { contributionSnapshots, countries, countryBands, operators, regions, roleGrants, structureOwners } from "@openbts/drizzle";
import { countryParamsSchema, noContentSchema } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { runAuditedOperation, standaloneAuditContext } from "../../../../features/audit/index.js";
import { countryBandDeleteEntries } from "../../../../features/bands/remove.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a country",
  description: "Deletes a country together with its band plan and the statistics history kept for it.",
  params: countryParamsSchema,
  response: { 204: noContentSchema },
};
type ReqParams = { Params: z.infer<typeof countryParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const { code } = req.params;

  const country = await db.query.countries.findFirst({ where: { code } });
  if (!country) throw new ErrorResponse("NOT_FOUND");

  try {
    await runAuditedOperation(standaloneAuditContext(req), { kind: "country.delete" }, async (tx, audit) => {
      const [[region], [operator], [grant], [structureOwner]] = await Promise.all([
        tx.select({ id: regions.id }).from(regions).where(eq(regions.countryCode, code)).limit(1),
        tx.select({ id: operators.id }).from(operators).where(eq(operators.countryCode, code)).limit(1),
        tx.select({ id: roleGrants.id }).from(roleGrants).where(eq(roleGrants.countryCode, code)).limit(1),
        tx.select({ id: structureOwners.id }).from(structureOwners).where(eq(structureOwners.countryCode, code)).limit(1),
      ]);
      if (region || operator || grant || structureOwner) {
        throw new ErrorResponse("CONFLICT", {
          message: "Cannot delete a country that still has regions, operators, structure owners or editor grants",
        });
      }

      const plans = await tx.delete(countryBands).where(eq(countryBands.countryCode, code)).returning();
      await tx.delete(contributionSnapshots).where(eq(contributionSnapshots.countryCode, code));
      await tx.delete(countries).where(eq(countries.code, code));
      await audit.logMany([...countryBandDeleteEntries(plans), { entity: "countries", op: "delete", recordId: code, old: country }]);
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteCountry: Route<ReqParams, void> = {
  url: "/countries/:code",
  method: "DELETE",
  config: {
    permissions: ["delete:countries"],
    errorReasons: {
      404: "The country does not exist.",
      409: "The country still has regions, operators, role grants or structure owners.",
    },
  },
  schema: schemaRoute,
  handler,
};

export default deleteCountry;
