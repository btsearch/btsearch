import { SquareArrowExpand01Icon } from "@hugeicons/core-free-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ListRowActionButton, type ListRowActionPlacement, ListRowActions, ListRowMapLink } from "./listRowActions";
import { EDITOR_STATION_SEARCH } from "@/features/admin/stations/editorStationSearch";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import type { StationsListVariant } from "@/features/stations/list/data/stationsListFilters";
import type { StationsListRow } from "@/features/stations/list/data/stationsListRows";
import { seedStationWindow } from "@/features/stations/list/data/stationWindowSeed";

type StationRowActionsProps = {
  row: StationsListRow;
  placement: ListRowActionPlacement;
  onWindowOpen: (row: StationsListRow) => void;
};

export type StationRowOpeners = {
  openRow: (row: StationsListRow) => void;
  openWindow: (row: StationsListRow) => void;
};

export function useStationRowOpeners(variant: StationsListVariant): StationRowOpeners {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openStationDialog } = useFloatingDialogStack();

  function openWindow(row: StationsListRow) {
    seedStationWindow(queryClient, row);
    openStationDialog(row.id, "internal", row.locationId ?? undefined);
  }

  function openEditor(row: StationsListRow) {
    void navigate({ to: "/admin/stations/$id", params: { id: String(row.id) }, search: EDITOR_STATION_SEARCH });
  }

  return { openRow: variant === "admin" ? openEditor : openWindow, openWindow };
}

export function StationRowActions({ row, placement, onWindowOpen }: StationRowActionsProps) {
  const { t } = useTranslation("terrainProfile");
  const { locationId, latitude, longitude } = row;

  return (
    <ListRowActions placement={placement}>
      <ListRowActionButton placement={placement} label={t("header.openStation")} icon={SquareArrowExpand01Icon} onClick={() => onWindowOpen(row)} />
      {locationId === null || latitude === null || longitude === null ? null : (
        <ListRowMapLink placement={placement} locationId={locationId} latitude={latitude} longitude={longitude} />
      )}
    </ListRowActions>
  );
}
