import { stationBackhauls, stations } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { stationParamScope } from "../../../../../features/access/scope.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../../features/audit/index.js";
import { backhaulSpeedSchema } from "../../../../../features/stations/backhaul.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const backhaulSelectSchema = createSelectSchema(stationBackhauls);

const requestSchema = z.object({
  type: z.enum(["fiber", "microwave", "satellite"]).nullable(),
  speed: backhaulSpeedSchema.nullable().optional(),
  model: z.string().max(100).nullable().optional(),
});

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
  }),
  body: requestSchema,
  response: {
    200: z.object({ data: backhaulSelectSchema }),
    204: z.void(),
  },
};

type ReqBody = { Body: z.infer<typeof requestSchema> };
type ReqParams = { Params: { station_id: number } };
type RequestData = ReqBody & ReqParams;
type ResponseData = z.infer<typeof backhaulSelectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id } = req.params;
  const { type, speed, model } = req.body;

  const station = await db.query.stations.findFirst({ where: { id: station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  const existing = await db.query.stationBackhauls.findFirst({ where: { station_id } });

  if (!type) {
    if (!existing) throw new ErrorResponse("NOT_FOUND");

    await runAuditedOperation(auditContextFromRequest(req), { kind: "station.edit" }, async (tx, audit) => {
      await tx.delete(stationBackhauls).where(eq(stationBackhauls.id, existing.id));
      await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, station_id));
      await audit.log({
        entity: "station_uplinks",
        op: "delete",
        recordId: existing.id,
        stationId: station_id,
        old: existing,
        new: null,
      });
    });

    return res.status(204).send();
  }

  const values = {
    type,
    speed: speed ?? null,
    model: type === "microwave" ? (model ?? null) : null,
  };

  if (existing && existing.type === values.type && existing.speed === values.speed && existing.model === values.model)
    return res.send({ data: existing });

  const result = await runAuditedOperation(auditContextFromRequest(req), { kind: "station.edit" }, async (tx, audit) => {
    const current = await tx.query.stationBackhauls.findFirst({ where: { station_id } });

    const [saved] = current
      ? await tx
          .update(stationBackhauls)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(stationBackhauls.id, current.id))
          .returning()
      : await tx
          .insert(stationBackhauls)
          .values({ station_id, ...values })
          .returning();

    if (!saved) throw new ErrorResponse("FAILED_TO_UPDATE");

    await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, station_id));
    await audit.log({
      entity: "station_uplinks",
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

const updateStationBackhaul: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id/uplink",
  method: "PATCH",
  config: { permissions: ["update:stations"], scope: stationParamScope },
  schema: schemaRoute,
  handler,
};

export default updateStationBackhaul;
