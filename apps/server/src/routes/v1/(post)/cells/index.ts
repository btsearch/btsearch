import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../../../constants.js";
import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { defineScope } from "../../../../features/access/scope.js";
import { auditContextFromRequest, loadCellSnapshot, runAuditedOperation } from "../../../../features/audit/index.js";
import { validateCellBandsInCountry } from "../../../../features/cells/arfcnValidation.js";
import { checkCellDuplicate, checkPciDuplicate, getOperatorIdForStation } from "../../../../features/cells/duplicateCheck.js";
import { NORMAL_RATS, type RATInsertDetails, insertRATCellDetailsReturning, isNormalRat } from "../../../../features/cells/ratCellPersistence.js";
import { normalRatInsertSchemaMap } from "../../../../features/cells/ratCellSchemas.js";
import { queueStationCellsChangedNotification } from "../../../../features/notifications/stationCellChanges.js";
import { assertCanMutateStationCells } from "../../../../features/stations/status.js";
import { makeDetailsRatRefine } from "../../../../features/submissions/helpers.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const cellsSelectSchema = createSelectSchema(cells);
const gsmCellsSchema = createSelectSchema(gsmCells).omit({ cell_id: true });
const umtsCellsSchema = createSelectSchema(umtsCells).omit({ cell_id: true });
const lteCellsSchema = createSelectSchema(lteCells).omit({ cell_id: true });
const nrCellsSchema = createSelectSchema(nrCells).omit({ cell_id: true });
const cellDetailsSchema = z.union([gsmCellsSchema, umtsCellsSchema, lteCellsSchema, nrCellsSchema]).nullable();
const cellsInsertSchema = createInsertSchema(cells)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({ rat: z.enum(NORMAL_RATS) })
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
      // await checkLTEClidConsistency(req.body.station_id, [{ rat: req.body.rat, details: req.body.details as Record<string, unknown> }]);
    }

    if (req.body.details && req.body.station_id && req.body.band_id) {
      await checkPciDuplicate(req.body.station_id, {
        rat: req.body.rat,
        bandId: req.body.band_id,
        details: req.body.details as { pci?: number | null; earfcn?: number | null; arfcn?: number | null },
      });
    }

    await validateCellBandsInCountry([{ rat: req.body.rat, band_id: req.body.band_id, details: req.body.details }], LEGACY_COUNTRY_CODE);

    const { details: requestedDetails, ...cellData } = req.body;
    const created = await runAuditedOperation(auditContextFromRequest(req), { kind: "cells.create" }, async (tx, audit) => {
      const [inserted] = await tx.insert(cells).values(cellData).returning();
      if (!inserted) throw new ErrorResponse("FAILED_TO_CREATE");

      if (requestedDetails && isNormalRat(inserted.rat))
        await insertRATCellDetailsReturning(tx, inserted.rat, inserted.id, requestedDetails as RATInsertDetails);

      const snapshot = await loadCellSnapshot(tx, inserted.id);
      if (!snapshot) throw new ErrorResponse("FAILED_TO_CREATE");

      await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, inserted.station_id));
      await audit.log({
        entity: "cells",
        op: "create",
        recordId: inserted.id,
        stationId: inserted.station_id,
        old: null,
        new: snapshot,
      });
      return snapshot as ResponseData;
    });

    queueStationCellsChangedNotification({ stationId: created.station_id, counts: { added: 1 } });

    return res.send({ data: created });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_CREATE", { cause: error });
  }
}

const createCell: Route<ReqWithDetails, ResponseData> = {
  url: "/cells",
  method: "POST",
  config: { permissions: ["create:cells"], scope: defineScope<ReqWithDetails>((req) => ({ stationIds: [req.body.station_id] })) },
  schema: schemaRoute,
  handler,
};

export default createCell;
