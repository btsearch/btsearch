import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CellDraftBase } from "@/features/admin/cells/cellEditRow";
import { pickCellDetails } from "@/features/submissions/api";
import { shallowEqual } from "@/lib/shallowEqual";
import type { Cell, Sector, SectorDraft, Station, StationStatus } from "@/types/station";

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

export type LocalCell = CellDraftBase & {
  _serverId?: number;
  _sectorLocalId?: string | null;
};

export function useCreateLocationMutation() {
  return useMutation({
    mutationFn: createLocation,
  });
}

export function useDeleteStationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stationId: number) => deleteStation(stationId),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ["admin", "stations"] });
    },
  });
}

export function useCreateStationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createStation,
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ["admin", "stations"] });
    },
  });
}

export function usePatchStationMutation(stationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => patchStation(stationId, body),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ["admin", "station", String(stationId)] });
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

export function useSaveStationMutation() {
  const queryClient = useQueryClient();
  const createLocationMutation = useCreateLocationMutation();
  const createStationMutation = useCreateStationMutation();

  return useMutation({
    mutationFn: async (payload: SaveStationPayload) => {
      if (payload.isCreateMode) {
        if (payload.location.region_id === null || payload.location.longitude === null || payload.location.latitude === null) {
          throw new Error("Location required");
        }

        let locationId: number;
        if (payload.existingLocationId !== null) {
          locationId = payload.existingLocationId;
        } else {
          const locationRes = await createLocationMutation.mutateAsync({
            region_id: payload.location.region_id,
            city: payload.location.city || undefined,
            address: payload.location.address || undefined,
            longitude: payload.location.longitude,
            latitude: payload.location.latitude,
          });
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

        const res = await createStationMutation.mutateAsync({
          station_id: payload.stationId,
          operator_id: payload.operatorId,
          location_id: locationId,
          notes: payload.notes || null,
          extra_address: payload.extraAddress || null,
          is_confirmed: payload.isConfirmed,
          cells: cellsPayload,
        });

        let sectorIdByLocalId = new Map<string, number>();
        if (payload.sectors.length > 0) {
          const savedSectors = await putStationSectors(res.data.id, toSectorPayload(payload.sectors));
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
          );
        }

        if (!payload.skipExtraIds && (payload.networksId !== undefined || payload.networksName || payload.mnoName)) {
          await updateExtraIds(res.data.id, {
            networks_id: payload.networksId ?? null,
            networks_name: payload.networksName || null,
            mno_name: payload.mnoName || null,
          });
        }

        return { mode: "create" as const, station: res.data };
      }

      if (!payload.originalStation) {
        throw new Error("Original station required for update");
      }

      const station = payload.originalStation;
      const originalCells = station.cells;
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
          const locationRes = await createLocationMutation.mutateAsync({
            region_id: payload.location.region_id,
            city: payload.location.city || undefined,
            address: payload.location.address || undefined,
            longitude: payload.location.longitude,
            latitude: payload.location.latitude,
          });
          stationPatch.location_id = locationRes.data.id;
        } else if (!coordsChanged) {
          const locationPatch: Record<string, unknown> = {};
          if (payload.location.city !== (station.location.city ?? "")) locationPatch.city = payload.location.city || null;
          if (payload.location.address !== (station.location.address ?? "")) locationPatch.address = payload.location.address || null;
          if (payload.location.region_id !== (station.location.region?.id ?? null)) locationPatch.region_id = payload.location.region_id;
          if (Object.keys(locationPatch).length > 0) await patchLocation(station.location.id, locationPatch);
        }
      } else if (payload.location.latitude !== null && payload.location.longitude !== null && payload.location.region_id !== null) {
        const locationRes = await createLocationMutation.mutateAsync({
          region_id: payload.location.region_id,
          city: payload.location.city || undefined,
          address: payload.location.address || undefined,
          longitude: payload.location.longitude,
          latitude: payload.location.latitude,
        });
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
        );
        newCells.forEach((lc, index) => {
          const createdCell = createdCells.data[index];
          if (createdCell) createdNewCellsByLocalId.set(lc._localId, createdCell);
          initialNewCellSectorIds.set(lc._localId, resolveSectorId(lc._sectorLocalId, sectorIdByLocalId));
        });
      }

      if (payload.deletedServerCellIds.length > 0) {
        await Promise.all(payload.deletedServerCellIds.map((cellId) => deleteCell(station.id, cellId)));
      }

      const cellsToPreclearSector = payload.localCells.filter((lc) => {
        if (!lc._serverId || deletedServerCellIdSet.has(lc._serverId)) return false;
        const original = originalCells.find((cell) => cell.id === lc._serverId);
        return original?.sector_id !== null && original?.sector_id !== undefined && removedSectorIds.has(original.sector_id);
      });
      if (cellsToPreclearSector.length > 0) {
        await patchCells(
          station.id,
          cellsToPreclearSector.map((lc) => ({
            cell_id: lc._serverId as number,
            sector_id: null,
          })),
        );
      }

      if (haveSectorsChanged) {
        const savedSectors = await putStationSectors(station.id, sectorPayload);
        sectorIdByLocalId = makeSectorIdMap(payload.sectors, savedSectors.data);
      }

      const modifiedCells = payload.localCells.filter((lc) => lc._serverId && isCellModified(lc, originalCells, sectorIdByLocalId));
      const createdCellSectorPatches = newCells.flatMap((lc) => {
        const createdCell = createdNewCellsByLocalId.get(lc._localId);
        const sectorId = resolveSectorId(lc._sectorLocalId, sectorIdByLocalId);
        if (!createdCell || sectorId === initialNewCellSectorIds.get(lc._localId)) return [];
        return [{ cell_id: createdCell.id, sector_id: sectorId }];
      });
      const cellPatches = [
        ...modifiedCells.map((lc) => ({
          cell_id: lc._serverId as number,
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
        await patchCells(station.id, cellPatches);
      }

      const stationChanged =
        stationPatch.station_id !== station.station_id ||
        stationPatch.operator_id !== (station.operator?.id ?? null) ||
        stationPatch.notes !== (station.notes ?? null) ||
        stationPatch.extra_address !== (station.extra_address ?? null) ||
        stationPatch.is_confirmed !== station.is_confirmed ||
        stationPatch.status !== station.status ||
        ("location_id" in stationPatch && stationPatch.location_id !== (station.location?.id ?? null));

      if (stationChanged) await patchStation(station.id, stationPatch);

      const existingNetworksId = payload.originalStation?.extra_identificators?.networks_id ?? null;
      if (payload.skipExtraIds) return { mode: "update" as const, stationId: station.id };

      const extraIdsFieldsChanged =
        (payload.networksId ?? null) !== existingNetworksId ||
        (payload.networksName || null) !== (payload.originalStation?.extra_identificators?.networks_name || null) ||
        (payload.mnoName || null) !== (payload.originalStation?.extra_identificators?.mno_name || null);

      const existingHasExtraIds = existingNetworksId !== null || !!payload.originalStation?.extra_identificators?.mno_name;
      if (((payload.networksId !== null && payload.networksId !== undefined) || !!payload.mnoName || existingHasExtraIds) && extraIdsFieldsChanged) {
        await updateExtraIds(station.id, {
          networks_id: payload.networksId ?? null,
          networks_name: payload.networksName || null,
          mno_name: payload.mnoName || null,
        });
      }

      return { mode: "update" as const, stationId: station.id };
    },
    onSuccess: (result) => {
      if (result.mode === "update") return queryClient.invalidateQueries({ queryKey: ["admin", "station", String(result.stationId)] });
    },
  });
}
