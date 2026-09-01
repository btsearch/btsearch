import { cells, lteCells, stations } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import z from "zod";

import { ErrorResponse } from "../../../../errors.ts";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.ts";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.ts";
import { createAuditLog } from "../../../../services/auditLog.service.ts";
import { checkCellDuplicatesBatch, checkLTEClidConsistency, checkPciDuplicates } from "../../../../services/cellDuplicateCheck.service.ts";
import { queueStationCellsChangedNotification } from "../../../../services/notifications/stationCellChanges.js";
import { validateCellARFCNsAgainstBands } from "../../../../utils/cellARFCNValidation.ts";
import {
  type LTEInsertDetails,
  type LTEUpdateDetails,
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
      details: z.unknown().optional(),
    })
    .superRefine(makeDetailsRatRefine(normalRatInsertSchemaMap)),
  z
    .object({
      operation: z.literal("update"),
      target_cell_id: z.number().optional(),
      band_id: z.number(),
      rat: z.enum(["GSM", "UMTS", "LTE", "NR"]),
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
  old_updatedAt: Date | null;
  new_updatedAt: Date | null | undefined;
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
      columns: { id: true, operator_id: true, updatedAt: true },
    }),
    updateCellIds.length > 0
      ? db.query.cells.findMany({ where: { id: { in: updateCellIds } }, with: { gsm: true, umts: true, lte: true, nr: true } })
      : Promise.resolve([]),
    allBandIds.length > 0
      ? db.query.bands.findMany({ where: { id: { in: allBandIds } }, columns: { id: true, rat: true, value: true, duplex: true } })
      : Promise.resolve([]),
  ]);

  if (!stationResults) throw new ErrorResponse("NOT_FOUND", { message: "None of the stations in this batch were found in the database" });

  const stationMap = new Map(stationResults.map((station) => [station.id, station]));
  const existingCellsMap = new Map(existingCells.map((c) => [c.id, c]));
  const bandMap = new Map(bandRows.map((b) => [b.id, b]));

  const stationItems = items.map((item) => ({ item, station: stationMap.get(item.station_id)! }));
  const submittedTacByStationId = new Map<number, number>();

  for (const item of items) {
    for (const cell of item.cells) {
      if (cell.rat !== "LTE") continue;
      const details = cell.details as Partial<LTEInsertDetails> | undefined;
      if (details?.tac !== null && details?.tac !== undefined) addStationTac(submittedTacByStationId, item.station_id, details.tac);
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

      validateCellDuplicates(item.cells);

      validateCellARFCNsAgainstBands(item.cells, bandMap);

      const checks: Promise<void>[] = [];
      const allModifiedCellIds = item.cells
        .filter((cell) => cell.operation === "update" && cell.target_cell_id !== undefined)
        .map((cell) => cell.target_cell_id!);

      if (station.operator_id) {
        const cellEntries = item.cells.map((cell) => ({
          rat: cell.rat,
          details: cell.details! as RATInsertDetails,
          excludeCellId: cell.operation === "update" ? cell.target_cell_id : undefined,
        }));
        checks.push(checkCellDuplicatesBatch(cellEntries, station.operator_id));
      }

      // checks.push(
      //   checkLTEClidConsistency(
      //     station.id,
      //     item.cells.map((cell) => {
      //       const existingCell =
      //         cell.operation === "update" && cell.target_cell_id !== undefined ? existingCellsMap.get(cell.target_cell_id) : undefined;
      //       const details =
      //         cell.rat === "LTE" && cell.operation === "update"
      //           ? ({ ...existingCell?.lte, ...(cell.details as LTEUpdateDetails | undefined) } as Record<string, unknown>)
      //           : (cell.details as Record<string, unknown> | undefined);
      //       return { rat: cell.rat, details, excludeCellId: cell.operation === "update" ? cell.target_cell_id : undefined };
      //     }),
      //     allModifiedCellIds,
      //   ),
      // );

      checks.push(
        checkPciDuplicates(
          station.id,
          item.cells.map((cell) => {
            const existingCell =
              cell.operation === "update" && cell.target_cell_id !== undefined ? existingCellsMap.get(cell.target_cell_id) : undefined;
            const details =
              cell.rat === "LTE" && cell.operation === "update"
                ? ({ ...existingCell?.lte, ...(cell.details as LTEUpdateDetails | undefined) } as Record<string, unknown>)
                : (cell.details as Record<string, unknown> | undefined);
            return {
              rat: cell.rat,
              bandId: cell.band_id,
              details,
              excludeCellId: cell.operation === "update" ? cell.target_cell_id : undefined,
            };
          }),
          allModifiedCellIds,
        ),
      );

      if (checks.length > 0) await Promise.all(checks);
    }),
  );

  const updateRecords = await db.transaction(async (tx) => {
    const records: StationChangeRecord[] = [];

    for (const { item, station } of stationItems) {
      const updatedCellIds: number[] = [];
      const addedCellIds: number[] = [];

      for (const cell of item.cells) {
        if (cell.operation === "update" && cell.target_cell_id !== undefined) {
          // oxlint-disable-next-line no-await-in-loop
          await tx.update(cells).set({ band_id: cell.band_id, is_confirmed: true, updatedAt: new Date() }).where(eq(cells.id, cell.target_cell_id));
          // oxlint-disable-next-line no-await-in-loop
          await updateRATCellDetails(tx, cell.rat, cell.target_cell_id, cell.details as RATUpdateDetails);
          updatedCellIds.push(cell.target_cell_id);
        } else if (cell.operation === "add") {
          // oxlint-disable-next-line no-await-in-loop
          const [newCell] = await tx
            .insert(cells)
            .values({ station_id: station.id, band_id: cell.band_id, rat: cell.rat, is_confirmed: true })
            .returning();
          if (newCell) {
            // oxlint-disable-next-line no-await-in-loop
            await insertRATCellDetails(tx, cell.rat, newCell.id, cell.details as RATInsertDetails);
            addedCellIds.push(newCell.id);
          }
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
          // oxlint-disable-next-line no-await-in-loop
          await tx.update(lteCells).set({ tac: stationTac, updatedAt: new Date() }).where(inArray(lteCells.cell_id, propagatedCellIds));
          // oxlint-disable-next-line no-await-in-loop
          await tx.update(cells).set({ updatedAt: new Date() }).where(inArray(cells.id, propagatedCellIds));
          updatedCellIds.push(...propagatedCellIds.filter((cellId) => !addedCellIds.includes(cellId) && !updatedCellIds.includes(cellId)));
        }
      }

      // oxlint-disable-next-line no-await-in-loop
      const [updatedStation] = await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.id, station.id)).returning();

      records.push({
        station_id: station.id,
        old_updatedAt: station.updatedAt,
        new_updatedAt: updatedStation?.updatedAt,
        updatedCellIds,
        addedCellIds,
        applied: updatedCellIds.length + addedCellIds.length,
      });
    }

    return records;
  });

  const touchedCellIds = [...new Set(updateRecords.flatMap((record) => [...record.updatedCellIds, ...record.addedCellIds]))];
  const newCellStates =
    touchedCellIds.length > 0
      ? await db.query.cells.findMany({
          where: { id: { in: touchedCellIds } },
          with: { gsm: true, umts: true, lte: true, nr: true },
        })
      : [];

  const newCellStatesMap = new Map(newCellStates.map((c) => [c.id, c]));
  function flattenCellDetails(cell: (typeof newCellStates)[0]) {
    const { gsm, umts, lte, nr, ...base } = cell;
    return { ...base, details: gsm ?? umts ?? lte ?? nr ?? null };
  }

  await Promise.all(
    updateRecords.map(async (record) => {
      const cellsUpdated = record.updatedCellIds.map((id) => ({
        old: flattenCellDetails(existingCellsMap.get(id)!),
        new: flattenCellDetails(newCellStatesMap.get(id)!),
      }));
      await createAuditLog(
        {
          action: "cells.update",
          table_name: "cells",
          record_id: null,
          old_values: { cells: cellsUpdated.map((c) => c.old) },
          new_values: { cells: cellsUpdated.map((c) => c.new) },
          metadata: { station_id: record.station_id, source: "analyzer" },
        },
        req,
      );

      if (record.addedCellIds.length > 0) {
        const cellsCreated = record.addedCellIds.map((id) => flattenCellDetails(newCellStatesMap.get(id)!));
        await createAuditLog(
          {
            action: "cells.create",
            table_name: "cells",
            record_id: null,
            old_values: null,
            new_values: { cells: cellsCreated },
            metadata: { station_id: record.station_id, source: "analyzer" },
          },
          req,
        );
      }

      await createAuditLog(
        {
          action: "stations.update",
          table_name: "stations",
          record_id: record.station_id,
          old_values: { updatedAt: record.old_updatedAt },
          new_values: { updatedAt: record.new_updatedAt },
          metadata: { reason: "analyzer" },
        },
        req,
      );
    }),
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
  config: { permissions: ["create:cells", "update:cells", "write:stations"] },
  schema: schemaRoute,
  handler,
};

export default applyAnalyzerCells;
