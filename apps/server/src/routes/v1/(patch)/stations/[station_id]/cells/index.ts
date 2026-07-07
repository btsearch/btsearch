import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { createAuditLog } from "../../../../../../services/auditLog.service.js";
import { checkCellDuplicatesBatch, checkLTEClidConsistency, checkPciDuplicates } from "../../../../../../services/cellDuplicateCheck.service.js";
import { validateCellARFCNsForBands } from "../../../../../../utils/cellARFCNValidation.js";
import { queueStationCellsChangedNotification } from "../../../../../../utils/notifications/stationCellChanges.js";
import { type RATUpdateDetails, isNormalRat, updateRATCellDetailsReturning } from "../../../../../../utils/ratCellPersistence.js";
import { lteNullableFields, nrExtendFields, umtsNullableFields } from "../../../../../../utils/ratCellSchemas.js";
import { assertCanMutateStationCells } from "../../../../../../utils/stationStatus.js";
import { makeDetailsRatRefine, validateCellDuplicates } from "../../../../../../utils/submission.helpers.js";

const cellsUpdateSchema = createUpdateSchema(cells)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({ rat: z.enum(["GSM", "CDMA", "UMTS", "LTE", "NR"]).optional() })
  .strict();
const cellsSelectSchema = createSelectSchema(cells);
const gsmCellsSelectSchema = createSelectSchema(gsmCells).omit({ cell_id: true }).strict();
const umtsCellsSelectSchema = createSelectSchema(umtsCells).omit({ cell_id: true }).strict();
const lteCellsSelectSchema = createSelectSchema(lteCells).omit({ cell_id: true }).strict();
const nrCellsSelectSchema = createSelectSchema(nrCells).omit({ cell_id: true }).strict();
const cellDetailsSchema = z.union([gsmCellsSelectSchema, umtsCellsSelectSchema, lteCellsSelectSchema, nrCellsSelectSchema]).optional();
const gsmCellsUpdateSchema = createUpdateSchema(gsmCells)
  .extend({ lac: z.number().int().min(0).max(65535).optional(), cid: z.number().int().min(0).max(65535).optional() })
  .strict();
const umtsCellsUpdateSchema = createUpdateSchema(umtsCells)
  .extend({ ...umtsNullableFields, rnc: z.number().int().min(0).max(65535).optional(), cid: z.number().int().min(0).max(65535).optional() })
  .strict();
const lteCellsUpdateSchema = createUpdateSchema(lteCells)
  .extend({
    tac: z.number().int().min(0).max(65535).nullable().optional(),
    enbid: z.number().int().min(0).max(1048575).optional(),
    clid: z.number().int().min(0).max(255).optional(),
    ...lteNullableFields,
  })
  .strict();
const nrCellsUpdateSchema = createUpdateSchema(nrCells).extend(nrExtendFields).strict();

const cellPatchSchema = cellsUpdateSchema
  .extend({ cell_id: z.number(), details: z.unknown().optional() })
  .superRefine(makeDetailsRatRefine({ GSM: gsmCellsUpdateSchema, UMTS: umtsCellsUpdateSchema, LTE: lteCellsUpdateSchema, NR: nrCellsUpdateSchema }));

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
  }),
  body: z.object({
    cells: z.array(cellPatchSchema).min(1),
  }),
  response: {
    200: z.object({
      data: z.array(cellsSelectSchema.extend({ details: cellDetailsSchema })),
    }),
  },
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type ReqBody = { Body: { cells: z.infer<typeof cellPatchSchema>[] } };
type RequestData = ReqParams & ReqBody;
type ResponseData = (z.infer<typeof cellsSelectSchema> & { details: z.infer<typeof cellDetailsSchema> })[];

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id } = req.params;
  const { cells: cellsData } = req.body;

  const station = await db.query.stations.findFirst({ where: { id: station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");
  assertCanMutateStationCells(station);

  const existingCells = await db.query.cells.findMany({
    where: {
      RAW: (fields, { inArray }) =>
        inArray(
          fields.id,
          cellsData.map((c) => c.cell_id),
        ),
    },
    with: {
      gsm: { columns: { cell_id: false } },
      umts: { columns: { cell_id: false } },
      lte: { columns: { cell_id: false } },
      nr: { columns: { cell_id: false } },
    },
  });

  for (const cellData of cellsData) {
    const existing = existingCells.find((c) => c.id === cellData.cell_id);
    if (!existing || existing.station_id !== station_id) throw new ErrorResponse("NOT_FOUND");
  }

  const effectiveCells = cellsData.map((cellData) => {
    const existing = existingCells.find((cell) => cell.id === cellData.cell_id)!;
    const effectiveBandId = cellData.band_id ?? existing.band_id;
    const lteDetails = cellData.details as z.infer<typeof lteCellsUpdateSchema> | undefined;
    const nrDetails = cellData.details as z.infer<typeof nrCellsUpdateSchema> | undefined;
    const effectiveDetails =
      existing.rat === "LTE" ? { ...existing.lte, ...lteDetails } : existing.rat === "NR" ? { ...existing.nr, ...nrDetails } : cellData.details;
    return { rat: existing.rat, band_id: effectiveBandId, details: effectiveDetails };
  });

  validateCellDuplicates(effectiveCells);

  const allModifiedCellIds = cellsData.map((cellData) => cellData.cell_id);

  await Promise.all([
    station.operator_id
      ? checkCellDuplicatesBatch(
          effectiveCells.map((cell, index) => ({
            rat: cell.rat,
            details: cell.details as Record<string, unknown> | undefined,
            excludeCellId: cellsData[index]?.cell_id,
          })),
          station.operator_id,
          allModifiedCellIds,
        )
      : Promise.resolve(),
    // checkLTEClidConsistency(
    //   station_id,
    //   effectiveCells.map((cell, index) => ({
    //     rat: cell.rat,
    //     details: cell.details as Record<string, unknown> | undefined,
    //     excludeCellId: cellsData[index]?.cell_id,
    //   })),
    //   allModifiedCellIds,
    // ),
    validateCellARFCNsForBands(effectiveCells),
    checkPciDuplicates(
      station_id,
      effectiveCells.map((cell) => ({
        rat: cell.rat,
        bandId: cell.band_id,
        details: cell.details as { pci?: number | null; earfcn?: number | null; arfcn?: number | null } | null | undefined,
      })),
      allModifiedCellIds,
    ),
  ]);

  try {
    const updated = await db.transaction(async (tx) => {
      const results: z.infer<typeof cellsSelectSchema>[] = [];

      for (const cellData of cellsData) {
        const { cell_id, details, ...patch } = cellData;
        const existing = existingCells.find((c) => c.id === cell_id)!;

        /* eslint-disable-next-line no-await-in-loop */
        const [updatedCell] = await tx
          .update(cells)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(cells.id, cell_id))
          .returning();
        if (!updatedCell) throw new ErrorResponse("FAILED_TO_UPDATE");

        if (details && isNormalRat(existing.rat)) {
          /* eslint-disable-next-line no-await-in-loop */
          const row = await updateRATCellDetailsReturning(tx, existing.rat, cell_id, details as RATUpdateDetails);
          if (!row)
            throw new ErrorResponse("FAILED_TO_UPDATE", {
              message: `This cell has no ${existing.rat} data assigned. Try removing the cell first and re-adding it with the actual data`,
            });
        }

        results.push(updatedCell);
      }

      return results;
    });

    const ids = updated.map((c) => c.id);
    const full = await db.query.cells.findMany({
      where: {
        RAW: (fields, { inArray }) => inArray(fields.id, ids),
      },
      with: {
        gsm: { columns: { cell_id: false } },
        umts: { columns: { cell_id: false } },
        lte: { columns: { cell_id: false } },
        nr: { columns: { cell_id: false } },
      },
    });

    const response: ResponseData = updated.map((cell) => {
      const fullCell = full.find((c) => c.id === cell.id);
      const details = fullCell?.gsm ?? fullCell?.umts ?? fullCell?.lte ?? fullCell?.nr ?? undefined;
      return { ...cell, details };
    });

    const cellsUpdated = response.map((cell) => {
      const oldFull = existingCells.find((c) => c.id === cell.id);
      // oxlint-disable-next-line no-unused-vars: We want to remove those from the object
      const { gsm, umts, lte, nr, ...oldBase } = oldFull ?? ({} as typeof oldFull & Record<string, never>);
      const oldDetails = oldFull ? (oldFull.gsm ?? oldFull.umts ?? oldFull.lte ?? oldFull.nr ?? undefined) : undefined;
      return { old: { ...oldBase, details: oldDetails }, new: cell };
    });
    await createAuditLog(
      {
        action: "cells.update",
        table_name: "cells",
        record_id: null,
        old_values: { cells: cellsUpdated.map((c) => c.old) },
        new_values: { cells: cellsUpdated.map((c) => c.new) },
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
        old_values: { updatedAt: station.updatedAt },
        new_values: { updatedAt: updatedStation?.updatedAt },
        metadata: { reason: "cells.update" },
      },
      req,
    );

    queueStationCellsChangedNotification({ stationId: station_id, counts: { updated: response.length } });

    return res.send({ data: response });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw (new ErrorResponse("FAILED_TO_UPDATE"), { cause: error });
  }
}

const updateCells: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id/cells",
  method: "PATCH",
  schema: schemaRoute,
  config: { permissions: ["write:stations"] },
  handler,
};

export default updateCells;
