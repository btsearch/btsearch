import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { LocationsListRow } from "@/features/admin/locations/list/data/locationsListRows";
import { useCopyText } from "@/features/settings/copyText";
import {
  ListRowActionButton,
  type ListRowActionPlacement,
  ListRowActions,
  ListRowMapLink,
} from "@/features/stations/list/components/table/listRowActions";

type LocationRowActionsProps = {
  row: LocationsListRow;
  placement: ListRowActionPlacement;
};

function getCoordinatesText(row: LocationsListRow): string {
  return `${row.latitude}, ${row.longitude}`;
}

export function useLocationRowOpener(): (row: LocationsListRow) => void {
  const navigate = useNavigate();

  function openEditor(row: LocationsListRow) {
    void navigate({ to: "/admin/locations/$id", params: { id: String(row.id) } });
  }

  return openEditor;
}

export function LocationRowActions({ row, placement }: LocationRowActionsProps) {
  const { t } = useTranslation("main");
  const { copied, copy } = useCopyText();

  return (
    <ListRowActions placement={placement}>
      <ListRowActionButton
        placement={placement}
        label={copied ? t("common:actions.copied") : t("popup.copyCoordinates")}
        icon={copied ? Tick02Icon : Copy01Icon}
        iconClassName={copied ? "text-emerald-500" : undefined}
        onClick={() => copy(getCoordinatesText(row))}
      />
      <ListRowMapLink placement={placement} locationId={row.id} latitude={row.latitude} longitude={row.longitude} />
    </ListRowActions>
  );
}
