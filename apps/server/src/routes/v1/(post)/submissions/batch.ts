import { cells, lteCells, stations } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse, ValidationError } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, loadSubmissionDraftSnapshot, runAuditedOperation } from "../../../../services/audit/index.js";
import { notifyStaffNewSubmission } from "../../../../services/notifications/service.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";
import {
  type SingleSubmission,
  type SubmissionWithExtras,
  processSubmission,
  proposedCellInsert,
  proposedCellInsertBase,
  proposedLocationInsert,
  proposedStationInsert,
  singleSubmissionSchema,
  submissionsSelectSchema,
  validateSubmission,
} from "../../../../services/submissions/create.js";
import { logger } from "../../../../utils/logger.js";

const ITEMS_CAP = 25;
const ANALYZER_SYSTEM_NOTE = "System: Zgłoszono przez analizator. Mogą być błędy";

const batchProposedCellInsert = proposedCellInsertBase.extend({ details: z.record(z.string(), z.unknown()).optional() }).superRefine((cell, ctx) => {
  const operation = cell.operation ?? "add";
  if (operation === "delete") return;
  if (cell.rat === null || cell.rat === undefined) ctx.addIssue({ code: "custom", message: "RAT is required for cell changes", path: ["rat"] });
  if (operation !== "add") return;
  if (cell.band_id === null || cell.band_id === undefined)
    ctx.addIssue({ code: "custom", message: "band_id is required for added cells", path: ["band_id"] });
  if (cell.details === undefined) ctx.addIssue({ code: "custom", message: "Details are required for added cells", path: ["details"] });
});
const batchSingleSubmissionSchema = singleSubmissionSchema.safeExtend({
  cells: z.array(batchProposedCellInsert).optional(),
});
const requestSchema = z.object({
  submitter_note: z.string().max(2000).optional(),
  items: z.array(batchSingleSubmissionSchema).min(1).max(ITEMS_CAP),
});

type ReqBody = { Body: z.infer<typeof requestSchema> };
const schemaRoute = {
  body: requestSchema,
  response: {
    200: z.object({
      data: z.array(
        submissionsSelectSchema.extend({
          proposedStation: proposedStationInsert.optional(),
          proposedLocation: proposedLocationInsert.optional(),
          cells: z.array(proposedCellInsert).optional(),
        }),
      ),
    }),
  },
};

type ResponseData = z.infer<typeof submissionsSelectSchema>[];
type BatchSubmission = z.infer<typeof batchSingleSubmissionSchema>;
type BatchCell = z.infer<typeof batchProposedCellInsert>;

function requireTargetCellId(cell: BatchCell): number {
  if (cell.target_cell_id === null || cell.target_cell_id === undefined)
    throw new ErrorResponse("BAD_REQUEST", { message: "target_cell_id is required for cell updates" });
  return cell.target_cell_id;
}

function addStationTac(stationTacs: Map<number, number>, stationId: number, tac: number): void {
  const existingTac = stationTacs.get(stationId);
  if (existingTac !== undefined && existingTac !== tac)
    throw new ErrorResponse("BAD_REQUEST", { message: `Multiple TAC values submitted for station ${stationId}` });
  stationTacs.set(stationId, tac);
}

async function expandLteTacUpdates(inputs: BatchSubmission[]): Promise<BatchSubmission[]> {
  const stationIdsWithSubmittedTac = new Set<number>();

  for (const input of inputs) {
    if (!input.station_id) continue;
    for (const cell of input.cells ?? []) {
      if (cell.operation === "delete" || cell.rat !== "LTE") continue;
      if (typeof cell.details?.tac === "number") stationIdsWithSubmittedTac.add(input.station_id);
    }
  }

  if (stationIdsWithSubmittedTac.size === 0) return inputs;

  const stationCells = await db
    .select({
      stationId: cells.station_id,
      cellId: cells.id,
      bandId: cells.band_id,
      type: cells.type,
      enbid: lteCells.enbid,
      clid: lteCells.clid,
      tac: lteCells.tac,
      pci: lteCells.pci,
      earfcn: lteCells.earfcn,
      supports_iot: lteCells.supports_iot,
    })
    .from(cells)
    .innerJoin(lteCells, eq(lteCells.cell_id, cells.id))
    .where(inArray(cells.station_id, [...stationIdsWithSubmittedTac]));

  const lteCellsByStationId = new Map<number, typeof stationCells>();
  const lteCellsById = new Map<number, (typeof stationCells)[number]>();
  for (const cell of stationCells) {
    const cellsForStation = lteCellsByStationId.get(cell.stationId) ?? [];
    cellsForStation.push(cell);
    lteCellsByStationId.set(cell.stationId, cellsForStation);
    lteCellsById.set(cell.cellId, cell);
  }

  const tacByStationId = new Map<number, number>();
  for (const input of inputs) {
    if (!input.station_id) continue;
    for (const cell of input.cells ?? []) {
      if (cell.operation === "delete" || cell.rat !== "LTE") continue;
      const tac = cell.details?.tac;
      if (typeof tac !== "number") continue;
      const currentCell =
        cell.operation === "update" && cell.target_cell_id !== null && cell.target_cell_id !== undefined
          ? lteCellsById.get(cell.target_cell_id)
          : undefined;
      if (currentCell?.stationId === input.station_id && currentCell.tac === tac) continue;
      addStationTac(tacByStationId, input.station_id, tac);
    }
  }

  if (tacByStationId.size === 0) return inputs;

  return inputs.map((input) => {
    if (!input.station_id) return input;
    const tac = tacByStationId.get(input.station_id);
    if (tac === undefined) return input;

    const inputCells = (input.cells ?? []).map((cell) => {
      if (cell.operation === "delete" || cell.rat !== "LTE") return cell;
      return { ...cell, details: { ...cell.details, tac } };
    });
    const existingCellIds = new Set(inputCells.map((cell) => cell.target_cell_id).filter((id): id is number => id !== null && id !== undefined));
    const expandedCells = [...inputCells];

    for (const cell of lteCellsByStationId.get(input.station_id) ?? []) {
      if (cell.tac === tac || existingCellIds.has(cell.cellId)) continue;
      expandedCells.push({
        operation: "update",
        target_cell_id: cell.cellId,
        station_id: input.station_id,
        band_id: cell.bandId,
        rat: "LTE",
        type: cell.type,
        details: {
          enbid: cell.enbid,
          clid: cell.clid,
          tac,
          pci: cell.pci,
          earfcn: cell.earfcn,
          supports_iot: cell.supports_iot,
        },
      });
    }

    return { ...input, cells: expandedCells };
  });
}

async function hydrateCellUpdates(inputs: BatchSubmission[]): Promise<BatchSubmission[]> {
  const updateCellIds: number[] = [];
  for (const input of inputs) {
    for (const cell of input.cells ?? []) {
      if (cell.operation !== "update") continue;
      updateCellIds.push(requireTargetCellId(cell));
    }
  }

  if (updateCellIds.length === 0) return inputs;

  const existingCells = await db.query.cells.findMany({
    where: { id: { in: [...new Set(updateCellIds)] } },
    with: { gsm: true, umts: true, lte: true, nr: true },
  });
  const existingCellsById = new Map(existingCells.map((cell) => [cell.id, cell]));

  function getCurrentDetails(existingCell: (typeof existingCells)[number]): Record<string, unknown> | undefined {
    switch (existingCell.rat) {
      case "GSM":
        return existingCell.gsm
          ? {
              lac: existingCell.gsm.lac,
              cid: existingCell.gsm.cid,
              e_gsm: existingCell.gsm.e_gsm,
            }
          : undefined;
      case "UMTS":
        return existingCell.umts
          ? {
              lac: existingCell.umts.lac,
              rnc: existingCell.umts.rnc,
              cid: existingCell.umts.cid,
              arfcn: existingCell.umts.arfcn,
            }
          : undefined;
      case "LTE":
        return existingCell.lte
          ? {
              tac: existingCell.lte.tac,
              enbid: existingCell.lte.enbid,
              clid: existingCell.lte.clid,
              pci: existingCell.lte.pci,
              earfcn: existingCell.lte.earfcn,
              supports_iot: existingCell.lte.supports_iot,
            }
          : undefined;
      case "NR":
        return existingCell.nr
          ? {
              nrtac: existingCell.nr.nrtac,
              gnbid: existingCell.nr.gnbid,
              clid: existingCell.nr.clid,
              pci: existingCell.nr.pci,
              arfcn: existingCell.nr.arfcn,
              type: existingCell.nr.type,
              supports_nr_redcap: existingCell.nr.supports_nr_redcap,
            }
          : undefined;
    }
  }

  return inputs.map((input) => ({
    ...input,
    cells: input.cells?.map((cell) => {
      if (cell.operation !== "update") return cell;
      const targetCellId = requireTargetCellId(cell);
      if (input.station_id === null || input.station_id === undefined)
        throw new ErrorResponse("BAD_REQUEST", { message: "station_id is required for cell updates" });

      const existingCell = existingCellsById.get(targetCellId);
      if (!existingCell || existingCell.station_id !== input.station_id)
        throw new ErrorResponse("NOT_FOUND", { message: `Cell ${targetCellId} does not exist on station ${input.station_id}` });
      if (cell.rat !== null && cell.rat !== undefined && cell.rat !== existingCell.rat)
        throw new ErrorResponse("BAD_REQUEST", { message: `Cell ${targetCellId} is ${existingCell.rat}, not ${cell.rat}` });

      const currentDetails = getCurrentDetails(existingCell);
      if (!currentDetails) throw new ErrorResponse("NOT_FOUND", { message: `Cell ${targetCellId} has no ${existingCell.rat} details` });

      return {
        ...cell,
        station_id: input.station_id,
        band_id: cell.band_id ?? existingCell.band_id,
        rat: existingCell.rat,
        type: cell.type === undefined ? existingCell.type : cell.type,
        details: { ...currentDetails, ...cell.details },
      };
    }),
  }));
}

function parseCompleteSubmissions(inputs: BatchSubmission[]): SingleSubmission[] {
  const parsed = z.array(singleSubmissionSchema).safeParse(inputs);
  if (parsed.success) return parsed.data;
  throw new ValidationError(
    parsed.error.issues.map((issue) => ({
      field: ["items", ...issue.path].map(String).join("/"),
      validationMessage: issue.message,
    })),
  );
}

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FORBIDDEN");
  const userSession = req.userSession;
  if (!userSession?.user?.id) throw new ErrorResponse("UNAUTHORIZED");
  const userId = userSession.user.id;

  const { submitter_note, items } = req.body;
  const effective_note = submitter_note
    ? `${submitter_note}
${ANALYZER_SYSTEM_NOTE}`
    : ANALYZER_SYSTEM_NOTE;

  const stationsWithTooFewCells = items.filter((item) => (item.cells?.length ?? 0) < 1);
  if (stationsWithTooFewCells.length > 0) {
    throw new ErrorResponse("BAD_REQUEST", { message: "Each station must have at least 1 cell changes in a batch submission" });
  }

  const submissionInputs: BatchSubmission[] = items.map((item) => ({
    ...item,
    submitter_note: item.submitter_note ?? effective_note,
  }));

  const expandedSubmissionInputs = await expandLteTacUpdates(submissionInputs);
  const hydratedSubmissionInputs = await hydrateCellUpdates(expandedSubmissionInputs);
  const completeSubmissionInputs = parseCompleteSubmissions(hydratedSubmissionInputs);
  await Promise.all(completeSubmissionInputs.map(validateSubmission));

  try {
    const results = await runAuditedOperation(auditContextFromRequest(req), { kind: "submission.create" }, async (tx, audit) => {
      const created: SubmissionWithExtras[] = [];
      for (const input of completeSubmissionInputs) {
        // eslint-disable-next-line no-await-in-loop
        created.push(await processSubmission(tx, input, userId));
      }
      await audit.logMany(
        await Promise.all(
          created.map(async (submission) => {
            const snapshot = await loadSubmissionDraftSnapshot(tx, submission.id);
            if (!snapshot) throw new ErrorResponse("FAILED_TO_CREATE");
            return {
              entity: "submissions" as const,
              op: "create" as const,
              recordId: submission.id,
              stationId: submission.station_id,
              new: snapshot,
            };
          }),
        ),
      );
      return created;
    });

    const submitterName = userSession.user.name || userSession.user.username || "Unknown";
    const stationIdsToResolve = results.filter((s) => !s.proposedStation?.station_id && s.station_id).map((s) => s.station_id!);
    const uniqueStationIds = Array.from(new Set(stationIdsToResolve));
    const resolvedStations =
      uniqueStationIds.length > 0
        ? await db.select({ id: stations.id, station_id: stations.station_id }).from(stations).where(inArray(stations.id, uniqueStationIds))
        : [];
    const stationIdMap = new Map(resolvedStations.map((s) => [s.id, s.station_id]));

    for (const submission of results) {
      if (
        submission.pending_photos &&
        !submission.proposedStation &&
        !submission.proposedLocation &&
        (!submission.cells || submission.cells.length === 0) &&
        !submission.submitter_note
      )
        continue;

      const stationStringId = submission.proposedStation?.station_id ?? (submission.station_id ? stationIdMap.get(submission.station_id) : undefined);

      void notifyStaffNewSubmission({
        submissionId: submission.id,
        submitterName,
        submissionType: submission.type ?? "new",
        stationId: stationStringId ?? undefined,
      }).catch((e) => logger.error("Failed to notify staff about new submission", { error: e }));
    }

    return res.send({ data: results });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: error instanceof Error ? error.message : "Unknown error", cause: error });
  }
}

const createSubmissionBatch: Route<ReqBody, ResponseData> = {
  url: "/submissions/batch",
  method: "POST",
  config: { permissions: ["create:submissions"] },
  schema: schemaRoute,
  handler,
};

export default createSubmissionBatch;
