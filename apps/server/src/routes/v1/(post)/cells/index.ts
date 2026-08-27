import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../services/auditLog.service.js";
import {
  checkCellDuplicate,
  checkLTEClidConsistency,
  checkPciDuplicate,
  getOperatorIdForStation,
} from "../../../../services/cellDuplicateCheck.service.js";
import { validateCellARFCNsForBands } from "../../../../utils/cellARFCNValidation.js";
import { queueStationCellsChangedNotification } from "../../../../utils/notifications/stationCellChanges.js";
import { type RATInsertDetails, insertRATCellDetailsReturning, isNormalRat } from "../../../../utils/ratCellPersistence.js";
import { normalRatInsertSchemaMap } from "../../../../utils/ratCellSchemas.js";
import { assertCanMutateStationCells } from "../../../../utils/stationStatus.js";
import { makeDetailsRatRefine } from "../../../../utils/submission.helpers.js";

const cellsSelectSchema = createSelectSchema(cells);
const gsmCellsSchema = createSelectSchema(gsmCells);
const umtsCellsSchema = createSelectSchema(umtsCells);
const lteCellsSchema = createSelectSchema(lteCells);
const nrCellsSchema = createSelectSchema(nrCells);
const cellDetailsSchema = z.union([gsmCellsSchema, umtsCellsSchema, lteCellsSchema, nrCellsSchema]).nullable();
const cellsInsertSchema = createInsertSchema(cells)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({ rat: z.enum(["GSM", "CDMA", "UMTS", "LTE", "NR"]) })
  .strict();

const requestSchema = cellsInsertSchema.extend({ details: z.unknown().optional() }).superRefine(makeDetailsRatRefine(normalRatInsertSchemaMap));

type ReqWithDetails = { Body: z.infer<typeof requestSchema> };

type ResponseData = z.infer<typeof cellsSelectSchema> & { details: z.infer<typeof cellDetailsSchema> };
const schemaRoute = {
  body: requestSchema,
  response: {
    200: z.object({
      data: cellsSelectSchema.extend({ details: cellDetailsSchema }),
    }),
  },
};

async function handler(req: FastifyRequest<ReqWithDetails>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const station = await db.query.stations.findFirst({ where: { id: req.body.station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");
  assertCanMutateStationCells(station);

  try {
    if (req.body.details && req.body.station_id) {
      const operatorId = await getOperatorIdForStation(req.body.station_id);
      if (operatorId) await checkCellDuplicate({ rat: req.body.rat, details: req.body.details as Record<string, unknown> }, operatorId);
      await checkLTEClidConsistency(req.body.station_id, [{ rat: req.body.rat, details: req.body.details as Record<string, unknown> }]);
    }

    if (req.body.details && req.body.station_id && req.body.band_id) {
      await checkPciDuplicate(req.body.station_id, {
        rat: req.body.rat,
        bandId: req.body.band_id,
        details: req.body.details as { pci?: number | null; earfcn?: number | null; arfcn?: number | null },
      });
    }

    await validateCellARFCNsForBands([{ rat: req.body.rat, band_id: req.body.band_id, details: req.body.details }]);

    const [inserted] = await db.insert(cells).values(req.body).returning();
    if (!inserted) throw new ErrorResponse("FAILED_TO_CREATE");

    let details: z.infer<typeof cellDetailsSchema> = null;
    if (req.body.details && isNormalRat(inserted.rat)) {
      const insertedDetails = await insertRATCellDetailsReturning(db, inserted.rat, inserted.id, req.body.details as RATInsertDetails);
      details = insertedDetails as z.infer<typeof cellDetailsSchema>;
    }

    await createAuditLog(
      {
        action: "cells.create",
        table_name: "cells",
        record_id: inserted.id,
        old_values: null,
        new_values: { ...inserted, details },
        metadata: { station_id: inserted.station_id },
      },
      req,
    );

    await db.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, inserted.station_id));
    await createAuditLog(
      {
        action: "stations.update",
        table_name: "stations",
        record_id: inserted.station_id,
        new_values: { updatedAt: new Date() },
        metadata: { reason: "cells.create" },
      },
      req,
    );

    queueStationCellsChangedNotification({ stationId: inserted.station_id, counts: { added: 1 } });

    return res.send({ data: { ...inserted, details } as ResponseData });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw (new ErrorResponse("FAILED_TO_CREATE"), { cause: error });
  }
}

const createCell: Route<ReqWithDetails, ResponseData> = {
  url: "/cells",
  method: "POST",
  config: { permissions: ["write:cells"] },
  schema: schemaRoute,
  handler,
};

export default createCell;
