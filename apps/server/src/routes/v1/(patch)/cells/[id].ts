import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
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
import { queueStationCellsChangedNotification } from "../../../../utils/notifications/stationCellChanges.js";
import { type RATUpdateDetails, isNormalRat, updateRATCellDetailsReturning } from "../../../../utils/ratCellPersistence.js";
import { lteUpdateSchema, normalRatUpdateSchemaMap, nrUpdateSchema } from "../../../../utils/ratCellSchemas.js";
import { assertCanMutateStationCells } from "../../../../utils/stationStatus.js";
import { makeDetailsRatRefine } from "../../../../utils/submission.helpers.js";

const cellsUpdateSchema = createUpdateSchema(cells)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({ rat: z.enum(["GSM", "CDMA", "UMTS", "LTE", "NR"]).optional() })
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

  if (req.body.details || req.body.band_id !== undefined) {
    if (req.body.details) {
      const lteDetails = req.body.details as z.infer<typeof lteUpdateSchema> | undefined;
      const identityDetails =
        cell.rat === "LTE" ? ({ ...cell.lte, ...lteDetails } as Record<string, unknown>) : (req.body.details as Record<string, unknown>);
      const operatorId = await getOperatorIdForStation(cell.station_id);
      if (operatorId) await checkCellDuplicate({ rat: cell.rat, details: identityDetails, excludeCellId: id }, operatorId);
      await checkLTEClidConsistency(cell.station_id, [{ rat: cell.rat, details: identityDetails, excludeCellId: id }]);
    }

    if (req.body.details && cell.rat === "NR") {
      const nrDetails = req.body.details as z.infer<typeof nrUpdateSchema>;
      const effectiveType = nrDetails.type ?? cell.nr?.type;
      if (effectiveType === "nsa") {
        for (const field of ["nrtac", "clid", "gnbid"] as const) {
          if (nrDetails[field] !== null && nrDetails[field] !== undefined)
            throw new ErrorResponse("BAD_REQUEST", { message: `${field} must not be set for NSA NR cells` });
        }
        if (nrDetails.supports_nr_redcap === true)
          throw new ErrorResponse("BAD_REQUEST", { message: "supports_nr_redcap must not be set for NSA NR cells" });
      }
    }

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

  try {
    const [updated] = await db
      .update(cells)
      .set({
        ...req.body,
        updatedAt: new Date(),
      })
      .where(eq(cells.id, id))
      .returning();
    if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");

    if (req.body.details && isNormalRat(cell.rat)) {
      const updatedDetails = await updateRATCellDetailsReturning(db, cell.rat, id, req.body.details as RATUpdateDetails);
      if (!updatedDetails)
        throw new ErrorResponse("FAILED_TO_UPDATE", {
          message: `This cell has no ${cell.rat} data assigned. Try removing the cell first and re-adding it with the actual data`,
        });
    }

    const full = await db.query.cells.findFirst({
      where: {
        id,
      },
      with: { gsm: true, umts: true, lte: true, nr: true },
    });
    const details = full?.gsm ?? full?.umts ?? full?.lte ?? full?.nr ?? null;

    // oxlint-disable-next-line no-unused-vars: We want to remove those from the object
    const { gsm, umts, lte, nr, ...oldBase } = cell;
    const oldDetails = cell.gsm ?? cell.umts ?? cell.lte ?? cell.nr ?? null;
    await createAuditLog(
      {
        action: "cells.update",
        table_name: "cells",
        record_id: id,
        old_values: { ...oldBase, details: oldDetails },
        new_values: { ...updated, details },
        metadata: { station_id: cell.station_id },
      },
      req,
    );

    await db.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, cell.station_id));
    await createAuditLog(
      {
        action: "stations.update",
        table_name: "stations",
        record_id: cell.station_id,
        new_values: { updatedAt: new Date() },
        metadata: { reason: "cells.update" },
      },
      req,
    );

    queueStationCellsChangedNotification({ stationId: cell.station_id, counts: { updated: 1 } });

    return res.send({ data: { ...updated, details } });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw (new ErrorResponse("FAILED_TO_UPDATE"), { cause: error });
  }
}

const updateCell: Route<RequestData, ResponseData> = {
  url: "/cells/:id",
  method: "PATCH",
  config: { permissions: ["write:cells"] },
  schema: schemaRoute,
  handler,
};

export default updateCell;
