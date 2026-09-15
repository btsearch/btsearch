import { extraIdentificators, stations } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../../services/audit/index.js";

const extraIdentificatorsSelectSchema = createSelectSchema(extraIdentificators);
const EXTRA_IDENTIFICATORS_MNCS = new Set([26002, 26003]);
const MNO_NAME_ONLY_MNCS = new Set([26001, 26006]);

const requestSchema = z.object({
  networks_id: z.int().nullable().optional(),
  networks_name: z.string().max(150).nullable().optional(),
  mno_name: z.string().max(50).nullable().optional(),
});

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
  }),
  body: requestSchema,
  response: {
    200: z.object({
      data: extraIdentificatorsSelectSchema,
    }),
  },
};

type ReqBody = { Body: z.infer<typeof requestSchema> };
type ReqParams = { Params: { station_id: number } };
type RequestData = ReqBody & ReqParams;
type ResponseData = z.infer<typeof extraIdentificatorsSelectSchema>;

function identifiersMatch(existing: ResponseData, values: z.infer<typeof requestSchema>): boolean {
  return (
    existing.networks_id === (values.networks_id ?? null) &&
    existing.networks_name === (values.networks_name ?? null) &&
    existing.mno_name === (values.mno_name ?? null)
  );
}

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id } = req.params;
  const { networks_id, networks_name, mno_name } = req.body;

  const station = await db.query.stations.findFirst({ where: { id: station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  if (station.operator_id) {
    const operator = await db.query.operators.findFirst({ where: { id: station.operator_id } });
    const mnc = operator?.mnc ?? null;

    if (mnc !== null && MNO_NAME_ONLY_MNCS.has(mnc) && (networks_id || networks_name))
      throw new ErrorResponse("BAD_REQUEST", { message: "This operator only supports mno_name" });
    if (mnc !== null && !EXTRA_IDENTIFICATORS_MNCS.has(mnc) && !MNO_NAME_ONLY_MNCS.has(mnc))
      throw new ErrorResponse("BAD_REQUEST", { message: "This operator does not support extra identifiers" });
  }

  const existing = await db.query.extraIdentificators.findFirst({
    where: {
      station_id: station_id,
    },
  });

  const allEmpty = !networks_id && !networks_name && !mno_name;

  if (allEmpty && existing) {
    const removed = await runAuditedOperation(auditContextFromRequest(req), { kind: "station.edit" }, async (tx, audit) => {
      const current = await tx.query.extraIdentificators.findFirst({ where: { station_id } });
      if (!current) return existing;

      await tx.delete(extraIdentificators).where(eq(extraIdentificators.id, current.id));
      await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, station_id));
      await audit.log({
        entity: "extra_identificators",
        op: "delete",
        recordId: current.id,
        stationId: station_id,
        old: current,
        new: null,
      });
      return current;
    });

    return res.send({ data: removed });
  }

  if (allEmpty) return res.send({ data: existing ?? ({} as ResponseData) });

  if (existing && identifiersMatch(existing, req.body)) return res.send({ data: existing });

  const result = await runAuditedOperation(auditContextFromRequest(req), { kind: "station.edit" }, async (tx, audit) => {
    const current = await tx.query.extraIdentificators.findFirst({ where: { station_id } });
    if (current && identifiersMatch(current, req.body)) return current;

    const [saved] = current
      ? await tx
          .update(extraIdentificators)
          .set({
            networks_id: networks_id ?? null,
            networks_name: networks_name ?? null,
            mno_name: mno_name ?? null,
            updatedAt: new Date(),
          })
          .where(eq(extraIdentificators.id, current.id))
          .returning()
      : await tx
          .insert(extraIdentificators)
          .values({
            station_id,
            networks_id: networks_id ?? null,
            networks_name: networks_name ?? null,
            mno_name: mno_name ?? null,
          })
          .returning();

    if (!saved) throw new ErrorResponse("FAILED_TO_UPDATE");

    await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, station_id));
    await audit.log({
      entity: "extra_identificators",
      op: current ? "update" : "create",
      recordId: saved.id,
      stationId: station_id,
      old: current ?? null,
      new: saved,
    });
    return saved;
  });

  return res.send({ data: result });
}

const updateStationExtraIdentificators: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id/extra-identifiers",
  method: "PATCH",
  config: { permissions: ["update:stations"] },
  schema: schemaRoute,
  handler,
};

export default updateStationExtraIdentificators;
