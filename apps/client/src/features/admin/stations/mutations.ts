import { useMutation, useQueryClient } from "@tanstack/react-query";

import { patchLocation } from "../locations/api";
import {
  createCells,
  createLocation,
  createStation,
  deleteCell,
  deleteStation,
  patchCell,
  patchCells,
  patchStation,
  putStationSectors,
  updateExtraIds,
} from "./api";
import { type StationUpdateImpact, invalidateStationUpdateQueries } from "./queries";
import type { CellDraftBase } from "@/features/admin/cells/cellEditRow";
import { pickCellDetails } from "@/features/submissions/api";
import { createAuditOperationHandle } from "@/lib/api";
import { shallowEqual } from "@/lib/shallowEqual";
import type { Cell, Sector, SectorDraft, Station, StationStatus } from "@/types/station";

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
        },
        { conservative: true },
      );
    },
  });
}

export function useDeleteCellMutation(stationId: number) {
  return useMutation({
    mutationFn: (cellId: number) => deleteCell(stationId, cellId),
  });
}

export function usePatchCellMutation(stationId: number) {
  return useMutation({
    mutationFn: ({ cellId, body }: { cellId: number; body: Record<string, unknown> }) => patchCell(stationId, cellId, body),
  });
}

export function useCreateCellsMutation(stationId: number) {
  return useMutation({
    mutationFn: (cellsData: Record<string, unknown>[]) => createCells(stationId, cellsData),
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

function sectorsChanged(drafts: SectorDraft[], original: Sector[] | undefined): boolean {
  const originalSectors = original ?? [];
  if (drafts.length !== originalSectors.length) return true;
  return drafts.some((draft, index) => draft.azimuth !== originalSectors[index]?.azimuth);
}

function toSectorPayload(drafts: SectorDraft[]): { id?: number; azimuth: number }[] {
  return drafts.flatMap((sector) =>
    typeof sector.azimuth === "number" ? [{ ...(sector.id !== undefined ? { id: sector.id } : {}), azimuth: sector.azimuth }] : [],
  );
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

export interface SaveStationPayload {
  isCreateMode: boolean;
  stationId: string;
  operatorId: number | null;
  notes: string;
  extraAddress: string;
  isConfirmed: boolean;
  location: {
    region_id: number | null;
    city?: string;
    address?: string;
    longitude: number | null;
    latitude: number | null;
  };
  existingLocationId: number | null;
  localCells: LocalCell[];
  sectors: SectorDraft[];
  deletedServerCellIds: number[];
  originalStation?: Station;
  networksId?: number;
  networksName?: string;
  mnoName?: string;
  skipExtraIds?: boolean;
  stationStatus?: StationStatus;
}

const partiallyCreatedStationIds = new WeakMap<SaveStationPayload, number>();

export function useSaveStationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SaveStationPayload) => {
      const auditOperation = createAuditOperationHandle(payload.isCreateMode ? "station.create" : "station.edit");

      if (payload.isCreateMode) {
        if (payload.location.region_id === null || payload.location.longitude === null || payload.location.latitude === null) {
          throw new Error("Location required");
        }

        let locationId: number;
        if (payload.existingLocationId !== null) {
          locationId = payload.existingLocationId;
        } else {
          const locationRes = await createLocation(
            {
              region_id: payload.location.region_id,
              city: payload.location.city || undefined,
              address: payload.location.address || undefined,
              longitude: payload.location.longitude,
              latitude: payload.location.latitude,
            },
            auditOperation,
          );
          locationId = locationRes.data.id;
        }

        const cellsPayload = payload.localCells.map((lc) => ({
          station_id: 0,
          band_id: lc.band_id,
          rat: lc.rat,
          type: lc.type ?? null,
          is_confirmed: lc.is_confirmed,
          notes: lc.notes || null,
          details: pickCellDetails(lc.rat, lc.details),
        }));

        const res = await createStation(
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
        partiallyCreatedStationIds.set(payload, res.data.id);

        let sectorIdByLocalId = new Map<string, number>();
        if (payload.sectors.length > 0) {
          const savedSectors = await putStationSectors(res.data.id, toSectorPayload(payload.sectors), auditOperation);
          sectorIdByLocalId = makeSectorIdMap(payload.sectors, savedSectors.data);
        }

        const assignedCreatedCells = payload.localCells.flatMap((lc, index) => {
          const created = res.data.cells[index];
          const sectorId = resolveSectorId(lc._sectorLocalId, sectorIdByLocalId);
          if (!created || sectorId === null) return [];
          return [{ created, sectorId }];
        });
        if (assignedCreatedCells.length > 0) {
          await patchCells(
            res.data.id,
            assignedCreatedCells.map(({ created, sectorId }) => ({
              cell_id: created.id,
              sector_id: sectorId,
            })),
            auditOperation,
          );
        }

        if (!payload.skipExtraIds && (payload.networksId !== undefined || payload.networksName || payload.mnoName)) {
          await updateExtraIds(
            res.data.id,
            {
              networks_id: payload.networksId ?? null,
              networks_name: payload.networksName || null,
              mno_name: payload.mnoName || null,
            },
            auditOperation,
          );
        }

        return { mode: "create" as const, station: res.data };
      }

      if (!payload.originalStation) {
        throw new Error("Original station required for update");
      }

      const station = payload.originalStation;
      const originalCells = station.cells;
      const oldLocationId = station.location?.id ?? null;
      let locationMetadataChanged = false;
      let sectorIdByLocalId = makeSectorIdMap(payload.sectors);
      const sectorPayload = toSectorPayload(payload.sectors);
      const haveSectorsChanged = sectorsChanged(payload.sectors, station.sectors);
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

      if (payload.existingLocationId !== null && payload.existingLocationId !== (station.location?.id ?? null)) {
        stationPatch.location_id = payload.existingLocationId;
      } else if (station.location) {
        const coordsChanged =
          payload.location.latitude !== (station.location.latitude ?? null) || payload.location.longitude !== (station.location.longitude ?? null);
        if (coordsChanged && payload.location.latitude !== null && payload.location.longitude !== null && payload.location.region_id !== null) {
          const locationRes = await createLocation(
            {
              region_id: payload.location.region_id,
              city: payload.location.city || undefined,
              address: payload.location.address || undefined,
              longitude: payload.location.longitude,
              latitude: payload.location.latitude,
            },
            auditOperation,
          );
          stationPatch.location_id = locationRes.data.id;
        } else if (!coordsChanged) {
          const locationPatch: Record<string, unknown> = {};
          if (payload.location.city !== (station.location.city ?? "")) locationPatch.city = payload.location.city || null;
          if (payload.location.address !== (station.location.address ?? "")) locationPatch.address = payload.location.address || null;
          if (payload.location.region_id !== (station.location.region?.id ?? null)) locationPatch.region_id = payload.location.region_id;
          if (Object.keys(locationPatch).length > 0) {
            await patchLocation(station.location.id, locationPatch, auditOperation);
            locationMetadataChanged = true;
          }
        }
      } else if (payload.location.latitude !== null && payload.location.longitude !== null && payload.location.region_id !== null) {
        const locationRes = await createLocation(
          {
            region_id: payload.location.region_id,
            city: payload.location.city || undefined,
            address: payload.location.address || undefined,
            longitude: payload.location.longitude,
            latitude: payload.location.latitude,
          },
          auditOperation,
        );
        stationPatch.location_id = locationRes.data.id;
      }

      const newCells = payload.localCells.filter((lc) => !lc._serverId);
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

      if (payload.deletedServerCellIds.length > 0) {
        await Promise.all(payload.deletedServerCellIds.map((cellId) => deleteCell(station.id, cellId, auditOperation)));
      }

      const cellsToPreclearSector = payload.localCells.filter(hasServerId).filter((lc) => {
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
        sectorIdByLocalId = makeSectorIdMap(payload.sectors, savedSectors.data);
      }

      const modifiedCells = payload.localCells.filter(hasServerId).filter((lc) => isCellModified(lc, originalCells, sectorIdByLocalId));
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
      if (cellPatches.length > 0) {
        await patchCells(station.id, cellPatches, auditOperation);
      }

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

      const existingNetworksId = payload.originalStation?.extra_identificators?.networks_id ?? null;
      const extraIdsFieldsChanged =
        (payload.networksId ?? null) !== existingNetworksId ||
        (payload.networksName || null) !== (payload.originalStation?.extra_identificators?.networks_name || null) ||
        (payload.mnoName || null) !== (payload.originalStation?.extra_identificators?.mno_name || null);

      const existingHasExtraIds = existingNetworksId !== null || !!payload.originalStation?.extra_identificators?.mno_name;
      const shouldUpdateExtraIds =
        !payload.skipExtraIds &&
        ((payload.networksId !== null && payload.networksId !== undefined) || !!payload.networksName || !!payload.mnoName || existingHasExtraIds) &&
        extraIdsFieldsChanged;
      if (shouldUpdateExtraIds) {
        await updateExtraIds(
          station.id,
          {
            networks_id: payload.networksId ?? null,
            networks_name: payload.networksName || null,
            mno_name: payload.mnoName || null,
          },
          auditOperation,
        );
      }

      const impact: StationUpdateImpact = {
        stationId: station.id,
        oldLocationId,
        newLocationId,
        stationMetadataChanged,
        locationMetadataChanged,
        locationMoved,
        cellsChanged: newCells.length > 0 || payload.deletedServerCellIds.length > 0 || cellsToPreclearSector.length > 0 || cellPatches.length > 0,
        cellCountChanged: newCells.length > 0 || payload.deletedServerCellIds.length > 0,
        sectorsChanged: haveSectorsChanged,
        extraIdsChanged: shouldUpdateExtraIds,
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
        locationMetadataChanged: false,
        locationMoved: locationId !== null,
        cellsChanged: result.station.cells.length > 0,
        cellCountChanged: true,
        sectorsChanged: payload.sectors.length > 0,
        extraIdsChanged: !payload.skipExtraIds && (payload.networksId !== undefined || !!payload.networksName || !!payload.mnoName),
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
            newLocationId: payload.existingLocationId,
            stationMetadataChanged: true,
            locationMetadataChanged: false,
            locationMoved: false,
            cellsChanged: payload.localCells.length > 0,
            cellCountChanged: true,
            sectorsChanged: payload.sectors.length > 0,
            extraIdsChanged: !payload.skipExtraIds && (payload.networksId !== undefined || !!payload.networksName || !!payload.mnoName),
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
        },
        { conservative: true, refetchAdminDetail: true },
      );
    },
  });
}
