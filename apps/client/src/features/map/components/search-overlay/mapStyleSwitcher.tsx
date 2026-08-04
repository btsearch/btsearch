import { type KeyboardEvent, type MouseEvent, useCallback, useEffect, useState } from "react";

function stopPropagation(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
}
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { CARTO_STYLE_URLS, type MapStyle, useMap, useResolvedTheme } from "@/components/ui/map";
import { type CartoVariant, usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

const CARTO_THUMBNAILS: Record<"dark" | "light", string> = {
  dark: "https://a.basemaps.cartocdn.com/dark_all/13/4400/2686.png",
  light: "https://a.basemaps.cartocdn.com/light_all/13/4400/2686.png",
};

const CARTO_VARIANT_LABELS: Record<CartoVariant, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

const MAP_STYLE_OPTIONS: Record<MapStyle, { label: string; thumbnail: string }> = {
  carto: {
    label: "Standard",
    thumbnail: CARTO_THUMBNAILS.light,
  },
  osm: {
    label: "OpenStreetMap",
    thumbnail: "https://tile.openstreetmap.org/13/4400/2686.png",
  },
  openfreemap: {
    label: "OpenFreeMap",
    thumbnail: "https://a.basemaps.cartocdn.com/light_all/13/4400/2686.png",
  },
  satellite: {
    label: "Google Satellite",
    thumbnail: "https://mt1.google.com/vt/lyrs=s&x=4400&y=2686&z=13",
  },
  esriSatellite: {
    label: "Esri Satellite",
    thumbnail: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/13/2686/4400",
  },
  opentopomap: {
    label: "OpenTopoMap",
    thumbnail: "https://a.tile.opentopomap.org/13/4400/2686.png",
  },
};

type MapStyleSwitcherProps = {
  position?: "default" | "mobile" | "nav" | "search";
};

export function MapStyleSwitcher({ position = "default" }: MapStyleSwitcherProps) {
  const { t } = useTranslation("main");
  const { mapStyle, setMapStyle } = useMap();
  const { preferences, updatePreferences } = usePreferences();
  const resolvedTheme = useResolvedTheme();
  const [showPicker, setShowPicker] = useState(false);

  const cartoThumbnail = preferences.cartoVariant === "auto" ? CARTO_THUMBNAILS[resolvedTheme] : CARTO_THUMBNAILS[preferences.cartoVariant];

  useEffect(() => {
    if (!showPicker) return;

    const handleClickOutside = () => setShowPicker(false);

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showPicker]);

  const handleSelectStyle = useCallback(
    (style: MapStyle) => {
      setMapStyle(style);
      setShowPicker(false);
    },
    [setMapStyle],
  );

  const isMobile = position === "mobile" || position === "nav" || position === "search";
  const isNav = position === "nav";
  const isSearch = position === "search";
  const activeThumbnail = mapStyle === "carto" ? cartoThumbnail : MAP_STYLE_OPTIONS[mapStyle].thumbnail;
  const trigger = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (mapStyle === "carto") {
          fetch(CARTO_STYLE_URLS.dark, { priority: "low" }).catch(() => {});
          fetch(CARTO_STYLE_URLS.light, { priority: "low" }).catch(() => {});
        }
        setShowPicker(true);
      }}
      className={cn(
        "group flex items-center gap-2 border transition-all text-left",
        isNav ? "h-8 rounded-full border-transparent bg-transparent p-0.5 hover:bg-muted" : "rounded-lg bg-background p-1",
        isNav ? "shadow-none" : isMobile ? "shadow-md" : "pr-3 shadow-lg",
      )}
      aria-label="Change map style"
    >
      <div
        className={cn(
          "overflow-hidden border border-border/50 group-hover:border-border transition-colors",
          isNav ? "size-7 rounded-full" : "h-8 w-8 rounded-md",
        )}
      >
        <img src={activeThumbnail} alt={MAP_STYLE_OPTIONS[mapStyle].label} className="w-full h-full object-cover" />
      </div>
      {!isMobile && (
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider leading-none mb-0.5">{t("overlay.mapStyle")}</span>
          <span className="text-xs font-semibold text-foreground leading-none">{MAP_STYLE_OPTIONS[mapStyle].label}</span>
        </div>
      )}
    </button>
  );

  if (showPicker) {
    const picker = (
      <div
        onClick={stopPropagation}
        onKeyDown={stopPropagation}
        role="listbox"
        className={cn(
          "flex p-1.5 rounded-lg bg-background border shadow-lg",
          isNav
            ? "fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-2 z-60 flex-col-reverse gap-1"
            : isSearch
              ? "absolute top-full right-0 mt-1 flex-col gap-1"
              : isMobile
                ? "absolute bottom-0 left-0 flex-col-reverse gap-1"
                : "flex-col gap-1.5",
        )}
      >
        <div className={cn("flex", isMobile ? (isSearch ? "flex-col gap-1" : "flex-col-reverse gap-1") : "flex-row gap-1.5")}>
          {(Object.keys(MAP_STYLE_OPTIONS) as MapStyle[]).map((key) => {
            const style = MAP_STYLE_OPTIONS[key];
            const isSelected = mapStyle === key;
            const thumbnail = key === "carto" ? cartoThumbnail : style.thumbnail;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectStyle(key)}
                className={cn(
                  "flex items-center group cursor-pointer",
                  isMobile ? "flex-row gap-2 px-1 py-0.5 rounded-md hover:bg-muted/50" : "flex-col gap-0.5",
                )}
              >
                <div
                  className={cn(
                    "rounded-md overflow-hidden border-2 transition-colors shrink-0",
                    isMobile ? "w-8 h-8" : "w-12 h-12",
                    isSelected ? "border-primary" : "border-transparent group-hover:border-muted-foreground/50",
                  )}
                >
                  <img src={thumbnail} alt={style.label} className="w-full h-full object-cover" />
                </div>
                <span className={cn("font-medium", isMobile ? "text-xs" : "text-[10px]", isSelected ? "text-foreground" : "text-muted-foreground")}>
                  {style.label}
                </span>
              </button>
            );
          })}
        </div>

        {mapStyle === "carto" && (
          <div className={cn("flex items-center gap-1", isMobile ? (isSearch ? "border-t pt-1.5" : "border-b pb-1.5") : "border-t pt-1.5")}>
            {!isMobile && (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-foreground/70 mr-0.5">{t("overlay.mapVariant")}</span>
            )}
            {(Object.keys(CARTO_VARIANT_LABELS) as CartoVariant[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updatePreferences({ cartoVariant: v });
                }}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  preferences.cartoVariant === v ? "bg-primary/15 text-primary font-medium" : "hover:bg-muted text-muted-foreground",
                )}
              >
                {CARTO_VARIANT_LABELS[v]}
              </button>
            ))}
          </div>
        )}
      </div>
    );

    if (isNav) {
      return (
        <>
          {trigger}
          {typeof document === "undefined" ? null : createPortal(picker, document.body)}
        </>
      );
    }

    if (isSearch) {
      return (
        <>
          {trigger}
          {picker}
        </>
      );
    }

    return picker;
  }

  return trigger;
}
