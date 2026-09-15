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
import { auditContextFromRequest, loadCellSnapshots, runAuditedOperation } from "../../../../../../services/audit/index.js";
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
    // checkLTEClidConsistency(
    //   station_id,
    //   cellsData.map((cell) => ({ rat: cell.rat, details: cell.details as Record<string, unknown> | undefined })),
    // ),
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
    const response = await runAuditedOperation(auditContextFromRequest(req), { kind: "cells.create" }, async (tx, audit) => {
      const now = new Date();
      const created = await tx
        .insert(cells)
        .values(
          cellsData.map(({ details: _details, ...cell }) => ({
            ...cell,
            station_id: station.id,
            updatedAt: now,
            createdAt: now,
          })),
        )
        .returning();

      await Promise.all(
        created.map(async (row, index) => {
          const details = cellsData[index]?.details;
          if (details && isNormalRat(row.rat)) await insertRATCellDetails(tx, row.rat, row.id, details as RATInsertDetails);
        }),
      );

      const ids = created.map((cell) => cell.id);
      const snapshots = await loadCellSnapshots(tx, ids);
      const createdSnapshots = ids.map((id) => {
        const snapshot = snapshots.get(id);
        if (!snapshot) throw new ErrorResponse("FAILED_TO_CREATE");
        return snapshot;
      });

      await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, station_id));
      await audit.logMany(
        createdSnapshots.map((snapshot) => ({
          entity: "cells",
          op: "create",
          recordId: snapshot.id,
          stationId: station_id,
          old: null,
          new: snapshot,
        })),
      );
      return createdSnapshots as ResponseData;
    });

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
  config: { permissions: ["create:cells"] },
  schema: schemaRoute,
  handler,
};

export default addCells;
