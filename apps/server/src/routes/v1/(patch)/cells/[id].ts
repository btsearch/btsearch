import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../../../constants.js";
import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { defineScope } from "../../../../features/access/scope.js";
import { auditContextFromRequest, loadCellSnapshot, runAuditedOperation } from "../../../../features/audit/index.js";
import { validateCellBandsInCountry } from "../../../../features/cells/arfcnValidation.js";
import { checkCellDuplicate, checkPciDuplicate, getOperatorIdForStation } from "../../../../features/cells/duplicateCheck.js";
import { NORMAL_RATS, type RATUpdateDetails, isNormalRat, updateRATCellDetailsReturning } from "../../../../features/cells/ratCellPersistence.js";
import {
  assertCellUpdateFitsStoredRat,
  assertCellUpdateSetsNoNsaFields,
  lteUpdateSchema,
  normalRatUpdateSchemaMap,
  nrUpdateSchema,
  withNsaFieldsCleared,
} from "../../../../features/cells/ratCellSchemas.js";
import { queueStationCellsChangedNotification } from "../../../../features/notifications/stationCellChanges.js";
import { assertCanMutateStationCells } from "../../../../features/stations/status.js";
import { makeDetailsRatRefine } from "../../../../features/submissions/helpers.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const cellsUpdateSchema = createUpdateSchema(cells)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({ rat: z.enum(NORMAL_RATS).optional() })
  .strict();
const cellsSelectSchema = createSelectSchema(cells);
const gsmCellsSchema = createSelectSchema(gsmCells).omit({ cell_id: true }).strict();
const umtsCellsSchema = createSelectSchema(umtsCells).omit({ cell_id: true }).strict();
const lteCellsSchema = createSelectSchema(lteCells).omit({ cell_id: true }).strict();
const nrCellsSchema = createSelectSchema(nrCells).omit({ cell_id: true }).strict();
const cellDetailsSchema = z.union([gsmCellsSchema, umtsCellsSchema, lteCellsSchema, nrCellsSchema]).nullable();
const requestSchema = cellsUpdateSchema.extend({ details: z.unknown().optional() }).superRefine(makeDetailsRatRefine(normalRatUpdateSchemaMap));

const schemaRoute = {
  params: z.object({
    id: z.coerce.number<number>(),
  }),
  body: requestSchema,
  response: {
    200: z.object({
      data: cellsSelectSchema.extend({ details: cellDetailsSchema }),
    }),
  },
};
type ReqBody = { Body: z.infer<typeof requestSchema> };
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type RequestData = ReqBody & ReqParams;
type ResponseData = z.infer<typeof cellsSelectSchema> & { details: z.infer<typeof cellDetailsSchema> };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { id } = req.params;

  const cell = await db.query.cells.findFirst({
    where: { id },
    with: { gsm: true, umts: true, lte: true, nr: true },
  });
  if (!cell) throw new ErrorResponse("NOT_FOUND");

  const station = await db.query.stations.findFirst({ where: { id: cell.station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");
  assertCanMutateStationCells(station);
  assertCellUpdateFitsStoredRat(cell, req.body);

  if (req.body.details || req.body.band_id !== undefined) {
    if (req.body.details) {
      const lteDetails = req.body.details as z.infer<typeof lteUpdateSchema> | undefined;
      const identityDetails =
        cell.rat === "LTE" ? ({ ...cell.lte, ...lteDetails } as Record<string, unknown>) : (req.body.details as Record<string, unknown>);
      const operatorId = await getOperatorIdForStation(cell.station_id);
      if (operatorId) await checkCellDuplicate({ rat: cell.rat, details: identityDetails, excludeCellId: id }, operatorId);
      // await checkLTEClidConsistency(cell.station_id, [{ rat: cell.rat, details: identityDetails, excludeCellId: id }]);
    }

    assertCellUpdateSetsNoNsaFields(cell, req.body);

    const effectiveBandId = req.body.band_id ?? cell.band_id;
    const lteDetails = req.body.details as z.infer<typeof lteUpdateSchema> | undefined;
    const nrDetails = req.body.details as z.infer<typeof nrUpdateSchema> | undefined;
    const effectiveDetails =
      cell.rat === "LTE"
        ? {
            enbid: lteDetails?.enbid !== undefined ? lteDetails.enbid : cell.lte?.enbid,
            pci: lteDetails?.pci !== undefined ? lteDetails.pci : cell.lte?.pci,
            earfcn: lteDetails?.earfcn !== undefined ? lteDetails.earfcn : cell.lte?.earfcn,
          }
        : cell.rat === "NR"
          ? {
              pci: nrDetails?.pci !== undefined ? nrDetails.pci : cell.nr?.pci,
              arfcn: nrDetails?.arfcn !== undefined ? nrDetails.arfcn : cell.nr?.arfcn,
            }
          : null;
    await checkPciDuplicate(cell.station_id, { rat: cell.rat, bandId: effectiveBandId, details: effectiveDetails, excludeCellId: id });
  }

  if (req.body.band_id !== undefined || req.body.rat !== undefined || req.body.details !== undefined) {
    const candidate = {
      rat: req.body.rat ?? cell.rat,
      band_id: req.body.band_id ?? cell.band_id,
      details: { ...(cell.gsm ?? cell.umts ?? cell.lte ?? cell.nr), ...(req.body.details as object | undefined) },
    };
    await validateCellBandsInCountry([candidate], LEGACY_COUNTRY_CODE);
  }

  try {
    const updated = await runAuditedOperation(auditContextFromRequest(req), { kind: "cells.update" }, async (tx, audit) => {
      const oldSnapshot = await loadCellSnapshot(tx, id);
      if (!oldSnapshot) throw new ErrorResponse("NOT_FOUND");

      const { details, ...patch } = req.body;
      const [saved] = await tx
        .update(cells)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(cells.id, id))
        .returning();
      if (!saved) throw new ErrorResponse("FAILED_TO_UPDATE");

      if (details && isNormalRat(cell.rat)) {
        const updatedDetails = await updateRATCellDetailsReturning(tx, cell.rat, id, withNsaFieldsCleared(cell, details as RATUpdateDetails));
        if (!updatedDetails)
          throw new ErrorResponse("FAILED_TO_UPDATE", {
            message: `This cell has no ${cell.rat} data assigned. Try removing the cell first and re-adding it with the actual data`,
          });
      }

      const newSnapshot = await loadCellSnapshot(tx, id);
      if (!newSnapshot) throw new ErrorResponse("FAILED_TO_UPDATE");

      await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, cell.station_id));
      await audit.log({
        entity: "cells",
        op: "update",
        recordId: id,
        stationId: cell.station_id,
        old: oldSnapshot,
        new: newSnapshot,
      });
      return newSnapshot as ResponseData;
    });

    queueStationCellsChangedNotification({ stationId: cell.station_id, counts: { updated: 1 } });

    return res.send({ data: updated });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateCell: Route<RequestData, ResponseData> = {
  url: "/cells/:id",
  method: "PATCH",
  config: {
    permissions: ["update:cells"],
    scope: defineScope<RequestData>((req) => ({
      cellIds: [req.params.id],
      stationIds: req.body.station_id === undefined ? [] : [req.body.station_id],
    })),
  },
  schema: schemaRoute,
  handler,
};

export default updateCell;
