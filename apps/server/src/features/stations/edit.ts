import { operators, stations } from "@openbts/drizzle";
import type { AuditOperationKind } from "@openbts/shared/audit";
import type { StationCreate, StationUpdate } from "@openbts/shared/contract";
import { EXTRA_IDENTIFICATORS_MNCS, MNO_NAME_ONLY_MNCS } from "@openbts/shared/operatorUtils";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import type { PermissionObject } from "../../plugins/auth/permissions.js";
import { type OperatorChange, type ScopeRefs, findLocationIdsAt, locationRefs } from "../access/scope.js";
import { hasStaffPermission } from "../access/staff.js";
import { auditContextFromRequest, runAuditedOperation } from "../audit/index.js";
import { checkCellDuplicate, checkPciDuplicate, getOperatorIdForStation } from "../cells/duplicateCheck.js";
import type { PciDuplicateDetails } from "../cells/pciDuplicateSpecs.js";
import { type AppliedChange, applyDirectChange, finishDirectChange, getDestinationStationIds } from "../submissions/actions.js";
import { loadCurrentLocations } from "../submissions/contributions.js";
import { type SubmissionChange, hasMeaningfulChanges, validateChange } from "../submissions/create.js";
import { type BodyPath, type StationEdit, toDirectChange } from "../submissions/translate.js";
import { findVisibleStation } from "./read.js";
import { stationStatusUpdate } from "./status.js";

function getEditPermissions({ action, station, location, sectors, cells = [] }: StationEdit): PermissionObject {
  const cellActions = unique(cells.map((cell) => cell.action));
  if (cellActions.length === 0) return { stations: [action] };

  const changesStation = action !== "update" || [station, location, sectors].some((part) => part !== undefined);
  return changesStation ? { stations: [action], cells: cellActions } : { cells: cellActions };
}

async function assertMovedCellsFit(change: SubmissionChange): Promise<void> {
  const cells = change.cells ?? [];
  const movedIds = unique(cells.map((cell) => (cell.destination_station_id === undefined ? undefined : cell.target_cell_id)));
  const changedIds = unique(cells.map((cell) => cell.target_cell_id));
  await Promise.all(
    cells.map(async (cell) => {
      const { target_cell_id: cellId, destination_station_id: destinationId } = cell;
      if (typeof cellId !== "number" || destinationId === undefined) return;

      const details = cell.details as PciDuplicateDetails | undefined;
      await checkPciDuplicate(destinationId, { rat: cell.rat, bandId: cell.band_id, details, excludeCellId: cellId }, movedIds);

      const operatorId = await getOperatorIdForStation(destinationId);
      if (operatorId !== null) await checkCellDuplicate({ rat: cell.rat, details, excludeCellId: cellId }, operatorId, changedIds);
    }),
  );
}

async function currentOperatorId(stationId: number | null | undefined): Promise<number | null> {
  if (stationId === null || stationId === undefined) return null;

  const [row] = await db.select({ operatorId: stations.operator_id }).from(stations).where(eq(stations.id, stationId)).limit(1);
  return row?.operatorId ?? null;
}

async function assertIdentifiersFitOperator({ station, station_id: stationId }: SubmissionChange): Promise<void> {
  const setsNetworks = typeof station?.networks_id === "number" || typeof station?.networks_name === "string";
  if (!setsNetworks && typeof station?.mno_name !== "string") return;

  const operatorId = station?.operator_id ?? (await currentOperatorId(stationId));
  if (operatorId === null) return;

  const [operator] = await db.select({ mnc: operators.mnc }).from(operators).where(eq(operators.id, operatorId)).limit(1);
  const mnc = operator?.mnc;
  if (mnc === null || mnc === undefined) return;
  if (MNO_NAME_ONLY_MNCS.includes(mnc)) {
    if (setsNetworks) throw new ErrorResponse("BAD_REQUEST", { message: "This operator's stations take only the operatorName identifier" });
    return;
  }
  if (!EXTRA_IDENTIFICATORS_MNCS.includes(mnc)) throw new ErrorResponse("BAD_REQUEST", { message: "This operator's stations take no identifiers" });
}

export async function prepareStationChange(req: FastifyRequest, edit: StationEdit, bodyPath?: BodyPath): Promise<SubmissionChange> {
  const change = await toDirectChange(edit, bodyPath);
  if (!hasMeaningfulChanges(change)) throw new ErrorResponse("BAD_REQUEST", { message: "No changes detected" });
  await Promise.all(getDestinationStationIds(change).map((stationId) => findVisibleStation(req, stationId)));
  await Promise.all([validateChange(change, "direct"), assertMovedCellsFit(change), assertIdentifiersFitOperator(change)]);
  return change;
}

export async function applyStationChange(
  req: FastifyRequest,
  edit: StationEdit,
  kind: AuditOperationKind,
  bodyPath?: BodyPath,
): Promise<AppliedChange> {
  if (!(await hasStaffPermission(req, getEditPermissions(edit)))) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  const change = await prepareStationChange(req, edit, bodyPath);
  const applied = await runAuditedOperation(auditContextFromRequest(req), { kind }, (_tx, audit) => applyDirectChange(audit, change));
  await finishDirectChange(change.type ?? "new", applied);
  return applied;
}

export async function deactivateStation(req: FastifyRequest, stationId: number): Promise<void> {
  await runAuditedOperation(auditContextFromRequest(req), { kind: "station.delete" }, async (tx, audit) => {
    const [current] = await tx.select().from(stations).where(eq(stations.id, stationId)).for("update").limit(1);
    if (!current || current.status === "inactive") return;

    const [updated] = await tx.update(stations).set(stationStatusUpdate("inactive")).where(eq(stations.id, stationId)).returning();
    if (!updated) throw new ErrorResponse("FAILED_TO_UPDATE");
    await audit.log({ entity: "stations", op: "delete", recordId: stationId, stationId, old: current, new: updated });
  });
}

export async function stationCreateScope({ station, location }: StationCreate): Promise<ScopeRefs> {
  if (!location) return { placements: [{ locationId: null, operatorId: station.operatorId }] };

  const placed = locationRefs({ region_id: location.regionId, longitude: location.longitude, latitude: location.latitude });
  return { ...placed, locationIds: await findLocationIdsAt(placed.points ?? []) };
}

function toOperatorChanges(stationId: number, { station, location }: StationUpdate): OperatorChange[] {
  const operatorId = station?.operatorId;
  if (location === null) return [{ stationId, operatorId, location: "removed" }];
  return location === undefined && operatorId !== undefined ? [{ stationId, operatorId, location: "kept" }] : [];
}

export async function stationUpdateScope(stationId: number, body: StationUpdate): Promise<ScopeRefs> {
  const { location } = body;
  const current = location ? (await loadCurrentLocations([stationId])).get(stationId) : null;
  const placed = location ? locationRefs({ region_id: location.regionId, longitude: location.longitude, latitude: location.latitude }, current) : {};
  const movedTo = (body.cells ?? []).flatMap((cell) => (cell.action === "update" && cell.stationId !== undefined ? [cell.stationId] : []));

  return {
    ...placed,
    stationIds: [stationId, ...movedTo],
    locationIds: await findLocationIdsAt(placed.points ?? []),
    detachedStationIds: location === null ? [stationId] : [],
    operatorChanges: toOperatorChanges(stationId, body),
  };
}
