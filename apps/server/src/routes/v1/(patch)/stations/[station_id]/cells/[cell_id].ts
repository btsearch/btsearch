import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../../../../../constants.js";
import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import { defineScope } from "../../../../../../features/access/scope.js";
import { auditContextFromRequest, loadCellSnapshot, runAuditedOperation } from "../../../../../../features/audit/index.js";
import { validateCellBandsInCountry } from "../../../../../../features/cells/arfcnValidation.js";
import { checkCellDuplicate, checkPciDuplicate } from "../../../../../../features/cells/duplicateCheck.js";
import {
  NORMAL_RATS,
  type RATUpdateDetails,
  isNormalRat,
  updateRATCellDetailsReturning,
} from "../../../../../../features/cells/ratCellPersistence.js";
import {
  assertCellUpdateFitsStoredRat,
  assertCellUpdateSetsNoNsaFields,
  gsmNullableFields,
  refuseNsaFields,
  umtsNullableFields,
  withNsaFieldsCleared,
} from "../../../../../../features/cells/ratCellSchemas.js";
import { queueStationCellsChangedNotification } from "../../../../../../features/notifications/stationCellChanges.js";
import { disabledCountryFeatures, getStationCountryFeatures } from "../../../../../../features/stations/countryFeatures.js";
import { assertCanMutateStationCells } from "../../../../../../features/stations/status.js";
import { makeDetailsRatRefine } from "../../../../../../features/submissions/helpers.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const cellsUpdateSchema = createUpdateSchema(cells)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({ rat: z.enum(NORMAL_RATS).optional() })
  .strict();
const cellsSelectSchema = createSelectSchema(cells);
const gsmCellsSelectSchema = createSelectSchema(gsmCells).omit({ cell_id: true }).strict();
const umtsCellsSelectSchema = createSelectSchema(umtsCells).omit({ cell_id: true }).strict();
const lteCellsSelectSchema = createSelectSchema(lteCells).omit({ cell_id: true }).strict();
const nrCellsSelectSchema = createSelectSchema(nrCells).omit({ cell_id: true }).strict();
const cellDetailsSchema = z.union([gsmCellsSelectSchema, umtsCellsSelectSchema, lteCellsSelectSchema, nrCellsSelectSchema]).optional();
const gsmCellsUpdateSchema = createUpdateSchema(gsmCells)
  .extend({ ...gsmNullableFields, lac: z.number().int().min(0).max(65535).optional(), cid: z.number().int().min(0).max(65535).optional() })
  .strict();
const umtsCellsUpdateSchema = createUpdateSchema(umtsCells)
  .extend({
    ...umtsNullableFields,
    rnc: z.number().int().min(0).max(65535).optional(),
    cid: z.number().int().min(0).max(65535).optional(),
  })
  .strict();
const lteCellsUpdateSchema = createUpdateSchema(lteCells)
  .extend({
    tac: z.number().int().min(0).max(65535).nullable().optional(),
    enbid: z.number().int().min(0).max(1048575).optional(),
    clid: z.number().int().min(0).max(255).optional(),
    pci: z.number().int().min(0).max(503).nullable().optional(),
    earfcn: z.number().int().min(0).max(262143).nullable().optional(),
  })
  .strict();
const nrCellsUpdateSchema = createUpdateSchema(nrCells)
  .extend({
    nrtac: z.number().int().min(0).max(16777215).nullable().optional(),
    gnbid: z.number().int().min(0).max(2147483647).nullable().optional(),
    clid: z.number().int().min(0).max(16383).nullable().optional(),
    pci: z.number().int().min(0).max(1007).nullable().optional(),
    arfcn: z.number().int().min(0).max(3279165).nullable().optional(),
  })
  .strict()
  .superRefine(refuseNsaFields);
const requestSchema = cellsUpdateSchema
  .extend({ details: z.unknown().optional() })
  .superRefine(makeDetailsRatRefine({ GSM: gsmCellsUpdateSchema, UMTS: umtsCellsUpdateSchema, LTE: lteCellsUpdateSchema, NR: nrCellsUpdateSchema }));
const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
    cell_id: z.coerce.number<number>(),
  }),
  body: requestSchema,
  response: {
    200: z.object({
      data: cellsSelectSchema.extend({ details: cellDetailsSchema }),
    }),
  },
};
type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type ReqBody = { Body: z.infer<typeof requestSchema> };
type RequestData = ReqBody & ReqParams;
type ResponseData = z.infer<typeof cellsSelectSchema> & { details: z.infer<typeof cellDetailsSchema> };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id, cell_id } = req.params;
  if (Number.isNaN(station_id) || Number.isNaN(cell_id)) throw new ErrorResponse("INVALID_QUERY");

  const station = await db.query.stations.findFirst({
    where: {
      id: station_id,
    },
  });
  if (!station) throw new ErrorResponse("NOT_FOUND");
  assertCanMutateStationCells(station);

  const cell = await db.query.cells.findFirst({
    where: {
      AND: [{ id: cell_id }, { station_id: station_id }],
    },
    with: { lte: true, nr: true },
  });
  if (!cell) throw new ErrorResponse("NOT_FOUND");
  assertCellUpdateFitsStoredRat(cell, req.body);

  if (req.body.details) {
    const lteDetails = req.body.details as z.infer<typeof lteCellsUpdateSchema> | undefined;
    const identityDetails =
      cell.rat === "LTE" ? ({ ...cell.lte, ...lteDetails } as Record<string, unknown>) : (req.body.details as Record<string, unknown>);
    if (station.operator_id) await checkCellDuplicate({ rat: cell.rat, details: identityDetails, excludeCellId: cell_id }, station.operator_id);
    // await checkLTEClidConsistency(station_id, [{ rat: cell.rat, details: identityDetails, excludeCellId: cell_id }]);
  }

  assertCellUpdateSetsNoNsaFields(cell, req.body);

  if (req.body.details || req.body.band_id !== undefined) {
    const effectiveBandId = req.body.band_id ?? cell.band_id;
    const lteDetails = req.body.details as z.infer<typeof lteCellsUpdateSchema> | undefined;
    const nrDetails = req.body.details as z.infer<typeof nrCellsUpdateSchema> | undefined;
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
    await checkPciDuplicate(station_id, { rat: cell.rat, bandId: effectiveBandId, details: effectiveDetails, excludeCellId: cell_id });
  }

  {
    const effectiveBandId = req.body.band_id ?? cell.band_id;
    const lteDetails = req.body.details as z.infer<typeof lteCellsUpdateSchema> | undefined;
    const nrDetails = req.body.details as z.infer<typeof nrCellsUpdateSchema> | undefined;
    const effectiveDetails =
      cell.rat === "LTE"
        ? { earfcn: lteDetails?.earfcn !== undefined ? lteDetails.earfcn : cell.lte?.earfcn }
        : cell.rat === "NR"
          ? { arfcn: nrDetails?.arfcn !== undefined ? nrDetails.arfcn : cell.nr?.arfcn }
          : req.body.details;
    await validateCellBandsInCountry([{ rat: req.body.rat ?? cell.rat, band_id: effectiveBandId, details: effectiveDetails }], LEGACY_COUNTRY_CODE);
  }

  try {
    const updated = await runAuditedOperation(auditContextFromRequest(req), { kind: "cells.update" }, async (tx, audit) => {
      const oldSnapshot = await loadCellSnapshot(tx, cell_id);
      if (!oldSnapshot) throw new ErrorResponse("NOT_FOUND");

      const { details, ...patch } = req.body;
      const [saved] = await tx
        .update(cells)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(cells.id, cell_id))
        .returning();
      if (!saved) throw new ErrorResponse("FAILED_TO_UPDATE");

      if (details && isNormalRat(saved.rat)) {
        const featuresByStation = await getStationCountryFeatures([saved.station_id], tx);
        const features = featuresByStation.get(saved.station_id) ?? disabledCountryFeatures;
        const existing = await updateRATCellDetailsReturning(
          tx,
          saved.rat,
          cell_id,
          withNsaFieldsCleared(saved, details as RATUpdateDetails),
          features,
        );
        if (!existing)
          throw new ErrorResponse("FAILED_TO_UPDATE", {
            message: `This cell has no ${saved.rat} data assigned. Try removing the cell first and re-adding it with the actual data`,
          });
      }

      const newSnapshot = await loadCellSnapshot(tx, cell_id);
      if (!newSnapshot) throw new ErrorResponse("FAILED_TO_UPDATE");

      await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, station_id));
      await audit.log({
        entity: "cells",
        op: "update",
        recordId: cell_id,
        stationId: station_id,
        old: oldSnapshot,
        new: newSnapshot,
      });
      return { ...newSnapshot, details: newSnapshot.details ?? undefined } as ResponseData;
    });

    queueStationCellsChangedNotification({ stationId: station_id, counts: { updated: 1 } });

    return res.send({ data: updated });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const updateCell: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id/cells/:cell_id",
  method: "PATCH",
  schema: schemaRoute,
  config: {
    permissions: ["update:cells"],
    scope: defineScope<RequestData>((req) => ({
      stationIds: req.body.station_id === undefined ? [req.params.station_id] : [req.params.station_id, req.body.station_id],
    })),
  },
  handler,
};

export default updateCell;
