import { useTranslation } from "react-i18next";

import type { MapLookups } from "@/features/map/data/mapLookups";
import { describeArea, hasRegionLimits, useEditorArea } from "@/features/stations/list/data/editorArea";

export function useCommentsArea(lookups: MapLookups | undefined, haveLookupsFailed: boolean): string | null {
  const { t, i18n } = useTranslation("admin");
  const { area } = useEditorArea();

  if (area === undefined || area.coversEverything) return null;
  if (area.regionIdsByCountry.size === 0) return t("admin:dashboard.noArea");
  if (lookups === undefined && !haveLookupsFailed && hasRegionLimits(area)) return null;
  return t("admin:dashboard.area", { area: describeArea(area, lookups, i18n.language) });
}
