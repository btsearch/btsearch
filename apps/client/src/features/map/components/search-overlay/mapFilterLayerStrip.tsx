import {
  AirportTowerIcon,
  Fire02Icon,
  FootprintsIcon,
  Gps01Icon,
  Navigation03Icon,
  Radar01Icon,
  Route02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Trans, useTranslation } from "react-i18next";

import type { MapCrowdState } from "../../crowd/useMapCrowd";
import type { MapCountries } from "../../data/mapCountries";
import type { CapableCountries, MapFilters, MapFiltersChange } from "../../data/mapFilters";
import { Reveal } from "./mapFilterMotion";
import { FilterNote } from "./mapFilterNote";
import { type LayersNote, getLayersNote } from "./mapFilterPanelRules";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

type LayerTile = {
  key: string;
  label: string;
  icon: IconSvgElement;
  isActive: boolean;
  canBeUnavailable: boolean;
  unavailableNote: string | null;
  keybind: string;
  onToggle: () => void;
};

type LayerTileButtonProps = {
  layer: LayerTile;
};

type FilterLayerStripProps = {
  isSheet: boolean;
  filters: MapFilters;
  mapCountries: MapCountries;
  countries: CapableCountries;
  crowd?: MapCrowdState;
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
const SINGLE_ROW_TILE_LIMIT = 5;
const FIRST_ROW_TILE_COUNT = 4;
const GRID_COLUMNS = 12;
const COLUMN_SPAN_CLASSES: Record<number, string> = { 3: "col-span-3", 4: "col-span-4", 6: "col-span-6", 12: "col-span-12" };

function getTileSpanClass(index: number, tileCount: number): string | undefined {
  if (tileCount <= SINGLE_ROW_TILE_LIMIT) return undefined;
  const rowTileCount = index < FIRST_ROW_TILE_COUNT ? FIRST_ROW_TILE_COUNT : tileCount - FIRST_ROW_TILE_COUNT;
  return COLUMN_SPAN_CLASSES[GRID_COLUMNS / rowTileCount];
}

function getLayerTileStateClass(isActive: boolean, isUnavailable: boolean): string {
  if (isUnavailable) return LAYER_TILE_UNAVAILABLE_CLASS;
  return isActive ? LAYER_TILE_ACTIVE_CLASS : LAYER_TILE_IDLE_CLASS;
}

function LayerTileButton({ layer }: LayerTileButtonProps) {
  const { isActive } = layer;
  const isUnavailable = layer.unavailableNote !== null;

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

  if (!layer.canBeUnavailable) return tile;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block min-w-0" />}>{tile}</TooltipTrigger>
      {isUnavailable ? <TooltipContent>{layer.unavailableNote}</TooltipContent> : null}
    </Tooltip>
  );
}

export function FilterLayerStrip({
  isSheet,
  filters,
  mapCountries,
  countries,
  crowd,
  onFiltersChange,
  onToggleHeatmap,
  onTogglePlannedMeasurements,
}: FilterLayerStripProps) {
  const { t } = useTranslation(["main", "common"]);
  const { preferences, updatePreferences } = usePreferences();
  const hasPlannedMeasurementsTile = onTogglePlannedMeasurements !== undefined;
  const layersNote = getLayersNote(filters, mapCountries, hasPlannedMeasurementsTile, countries);
  const layersNoteTexts: Record<LayersNote, string> = {
    sharedView: hasPlannedMeasurementsTile ? t("main:filters.registerLayersNote") : t("main:filters.radiolinesLayerNote"),
    linksAndEmfUnavailable: t("main:filters.registerLayersUnavailable"),
    linksUnavailable: t("main:filters.radiolinesLayerUnavailable"),
    emfUnavailable: t("main:filters.plannedPemLayerUnavailable"),
  };
  const registerOnlyNote = t("main:filters.registerLayerOnly");
  const crowdSwitchedOffNote = crowd?.isSwitchedOff ? t("main:crowd.layers.switchedOff") : null;
  let crowdNote: string | null = crowdSwitchedOffNote;
  if (crowdNote === null && crowd?.hidesPrivateCountries) crowdNote = t("main:crowd.layers.privateCountries");

  const possibleLayers: (LayerTile | null)[] = [
    {
      key: "stations",
      label: t("common:labels.stations"),
      icon: AirportTowerIcon,
      isActive: filters.showStations,
      canBeUnavailable: false,
      unavailableNote: null,
      keybind: "S",
      onToggle: () => onFiltersChange((current) => ({ ...current, showStations: !current.showStations })),
    },
    crowd === undefined
      ? null
      : {
          key: "estimated",
          label: t("main:crowd.layers.estimated"),
          icon: Gps01Icon,
          isActive: filters.showEstimatedSites && crowd.isAvailable,
          canBeUnavailable: true,
          unavailableNote: crowdSwitchedOffNote,
          keybind: "E",
          onToggle: () => onFiltersChange((current) => ({ ...current, showEstimatedSites: !current.showEstimatedSites })),
        },
    {
      key: "radiolines",
      label: t("common:labels.radiolines"),
      icon: Route02Icon,
      isActive: filters.showRadiolines,
      canBeUnavailable: true,
      unavailableNote: mapCountries.capabilities.microwaveLinks ? null : registerOnlyNote,
      keybind: "R",
      onToggle: () => onFiltersChange((current) => ({ ...current, showRadiolines: !current.showRadiolines })),
    },
    onTogglePlannedMeasurements === undefined
      ? null
      : {
          key: "pem",
          label: t("main:filters.showPlannedPem"),
          icon: Radar01Icon,
          isActive: filters.showPlannedMeasurements,
          canBeUnavailable: true,
          unavailableNote: mapCountries.capabilities.emf ? null : registerOnlyNote,
          keybind: "P",
          onToggle: onTogglePlannedMeasurements,
        },
    crowd === undefined
      ? null
      : {
          key: "trails",
          label: t("main:crowd.trails.title"),
          icon: FootprintsIcon,
          isActive: filters.showTrails && crowd.isAvailable && !crowd.isTrailsBlocked,
          canBeUnavailable: true,
          unavailableNote: crowdSwitchedOffNote ?? (crowd.isTrailsBlocked ? t("main:crowd.layers.trailsPrivate") : null),
          keybind: "T",
          onToggle: () => onFiltersChange((current) => ({ ...current, showTrails: !current.showTrails })),
        },
    onToggleHeatmap === undefined
      ? null
      : {
          key: "heatmap",
          label: "Heatmap",
          icon: Fire02Icon,
          isActive: filters.showHeatmap,
          canBeUnavailable: false,
          unavailableNote: null,
          keybind: "H",
          onToggle: onToggleHeatmap,
        },
    {
      key: "azimuths",
      label: t("common:labels.azimuths"),
      icon: Navigation03Icon,
      isActive: preferences.showAzimuths,
      canBeUnavailable: false,
      unavailableNote: null,
      keybind: "A",
      onToggle: () => updatePreferences((current) => ({ showAzimuths: !current.showAzimuths })),
    },
  ];
  const layers = possibleLayers.filter((layer): layer is LayerTile => layer !== null);

  return (
    <div className={cn("shrink-0 border-t bg-muted/30 px-4 pt-2.5", isSheet ? "pb-[max(0.5rem,env(safe-area-inset-bottom))]" : "pb-2")}>
      <div
        role="group"
        aria-label={t("main:filters.layers")}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${layers.length > SINGLE_ROW_TILE_LIMIT ? GRID_COLUMNS : layers.length}, minmax(0, 1fr))` }}
      >
        {layers.map((layer, index) => (
          <div key={layer.key} className={cn("min-w-0", getTileSpanClass(index, layers.length))}>
            <LayerTileButton layer={layer} />
          </div>
        ))}
      </div>
      <Reveal shown={layersNote !== null} className="pt-1.5">
        <FilterNote>{layersNote === null ? null : layersNoteTexts[layersNote]}</FilterNote>
      </Reveal>
      <Reveal shown={crowdNote !== null} className="pt-1.5">
        <FilterNote>{crowdNote}</FilterNote>
      </Reveal>
      {isSheet ? null : (
        <p className="pt-1.5 text-[11px] leading-4 text-muted-foreground">
          <Trans t={t} i18nKey="main:filters.toggleHint" components={{ kbd: <kbd className={KEY_HINT_CLASS} /> }} />
        </p>
      )}
    </div>
  );
}
