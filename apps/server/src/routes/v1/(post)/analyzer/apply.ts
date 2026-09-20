import { cells, lteCells, stations } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { CELL_TYPES } from "@openbts/shared/cellTypes";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import z from "zod";

import { ErrorResponse } from "../../../../errors.ts";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.ts";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.ts";
import { type AuditRecorder, auditContextFromRequest, loadCellSnapshots, runAuditedOperation } from "../../../../services/audit/index.ts";
import { checkCellDuplicatesBatch, checkPciDuplicates } from "../../../../services/cellDuplicateCheck.service.ts";
import { queueStationCellsChangedNotification } from "../../../../services/notifications/stationCellChanges.js";
import type { DbTx } from "../../../../types/global.ts";
import { validateCellARFCNsAgainstBands } from "../../../../utils/cellARFCNValidation.ts";
import {
  type LTEInsertDetails,
  type RATInsertDetails,
  type RATUpdateDetails,
  insertRATCellDetails,
  updateRATCellDetails,
} from "../../../../utils/ratCellPersistence.ts";
import { normalRatInsertSchemaMap, normalRatUpdateSchemaMap } from "../../../../utils/ratCellSchemas.ts";
import { makeDetailsRatRefine, validateCellDuplicates } from "../../../../utils/submission.helpers.ts";

const ITEMS_CAP = 50;
const cellSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("add"),
      target_cell_id: z.number().optional(),
      band_id: z.number(),
      rat: z.enum(["GSM", "UMTS", "LTE", "NR"]),
      type: z.enum(CELL_TYPES).nullable().optional(),
      details: z.unknown().optional(),
    })
    .superRefine(makeDetailsRatRefine(normalRatInsertSchemaMap)),
  z
    .object({
      operation: z.literal("update"),
      target_cell_id: z.number().optional(),
      band_id: z.number(),
      rat: z.enum(["GSM", "UMTS", "LTE", "NR"]),
      type: z.enum(CELL_TYPES).nullable().optional(),
      details: z.unknown().optional(),
    })
    .superRefine(makeDetailsRatRefine(normalRatUpdateSchemaMap)),
]);

const requestSchema = z.object({
  items: z
    .array(
      z.object({
        station_id: z.number(),
        cells: z.array(cellSchema).min(1),
      }),
    )
    .min(1)
    .max(ITEMS_CAP),
});

const responseSchema = z.object({
  data: z.array(
    z.object({
      station_id: z.number(),
      applied: z.number(),
    }),
  ),
});

type ReqBody = { Body: z.infer<typeof requestSchema> };
type ResponseData = z.infer<typeof responseSchema.shape.data>;

const schemaRoute = {
  body: requestSchema,
  response: { 200: responseSchema },
};

type StationChangeRecord = {
  station_id: number;
  updatedCellIds: number[];
  addedCellIds: number[];
  applied: number;
};

function addStationTac(stationTacs: Map<number, number>, stationId: number, tac: number): void {
  const existingTac = stationTacs.get(stationId);
  if (existingTac !== undefined && existingTac !== tac)
    throw new ErrorResponse("BAD_REQUEST", { message: `Multiple TAC values submitted for station ${stationId}` });
  stationTacs.set(stationId, tac);
}

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const userId = req.userSession?.user.id;
  if (!userId) throw new ErrorResponse("UNAUTHORIZED");
  const { items } = req.body;

  const stationIds = [...new Set(items.map((item) => item.station_id))];
  const updateCellIds = [
    ...new Set(
      items.flatMap((item) =>
        item.cells.filter((cell) => cell.operation === "update" && cell.target_cell_id !== undefined).map((cell) => cell.target_cell_id!),
      ),
    ),
  ];
  const allBandIds = [...new Set(items.flatMap((item) => item.cells.map((cell) => cell.band_id)))];

  const [stationResults, existingCells, bandRows] = await Promise.all([
    db.query.stations.findMany({
      where: { AND: [{ id: { in: stationIds } }, { status: "published" }] },
      columns: { id: true, operator_id: true },
    }),
    updateCellIds.length > 0
      ? db.query.cells.findMany({ where: { id: { in: updateCellIds } }, with: { gsm: true, umts: true, lte: true, nr: true } })
      : Promise.resolve([]),
    allBandIds.length > 0
      ? db.query.bands.findMany({ where: { id: { in: allBandIds } }, columns: { id: true, rat: true, value: true, duplex: true } })
      : Promise.resolve([]),
  ]);

  if (stationResults.length !== stationIds.length)
    throw new ErrorResponse("NOT_FOUND", { message: "Some stations in this batch were not found or are not published" });

  const stationMap = new Map(stationResults.map((station) => [station.id, station]));
  const existingCellsMap = new Map(existingCells.map((c) => [c.id, c]));
  const bandMap = new Map(bandRows.map((b) => [b.id, b]));

  function getExistingRatDetails(existingCell: (typeof existingCells)[number], rat: z.infer<typeof cellSchema>["rat"]) {
    switch (rat) {
      case "GSM":
        return existingCell.gsm;
      case "UMTS":
        return existingCell.umts;
      case "LTE":
        return existingCell.lte;
      case "NR":
        return existingCell.nr;
    }
  }

  function mergeCellDetailsForValidation(cell: z.infer<typeof cellSchema>) {
    if (cell.operation === "add" || cell.target_cell_id === undefined) return cell;
    const existingCell = existingCellsMap.get(cell.target_cell_id);
    if (!existingCell) return cell;
    return {
      ...cell,
      details: {
        ...getExistingRatDetails(existingCell, cell.rat),
        ...(cell.details as RATUpdateDetails | undefined),
      },
    };
  }

  const stationItems = items.map((item) => ({ item, station: stationMap.get(item.station_id)! }));
  const submittedTacByStationId = new Map<number, number>();

  for (const item of items) {
    for (const cell of item.cells) {
      if (cell.rat !== "LTE") continue;
      const details = cell.details as Partial<LTEInsertDetails> | undefined;
      if (details?.tac === null || details?.tac === undefined) continue;
      const currentTac =
        cell.operation === "update" && cell.target_cell_id !== undefined ? existingCellsMap.get(cell.target_cell_id)?.lte?.tac : undefined;
      if (currentTac === details.tac) continue;
      addStationTac(submittedTacByStationId, item.station_id, details.tac);
    }
  }

  if (submittedTacByStationId.size > 0) {
    const stationLteCells = await db.query.cells.findMany({
      where: { AND: [{ station_id: { in: [...submittedTacByStationId.keys()] } }, { rat: "LTE" }] },
      with: { gsm: true, umts: true, lte: true, nr: true },
    });
    for (const cell of stationLteCells) existingCellsMap.set(cell.id, cell);
  }

  await Promise.all(
    stationItems.map(async ({ item, station }) => {
      for (const cell of item.cells) {
        if (cell.operation !== "update" || cell.target_cell_id === undefined) continue;
        const existingCell = existingCellsMap.get(cell.target_cell_id);
        if (!existingCell || existingCell.station_id !== station.id)
          throw new ErrorResponse("NOT_FOUND", { message: `Cell ${cell.target_cell_id} does not exist on station ${station.id}` });
      }

      const validationCells = item.cells.map(mergeCellDetailsForValidation);

      validateCellDuplicates(validationCells);

      validateCellARFCNsAgainstBands(validationCells, bandMap);

      const checks: Promise<void>[] = [];
      const allModifiedCellIds = item.cells
        .filter((cell) => cell.operation === "update" && cell.target_cell_id !== undefined)
        .map((cell) => cell.target_cell_id!);

      if (station.operator_id) {
        const cellEntries = validationCells.map((cell) => ({
          rat: cell.rat,
          details: cell.details! as RATInsertDetails,
          excludeCellId: cell.operation === "update" ? cell.target_cell_id : undefined,
        }));
        checks.push(checkCellDuplicatesBatch(cellEntries, station.operator_id));
      }

      checks.push(
        checkPciDuplicates(
          station.id,
          validationCells.map((cell) => ({
            rat: cell.rat,
            bandId: cell.band_id,
            details: cell.details as Record<string, unknown> | undefined,
            excludeCellId: cell.operation === "update" ? cell.target_cell_id : undefined,
          })),
          allModifiedCellIds,
        ),
      );

      if (checks.length > 0) await Promise.all(checks);
    }),
  );

  async function applyChanges(tx: DbTx, audit: AuditRecorder): Promise<StationChangeRecord[]> {
    const records: StationChangeRecord[] = [];
    const oldSnapshots = await loadCellSnapshots(tx, updateCellIds);
    if (oldSnapshots.size !== updateCellIds.length) throw new ErrorResponse("NOT_FOUND");

    for (const { item, station } of stationItems) {
      const updatedCellIds: number[] = [];
      const addedCellIds: number[] = [];

      for (const cell of item.cells) {
        if (cell.operation === "update" && cell.target_cell_id !== undefined) {
          // oxlint-disable-next-line no-await-in-loop
          await tx
            .update(cells)
            .set({
              band_id: cell.band_id,
              ...(cell.type === undefined ? {} : { type: cell.type }),
              is_confirmed: true,
              updatedAt: new Date(),
            })
            .where(eq(cells.id, cell.target_cell_id));
          // oxlint-disable-next-line no-await-in-loop
          await updateRATCellDetails(tx, cell.rat, cell.target_cell_id, cell.details as RATUpdateDetails);
          updatedCellIds.push(cell.target_cell_id);
        } else if (cell.operation === "add") {
          // oxlint-disable-next-line no-await-in-loop
          const [newCell] = await tx
            .insert(cells)
            .values({ station_id: station.id, band_id: cell.band_id, rat: cell.rat, type: cell.type ?? null, is_confirmed: true })
            .returning();
          if (!newCell) throw new ErrorResponse("FAILED_TO_CREATE");
          // oxlint-disable-next-line no-await-in-loop
          await insertRATCellDetails(tx, cell.rat, newCell.id, cell.details as RATInsertDetails);
          addedCellIds.push(newCell.id);
        }
      }

      const stationTac = submittedTacByStationId.get(station.id);
      if (stationTac !== undefined) {
        // oxlint-disable-next-line no-await-in-loop
        const propagatedRows = await tx
          .select({ cellId: lteCells.cell_id })
          .from(lteCells)
          .innerJoin(cells, eq(cells.id, lteCells.cell_id))
          .where(and(eq(cells.station_id, station.id), eq(cells.rat, "LTE"), sql`${lteCells.tac} IS DISTINCT FROM ${stationTac}`));

        if (propagatedRows.length > 0) {
          const propagatedCellIds = propagatedRows.map((row) => row.cellId);
          const propagatedExistingIds = propagatedCellIds.filter((cellId) => !addedCellIds.includes(cellId));
          // oxlint-disable-next-line no-await-in-loop
          const propagatedSnapshots = await loadCellSnapshots(tx, propagatedExistingIds);
          for (const [cellId, snapshot] of propagatedSnapshots) if (!oldSnapshots.has(cellId)) oldSnapshots.set(cellId, snapshot);
          // oxlint-disable-next-line no-await-in-loop
          await tx.update(lteCells).set({ tac: stationTac, updatedAt: new Date() }).where(inArray(lteCells.cell_id, propagatedCellIds));
          // oxlint-disable-next-line no-await-in-loop
          await tx.update(cells).set({ updatedAt: new Date() }).where(inArray(cells.id, propagatedCellIds));
          updatedCellIds.push(...propagatedCellIds.filter((cellId) => !addedCellIds.includes(cellId) && !updatedCellIds.includes(cellId)));
        }
      }

      // oxlint-disable-next-line no-await-in-loop
      await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, station.id));

      const uniqueUpdatedCellIds = [...new Set(updatedCellIds)];
      records.push({
        station_id: station.id,
        updatedCellIds: uniqueUpdatedCellIds,
        addedCellIds,
        applied: uniqueUpdatedCellIds.length + addedCellIds.length,
      });
    }

    const addedCellIds = [...new Set(records.flatMap((record) => record.addedCellIds))];
    const addedCellIdSet = new Set(addedCellIds);
    const updatedCellIds = [...new Set(records.flatMap((record) => record.updatedCellIds).filter((cellId) => !addedCellIdSet.has(cellId)))];
    const newSnapshots = await loadCellSnapshots(tx, [...updatedCellIds, ...addedCellIds]);
    await audit.logMany([
      ...updatedCellIds.map((cellId) => {
        const oldSnapshot = oldSnapshots.get(cellId);
        const newSnapshot = newSnapshots.get(cellId);
        if (!oldSnapshot || !newSnapshot) throw new ErrorResponse("FAILED_TO_UPDATE");
        return {
          entity: "cells" as const,
          op: "update" as const,
          recordId: cellId,
          stationId: newSnapshot.station_id,
          old: oldSnapshot,
          new: newSnapshot,
          metadata: { source: "analyzer" },
        };
      }),
      ...addedCellIds.map((cellId) => {
        const newSnapshot = newSnapshots.get(cellId);
        if (!newSnapshot) throw new ErrorResponse("FAILED_TO_CREATE");
        return {
          entity: "cells" as const,
          op: "create" as const,
          recordId: cellId,
          stationId: newSnapshot.station_id,
          old: null,
          new: newSnapshot,
          metadata: { source: "analyzer" },
        };
      }),
    ]);

    return records;
  }

  const updateRecords = await runAuditedOperation(
    auditContextFromRequest(req),
    { kind: "analyzer.apply", metadata: { station_ids: stationIds } },
    applyChanges,
  );

  for (const record of updateRecords)
    queueStationCellsChangedNotification({
      stationId: record.station_id,
      counts: { added: record.addedCellIds.length, updated: record.updatedCellIds.length },
    });

  return res.send({ data: updateRecords.map((record) => ({ station_id: record.station_id, applied: record.applied })) });
}

const applyAnalyzerCells: Route<ReqBody, ResponseData> = {
  url: "/analyzer/apply",
  method: "POST",
  config: {
    permissions: ["apply:analyzer"],
  },
  schema: schemaRoute,
  handler,
};

export default applyAnalyzerCells;
