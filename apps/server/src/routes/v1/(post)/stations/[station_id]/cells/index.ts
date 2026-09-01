// oxlint-disable no-unused-vars
import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../../../services/auditLog.service.js";
import { checkCellDuplicatesBatch, checkLTEClidConsistency, checkPciDuplicates } from "../../../../../../services/cellDuplicateCheck.service.js";
import { queueStationCellsChangedNotification } from "../../../../../../services/notifications/stationCellChanges.js";
import { assertCanMutateStationCells } from "../../../../../../services/stations/status.js";
import { validateCellARFCNsForBands } from "../../../../../../utils/cellARFCNValidation.js";
import { type RATInsertDetails, insertRATCellDetails, isNormalRat } from "../../../../../../utils/ratCellPersistence.js";
import { INSERT_OMIT, gsmInsertSchema, lteNullableFields, nrInsertSchema, umtsInsertSchema } from "../../../../../../utils/ratCellSchemas.js";
import { makeDetailsRatRefine, validateCellDuplicates } from "../../../../../../utils/submission.helpers.js";

const cellsInsertSchema = createInsertSchema(cells)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({ rat: z.enum(["GSM", "CDMA", "UMTS", "LTE", "NR"]) })
  .strict();
const cellsSelectSchema = createSelectSchema(cells);
const gsmCellsSchema = createSelectSchema(gsmCells).omit({ cell_id: true });
const umtsCellsSchema = createSelectSchema(umtsCells).omit({ cell_id: true });
const lteCellsSchema = createSelectSchema(lteCells).omit({ cell_id: true });
const nrCellsSchema = createSelectSchema(nrCells).omit({ cell_id: true });
const cellDetailsSchema = z.union([gsmCellsSchema, umtsCellsSchema, lteCellsSchema, nrCellsSchema]).nullable();

const lteInsertSchema = createInsertSchema(lteCells)
  .omit(INSERT_OMIT)
  .extend({
    tac: z.number().int().min(0).max(65535).nullable().optional(),
    enbid: z.number().int().min(0).max(1048575),
    clid: z.number().int().min(0).max(255),
    ...lteNullableFields,
  })
  .strict();
const cellWithDetailsInsert = cellsInsertSchema
  .extend({ details: z.unknown().optional() })
  .superRefine(makeDetailsRatRefine({ GSM: gsmInsertSchema, UMTS: umtsInsertSchema, LTE: lteInsertSchema, NR: nrInsertSchema }));
const cellWithDetailsSelectSchema = cellsSelectSchema.extend({ details: cellDetailsSchema });

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
  }),
  body: z.object({
    cells: z.array(cellWithDetailsInsert),
  }),
  response: {
    200: z.object({
      data: z.array(cellWithDetailsSelectSchema),
    }),
  },
};
type ReqBody = {
  Body: { cells: z.infer<typeof cellWithDetailsInsert>[] };
};
type ReqParams = {
  Params: z.infer<typeof schemaRoute.params>;
};
type RequestData = ReqParams & ReqBody;
type ResponseData = z.infer<typeof cellWithDetailsSelectSchema>[];

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id } = req.params;
  const { cells: cellsData } = req.body;

  if (!cellsData || cellsData.length === 0) throw new ErrorResponse("INVALID_QUERY");

  const station = await db.query.stations.findFirst({
    where: {
      id: station_id,
    },
  });
  if (!station) throw new ErrorResponse("NOT_FOUND");
  assertCanMutateStationCells(station);

  validateCellDuplicates(cellsData);

  await Promise.all([
    station.operator_id
      ? checkCellDuplicatesBatch(
          cellsData.map((cell) => ({ rat: cell.rat, details: cell.details as Record<string, unknown> | undefined })),
          station.operator_id,
        )
      : Promise.resolve(),
    checkLTEClidConsistency(
      station_id,
      cellsData.map((cell) => ({ rat: cell.rat, details: cell.details as Record<string, unknown> | undefined })),
    ),
    validateCellARFCNsForBands(cellsData.map((cell) => ({ rat: cell.rat, band_id: cell.band_id, details: cell.details }))),
    checkPciDuplicates(
      station_id,
      cellsData.map((cell) => ({
        rat: cell.rat,
        bandId: cell.band_id,
        details: cell.details as { pci?: number | null; earfcn?: number | null; arfcn?: number | null } | undefined,
      })),
    ),
  ]);

  try {
    const created = await db
      .insert(cells)
      .values(
        cellsData.map((cell) => ({
          ...cell,
          station_id: station.id,
          updatedAt: new Date(),
          createdAt: new Date(),
        })),
      )
      .returning();

    await Promise.all(
      created.map(async (row, idx) => {
        const details = cellsData[idx]?.details;
        if (!details) return;
        if (isNormalRat(row.rat)) await insertRATCellDetails(db, row.rat, row.id, details as RATInsertDetails);
      }),
    );

    const ids = created.map((cell) => cell.id);
    const full = await db.query.cells.findMany({
      where: {
        RAW: (fields, { inArray }) => inArray(fields.id, ids),
      },
      with: { gsm: true, umts: true, lte: true, nr: true },
    });
    const idToDetails = new Map<number, z.infer<typeof cellDetailsSchema>>();
    for (const c of full) {
      const details: z.infer<typeof cellDetailsSchema> =
        (c.gsm ? (({ cell_id, ...rest }) => rest)(c.gsm) : null) ??
        (c.umts ? (({ cell_id, ...rest }) => rest)(c.umts) : null) ??
        (c.lte ? (({ cell_id, ...rest }) => rest)(c.lte) : null) ??
        (c.nr ? (({ cell_id, ...rest }) => rest)(c.nr) : null) ??
        null;
      idToDetails.set(c.id, details);
    }

    const response: ResponseData = created.map((cell) => ({ ...cell, details: idToDetails.get(cell.id) ?? null }));

    await createAuditLog(
      {
        action: "cells.create",
        table_name: "cells",
        record_id: null,
        new_values: { cells: response },
        metadata: { station_id },
      },
      req,
    );

    const [updatedStation] = await db.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, station_id)).returning();
    await createAuditLog(
      {
        action: "stations.update",
        table_name: "stations",
        record_id: station_id,
        old_values: station,
        new_values: updatedStation,
        metadata: { reason: "cells.create" },
      },
      req,
    );

    queueStationCellsChangedNotification({ stationId: station_id, counts: { added: response.length } });

    return res.send({ data: response });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const addCells: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id/cells",
  method: "POST",
  config: { permissions: ["write:stations"] },
  schema: schemaRoute,
  handler,
};

export default addCells;
