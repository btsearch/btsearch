import { AirportTowerIcon, Fire02Icon, Navigation03Icon, Radar01Icon, Route02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Trans, useTranslation } from "react-i18next";

import type { MapCountries } from "../../data/mapCountries";
import type { MapFilters, MapFiltersChange } from "../../data/mapFilters";
import { Reveal } from "./mapFilterMotion";
import { FilterNote } from "./mapFilterNote";
import { getRegisterLayersNote } from "./mapFilterPanelRules";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

type LayerTile = {
  key: string;
  label: string;
  icon: IconSvgElement;
  isActive: boolean;
  isRegisterOnly: boolean;
  keybind: string;
  onToggle: () => void;
};

type LayerTileButtonProps = {
  layer: LayerTile;
  isUnavailable: boolean;
};

type FilterLayerStripProps = {
  isSheet: boolean;
  filters: MapFilters;
  mapCountries: MapCountries;
  onFiltersChange: (update: MapFiltersChange) => void;
  onToggleHeatmap?: () => void;
  onTogglePlannedMeasurements?: () => void;
};

const LAYER_TILE_CLASS =
  "relative flex h-14 w-full flex-col items-center justify-center gap-1.5 rounded-lg border px-0.5 text-[11px] font-medium leading-none outline-none transition-[color,background-color,border-color,opacity] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";
const LAYER_TILE_ACTIVE_CLASS = "cursor-pointer border-primary/40 bg-primary/10 text-primary";
const LAYER_TILE_IDLE_CLASS =
  "cursor-pointer border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30";
const LAYER_TILE_UNAVAILABLE_CLASS =
  "cursor-not-allowed border-border bg-background text-muted-foreground opacity-50 dark:border-input dark:bg-input/30";
const KEY_HINT_CLASS = "rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground";

function getLayerTileStateClass(isActive: boolean, isUnavailable: boolean): string {
  if (isUnavailable) return LAYER_TILE_UNAVAILABLE_CLASS;
  return isActive ? LAYER_TILE_ACTIVE_CLASS : LAYER_TILE_IDLE_CLASS;
}

function LayerTileButton({ layer, isUnavailable }: LayerTileButtonProps) {
  const { t } = useTranslation("main");
  const { isActive } = layer;

  const tile = (
    <button
      type="button"
      aria-pressed={isActive}
      aria-disabled={isUnavailable}
      onMouseDown={(event) => event.preventDefault()}
      onClick={isUnavailable ? undefined : layer.onToggle}
      className={cn(LAYER_TILE_CLASS, getLayerTileStateClass(isActive, isUnavailable))}
    >
      <span className="absolute top-1 left-1.5 hidden font-mono text-[9px] text-muted-foreground md:inline">{layer.keybind}</span>
      {isActive ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="absolute top-1 right-1 size-3" aria-hidden="true" /> : null}
      <HugeiconsIcon icon={layer.icon} className="size-4" aria-hidden="true" />
      <span className="max-w-full">{layer.label}</span>
    </button>
  );

  if (!layer.isRegisterOnly) return tile;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block min-w-0" />}>{tile}</TooltipTrigger>
      {isUnavailable ? <TooltipContent>{t("filters.registerLayerOnly")}</TooltipContent> : null}
    </Tooltip>
  );
}

export function FilterLayerStrip({
  isSheet,
  filters,
  mapCountries,
  onFiltersChange,
  onToggleHeatmap,
  onTogglePlannedMeasurements,
}: FilterLayerStripProps) {
  const { t } = useTranslation(["main", "common"]);
  const { preferences, updatePreferences } = usePreferences();
  const layersNote = getRegisterLayersNote(filters, mapCountries);
  const hasPlannedMeasurementsTile = onTogglePlannedMeasurements !== undefined;
  const sharedViewNote = hasPlannedMeasurementsTile ? t("main:filters.registerLayersNote") : t("main:filters.radiolinesLayerNote");
  const offScreenNote = hasPlannedMeasurementsTile ? t("main:filters.registerLayersUnavailable") : t("main:filters.radiolinesLayerUnavailable");

  const layers = [
    {
      key: "stations",
      label: t("common:labels.stations"),
      icon: AirportTowerIcon,
      isActive: filters.showStations,
      isRegisterOnly: false,
      keybind: "S",
      onToggle: () => onFiltersChange((current) => ({ ...current, showStations: !current.showStations })),
    },
    {
      key: "radiolines",
      label: t("common:labels.radiolines"),
      icon: Route02Icon,
      isActive: filters.showRadiolines,
      isRegisterOnly: true,
      keybind: "R",
      onToggle: () => onFiltersChange((current) => ({ ...current, showRadiolines: !current.showRadiolines })),
    },
    onToggleHeatmap === undefined
      ? null
      : {
          key: "heatmap",
          label: "Heatmap",
          icon: Fire02Icon,
          isActive: filters.showHeatmap,
          isRegisterOnly: false,
          keybind: "H",
          onToggle: onToggleHeatmap,
        },
    onTogglePlannedMeasurements === undefined
      ? null
      : {
          key: "pem",
          label: t("main:filters.showPlannedPem"),
          icon: Radar01Icon,
          isActive: filters.showPlannedMeasurements,
          isRegisterOnly: true,
          keybind: "P",
          onToggle: onTogglePlannedMeasurements,
        },
    {
      key: "azimuths",
      label: t("common:labels.azimuths"),
      icon: Navigation03Icon,
      isActive: preferences.showAzimuths,
      isRegisterOnly: false,
      keybind: "A",
      onToggle: () => updatePreferences((current) => ({ showAzimuths: !current.showAzimuths })),
    },
  ].filter((layer): layer is LayerTile => layer !== null);

  return (
    <div className={cn("shrink-0 border-t bg-muted/30 px-4 pt-2.5", isSheet ? "pb-[max(0.5rem,env(safe-area-inset-bottom))]" : "pb-2")}>
      <div
        role="group"
        aria-label={t("main:filters.layers")}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${layers.length}, minmax(0, 1fr))` }}
      >
        {layers.map((layer) => (
          <LayerTileButton key={layer.key} layer={layer} isUnavailable={layer.isRegisterOnly && !mapCountries.isRegisterOnScreen} />
        ))}
      </div>
      <Reveal shown={layersNote !== null} className="pt-1.5">
        <FilterNote>{layersNote === "offScreen" ? offScreenNote : sharedViewNote}</FilterNote>
      </Reveal>
      {isSheet ? null : (
        <p className="pt-1.5 text-[11px] leading-4 text-muted-foreground">
          <Trans t={t} i18nKey="main:filters.toggleHint" components={{ kbd: <kbd className={KEY_HINT_CLASS} /> }} />
        </p>
      )}
    </div>
  );
}
