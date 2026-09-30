import { useMutation, useQueryClient } from "@tanstack/react-query";

import { patchLocation } from "../locations/api";
import {
  createCells,
  createLocation,
  createStation,
  deleteCell,
  deleteStation,
  patchCells,
  patchStation,
  putStationSectors,
  updateExtraIds,
  updateUplink,
} from "./api";
import { type StationUpdateImpact, invalidateStationUpdateQueries } from "./queries";
import type { CellDraftBase } from "@/features/admin/cells/cellEditRow";
import { pickCellDetails } from "@/features/submissions/api";
import { orderSectorsById, remapSectorAssignment } from "@/features/submissions/utils/cells";
import { type AuditOperationHandle, createAuditOperationHandle } from "@/lib/api";
import { shallowEqual } from "@/lib/shallowEqual";
import type { Cell, Sector, SectorDraft, Station, StationStatus, UplinkType } from "@/types/station";

export type LocalCell = CellDraftBase & {
  _serverId?: number;
  _sectorLocalId?: string | null;
};

type PersistedLocalCell = LocalCell & { _serverId: number };

function hasServerId(cell: LocalCell): cell is PersistedLocalCell {
  return Boolean(cell._serverId);
}

export function useDeleteStationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stationId: number) => deleteStation(stationId),
    onSuccess: (_result, stationId) => {
      invalidateStationUpdateQueries(
        queryClient,
        {
          stationId,
          oldLocationId: null,
          newLocationId: null,
          stationMetadataChanged: true,
          locationMetadataChanged: false,
          locationMoved: false,
          cellsChanged: false,
          cellCountChanged: false,
          sectorsChanged: false,
          extraIdsChanged: false,
          uplinkChanged: false,
        },
        { conservative: true },
      );
    },
  });
}

function sectorLocalIdToOriginalId(localId: string | null | undefined): number | null {
  if (!localId?.startsWith("sector-")) return null;
  const id = Number.parseInt(localId.slice("sector-".length), 10);
  return Number.isNaN(id) ? null : id;
}

function resolveSectorId(localId: string | null | undefined, sectorIdByLocalId?: ReadonlyMap<string, number>): number | null {
  if (!localId) return null;
  return sectorIdByLocalId?.get(localId) ?? sectorLocalIdToOriginalId(localId);
}

export function sectorsChanged(drafts: SectorDraft[], original: Sector[] | undefined): boolean {
  const originalSectors = original ?? [];
  if (drafts.length !== originalSectors.length) return true;
  return drafts.some((draft, index) => draft.azimuth !== originalSectors[index]?.azimuth);
}

function toSectorPayload(drafts: SectorDraft[]): { id?: number; azimuth: number }[] {
  return drafts.flatMap((sector) => {
    if (typeof sector.azimuth !== "number") return [];
    return [sector.id === undefined ? { azimuth: sector.azimuth } : { id: sector.id, azimuth: sector.azimuth }];
  });
}

function makeSectorIdMap(drafts: SectorDraft[], persisted?: Sector[]): Map<string, number> {
  const map = new Map<string, number>();
  drafts.forEach((draft, index) => {
    const id = persisted?.[index]?.id ?? draft.id ?? sectorLocalIdToOriginalId(draft._localId);
    if (id !== null) map.set(draft._localId, id);
  });
  return map;
}

export function isCellModified(lc: LocalCell, originalCells: Cell[], sectorIdByLocalId?: ReadonlyMap<string, number>): boolean {
  if (!lc._serverId) return false;
  const orig = originalCells.find((c) => c.id === lc._serverId);
  if (!orig) return false;
  const sectorId = resolveSectorId(lc._sectorLocalId, sectorIdByLocalId);
  return (
    lc.band_id !== orig.band.id ||
    sectorId !== (orig.sector_id ?? null) ||
    (lc.type ?? null) !== (orig.type ?? null) ||
    lc.notes !== (orig.notes ?? "") ||
    lc.is_confirmed !== orig.is_confirmed ||
    !shallowEqual(lc.details, orig.details ?? {})
  );
}

type LocationFields = {
  region_id: number | null;
  city?: string;
  address?: string;
  longitude: number | null;
  latitude: number | null;
};

type LocationDetails = Pick<LocationFields, "region_id" | "city" | "address">;

type CompleteLocation = LocationFields & { region_id: number; longitude: number; latitude: number };

export type ExistingLocation = LocationFields & { id: number };

function isCompleteLocation(location: LocationFields): location is CompleteLocation {
  return location.region_id !== null && location.longitude !== null && location.latitude !== null;
}

async function createLocationFromFields(location: CompleteLocation, auditOperation: AuditOperationHandle): Promise<number> {
  const { data } = await createLocation(
    {
      region_id: location.region_id,
      city: location.city || undefined,
      address: location.address || undefined,
      longitude: location.longitude,
      latitude: location.latitude,
    },
    auditOperation,
  );
  return data.id;
}

async function patchLocationDetails(
  locationId: number,
  next: LocationDetails,
  current: LocationDetails,
  auditOperation: AuditOperationHandle,
): Promise<boolean> {
  const locationPatch: Record<string, unknown> = {};
  if ((next.city ?? "") !== (current.city ?? "")) locationPatch.city = next.city || null;
  if ((next.address ?? "") !== (current.address ?? "")) locationPatch.address = next.address || null;
  if (next.region_id !== current.region_id) locationPatch.region_id = next.region_id;
  if (Object.keys(locationPatch).length === 0) return false;
  await patchLocation(locationId, locationPatch, auditOperation);
  return true;
}

export interface SaveStationPayload {
  isCreateMode: boolean;
  stationId: string;
  operatorId: number | null;
  notes: string;
  extraAddress: string;
  isConfirmed: boolean;
  location: LocationFields;
  existingLocation: ExistingLocation | null;
  localCells: LocalCell[];
  sectors: SectorDraft[];
  deletedServerCellIds: number[];
  originalStation?: Station;
  networksId?: number;
  networksName?: string;
  mnoName?: string;
  skipExtraIds?: boolean;
  stationStatus?: StationStatus;
  uplinkType?: UplinkType | null;
  uplinkSpeed?: number | null;
  uplinkModel?: string;
}

function hasExtraIdValues(payload: SaveStationPayload): boolean {
  return payload.networksId !== undefined || !!payload.networksName || !!payload.mnoName;
}

function toExtraIdsPayload(payload: SaveStationPayload): { networks_id: number | null; networks_name: string | null; mno_name: string | null } {
  return {
    networks_id: payload.networksId ?? null,
    networks_name: payload.networksName || null,
    mno_name: payload.mnoName || null,
  };
}

function toUplinkPayload(payload: SaveStationPayload): { type: UplinkType | null; speed: number | null; model: string | null } {
  return {
    type: payload.uplinkType ?? null,
    speed: payload.uplinkSpeed ?? null,
    model: payload.uplinkModel || null,
  };
}

const partiallyCreatedStationIds = new WeakMap<SaveStationPayload, number>();

export function useSaveStationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SaveStationPayload) => {
      const auditOperation = createAuditOperationHandle(payload.isCreateMode ? "station.create" : "station.edit");
      const { existingLocation } = payload;
      const { sectors, localIdMap } = orderSectorsById(payload.sectors);
      const localCells: LocalCell[] = payload.localCells.map((cell) => ({
        ...cell,
        _sectorLocalId: remapSectorAssignment(cell._sectorLocalId, localIdMap),
      }));

      if (payload.isCreateMode) {
        if (!isCompleteLocation(payload.location)) throw new Error("Location required");

        const locationId = existingLocation !== null ? existingLocation.id : await createLocationFromFields(payload.location, auditOperation);

        const cellsPayload = localCells.map((lc) => ({
          station_id: 0,
          band_id: lc.band_id,
          rat: lc.rat,
          type: lc.type ?? null,
          is_confirmed: lc.is_confirmed,
          notes: lc.notes || null,
          details: pickCellDetails(lc.rat, lc.details),
        }));

        const { data: createdStation } = await createStation(
          {
            station_id: payload.stationId,
            operator_id: payload.operatorId,
            location_id: locationId,
            notes: payload.notes || null,
            extra_address: payload.extraAddress || null,
            is_confirmed: payload.isConfirmed,
            cells: cellsPayload,
          },
          auditOperation,
        );
        partiallyCreatedStationIds.set(payload, createdStation.id);
        const locationMetadataChanged =
          existingLocation !== null && (await patchLocationDetails(existingLocation.id, payload.location, existingLocation, auditOperation));

        let sectorIdByLocalId = new Map<string, number>();
        if (sectors.length > 0) {
          const savedSectors = await putStationSectors(createdStation.id, toSectorPayload(sectors), auditOperation);
          sectorIdByLocalId = makeSectorIdMap(sectors, savedSectors.data);
        }

        const cellSectorPatches = localCells.flatMap((lc, index) => {
          const createdCell = createdStation.cells[index];
          const sectorId = resolveSectorId(lc._sectorLocalId, sectorIdByLocalId);
          if (!createdCell || sectorId === null) return [];
          return [{ cell_id: createdCell.id, sector_id: sectorId }];
        });
        if (cellSectorPatches.length > 0) await patchCells(createdStation.id, cellSectorPatches, auditOperation);

        if (!payload.skipExtraIds && hasExtraIdValues(payload)) await updateExtraIds(createdStation.id, toExtraIdsPayload(payload), auditOperation);

        if (payload.uplinkType) await updateUplink(createdStation.id, toUplinkPayload(payload), auditOperation);

        return { mode: "create" as const, station: createdStation, locationMetadataChanged };
      }

      if (!payload.originalStation) throw new Error("Original station required for update");

      const station = payload.originalStation;
      const originalCells = station.cells;
      const oldLocationId = station.location?.id ?? null;
      let locationMetadataChanged = false;
      let sectorIdByLocalId = makeSectorIdMap(sectors);
      const sectorPayload = toSectorPayload(sectors);
      const haveSectorsChanged = sectorsChanged(sectors, station.sectors);
      const retainedSectorIds = new Set(sectorPayload.flatMap((sector) => (sector.id !== undefined ? [sector.id] : [])));
      const removedSectorIds = new Set((station.sectors ?? []).flatMap((sector) => (retainedSectorIds.has(sector.id) ? [] : [sector.id])));
      const deletedServerCellIdSet = new Set(payload.deletedServerCellIds);

      const stationPatch: Record<string, unknown> = {
        station_id: payload.stationId,
        operator_id: payload.operatorId,
        notes: payload.notes || null,
        extra_address: payload.extraAddress || null,
        is_confirmed: payload.isConfirmed,
        ...(payload.stationStatus !== undefined && { status: payload.stationStatus }),
      };

      if (existingLocation !== null && existingLocation.id !== (station.location?.id ?? null)) {
        stationPatch.location_id = existingLocation.id;
        locationMetadataChanged = await patchLocationDetails(existingLocation.id, payload.location, existingLocation, auditOperation);
      } else if (station.location) {
        const coordsChanged =
          payload.location.latitude !== (station.location.latitude ?? null) || payload.location.longitude !== (station.location.longitude ?? null);
        if (coordsChanged && isCompleteLocation(payload.location)) {
          stationPatch.location_id = await createLocationFromFields(payload.location, auditOperation);
        } else if (!coordsChanged) {
          const currentLocation = { ...station.location, region_id: station.location.region?.id ?? null };
          locationMetadataChanged = await patchLocationDetails(station.location.id, payload.location, currentLocation, auditOperation);
        }
      } else if (isCompleteLocation(payload.location)) {
        stationPatch.location_id = await createLocationFromFields(payload.location, auditOperation);
      }

      const newCells = localCells.filter((lc) => !lc._serverId);
      const persistedCells = localCells.filter(hasServerId);
      const createdNewCellsByLocalId = new Map<string, Cell>();
      const initialNewCellSectorIds = new Map<string, number | null>();
      if (newCells.length > 0) {
        const createdCells = await createCells(
          station.id,
          newCells.map((lc) => ({
            station_id: station.id,
            band_id: lc.band_id,
            sector_id: resolveSectorId(lc._sectorLocalId, sectorIdByLocalId),
            rat: lc.rat,
            type: lc.type ?? null,
            is_confirmed: lc.is_confirmed,
            notes: lc.notes || null,
            details: pickCellDetails(lc.rat, lc.details),
          })),
          auditOperation,
        );
        newCells.forEach((lc, index) => {
          const createdCell = createdCells.data[index];
          if (createdCell) createdNewCellsByLocalId.set(lc._localId, createdCell);
          initialNewCellSectorIds.set(lc._localId, resolveSectorId(lc._sectorLocalId, sectorIdByLocalId));
        });
      }

      if (payload.deletedServerCellIds.length > 0)
        await Promise.all(payload.deletedServerCellIds.map((cellId) => deleteCell(station.id, cellId, auditOperation)));

      const cellsToPreclearSector = persistedCells.filter((lc) => {
        if (deletedServerCellIdSet.has(lc._serverId)) return false;
        const original = originalCells.find((cell) => cell.id === lc._serverId);
        return original?.sector_id !== null && original?.sector_id !== undefined && removedSectorIds.has(original.sector_id);
      });
      if (cellsToPreclearSector.length > 0) {
        await patchCells(
          station.id,
          cellsToPreclearSector.map((lc) => ({
            cell_id: lc._serverId,
            sector_id: null,
          })),
          auditOperation,
        );
      }

      if (haveSectorsChanged) {
        const savedSectors = await putStationSectors(station.id, sectorPayload, auditOperation);
        sectorIdByLocalId = makeSectorIdMap(sectors, savedSectors.data);
      }

      const modifiedCells = persistedCells.filter((lc) => isCellModified(lc, originalCells, sectorIdByLocalId));
      const createdCellSectorPatches = newCells.flatMap((lc) => {
        const createdCell = createdNewCellsByLocalId.get(lc._localId);
        const sectorId = resolveSectorId(lc._sectorLocalId, sectorIdByLocalId);
        if (!createdCell || sectorId === initialNewCellSectorIds.get(lc._localId)) return [];
        return [{ cell_id: createdCell.id, sector_id: sectorId }];
      });
      const cellPatches = [
        ...modifiedCells.map((lc) => ({
          cell_id: lc._serverId,
          band_id: lc.band_id,
          sector_id: resolveSectorId(lc._sectorLocalId, sectorIdByLocalId),
          type: lc.type ?? null,
          notes: lc.notes || null,
          is_confirmed: lc.is_confirmed,
          details: pickCellDetails(lc.rat, lc.details),
        })),
        ...createdCellSectorPatches,
      ];
      if (cellPatches.length > 0) await patchCells(station.id, cellPatches, auditOperation);

      const stationMetadataChanged =
        stationPatch.station_id !== station.station_id ||
        stationPatch.operator_id !== (station.operator?.id ?? null) ||
        stationPatch.notes !== (station.notes ?? null) ||
        stationPatch.extra_address !== (station.extra_address ?? null) ||
        stationPatch.is_confirmed !== station.is_confirmed ||
        (payload.stationStatus !== undefined && payload.stationStatus !== station.status);
      const newLocationId = typeof stationPatch.location_id === "number" ? stationPatch.location_id : oldLocationId;
      const locationMoved = newLocationId !== oldLocationId;
      const stationChanged = stationMetadataChanged || locationMoved;

      if (stationChanged) await patchStation(station.id, stationPatch, auditOperation);

      const existingExtraIds = station.extra_identificators;
      const existingNetworksId = existingExtraIds?.networks_id ?? null;
      const extraIdsPayload = toExtraIdsPayload(payload);
      const extraIdsFieldsChanged =
        extraIdsPayload.networks_id !== existingNetworksId ||
        extraIdsPayload.networks_name !== (existingExtraIds?.networks_name || null) ||
        extraIdsPayload.mno_name !== (existingExtraIds?.mno_name || null);

      const shouldUpdateExtraIds = !payload.skipExtraIds && extraIdsFieldsChanged;
      if (shouldUpdateExtraIds) await updateExtraIds(station.id, extraIdsPayload, auditOperation);

      const existingUplink = station.uplink;
      const uplinkPayload = toUplinkPayload(payload);
      const uplinkChanged =
        uplinkPayload.type !== (existingUplink?.type ?? null) ||
        uplinkPayload.speed !== (existingUplink?.speed ?? null) ||
        uplinkPayload.model !== (existingUplink?.model ?? null);
      if (uplinkChanged) await updateUplink(station.id, uplinkPayload, auditOperation);

      const cellCountChanged = newCells.length > 0 || payload.deletedServerCellIds.length > 0;
      const impact: StationUpdateImpact = {
        stationId: station.id,
        oldLocationId,
        newLocationId,
        stationMetadataChanged,
        locationMetadataChanged,
        locationMoved,
        cellsChanged: cellCountChanged || cellsToPreclearSector.length > 0 || cellPatches.length > 0,
        cellCountChanged,
        sectorsChanged: haveSectorsChanged,
        extraIdsChanged: shouldUpdateExtraIds,
        uplinkChanged,
      };

      return { mode: "update" as const, stationId: station.id, impact };
    },
    onSuccess: (result, payload) => {
      partiallyCreatedStationIds.delete(payload);
      if (result.mode === "update") {
        invalidateStationUpdateQueries(queryClient, result.impact);
        return;
      }

      const locationId = result.station.location?.id ?? null;
      invalidateStationUpdateQueries(queryClient, {
        stationId: result.station.id,
        oldLocationId: null,
        newLocationId: locationId,
        stationMetadataChanged: true,
        locationMetadataChanged: result.locationMetadataChanged,
        locationMoved: locationId !== null,
        cellsChanged: result.station.cells.length > 0,
        cellCountChanged: true,
        sectorsChanged: payload.sectors.length > 0,
        extraIdsChanged: !payload.skipExtraIds && hasExtraIdValues(payload),
        uplinkChanged: !!payload.uplinkType,
      });
    },
    onError: (_error, payload) => {
      if (payload.isCreateMode) {
        const stationId = partiallyCreatedStationIds.get(payload);
        partiallyCreatedStationIds.delete(payload);
        if (stationId === undefined) return;
        invalidateStationUpdateQueries(
          queryClient,
          {
            stationId,
            oldLocationId: null,
            newLocationId: payload.existingLocation?.id ?? null,
            stationMetadataChanged: true,
            locationMetadataChanged: payload.existingLocation !== null,
            locationMoved: false,
            cellsChanged: payload.localCells.length > 0,
            cellCountChanged: true,
            sectorsChanged: payload.sectors.length > 0,
            extraIdsChanged: !payload.skipExtraIds && hasExtraIdValues(payload),
            uplinkChanged: !!payload.uplinkType,
          },
          { conservative: true, refetchAdminDetail: true },
        );
        return;
      }
      if (!payload.originalStation) return;
      const stationId = payload.originalStation.id;
      const locationId = payload.originalStation.location?.id ?? null;
      invalidateStationUpdateQueries(
        queryClient,
        {
          stationId,
          oldLocationId: locationId,
          newLocationId: locationId,
          stationMetadataChanged: true,
          locationMetadataChanged: true,
          locationMoved: false,
          cellsChanged: true,
          cellCountChanged: true,
          sectorsChanged: true,
          extraIdsChanged: true,
          uplinkChanged: true,
        },
        { conservative: true, refetchAdminDetail: true },
      );
    },
  });
}
