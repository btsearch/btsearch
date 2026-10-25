import type { ObservedSiteEvidence } from "@openbts/shared/contract";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import { TA_BUCKET_METERS } from "../map/geometry";
import { type EvidenceOverlay, TA_COLORS, listZoneColors } from "../map/palette";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LevelLegend } from "@/features/map/crowd/card/crowdLegend";
import type { TileStatus } from "@/features/map/crowd/layers/useVectorFillLayer";
import type { CrowdTheme } from "@/features/map/crowd/style/palette";
import { formatDistance } from "@/lib/format";

type LayerKey = "grid" | "ta" | "readings" | "places";
export type LayerToggles = Record<LayerKey, boolean>;

type ReadingsState = { status: TileStatus; retry: () => void };

type EvidenceLayersPanelProps = {
  toggles: LayerToggles;
  evidence: ObservedSiteEvidence;
  onToggle: (key: LayerKey) => void;
};

type LayerRowProps = {
  label: string;
  count: string;
  isOn: boolean;
  isDisabled: boolean;
  onToggle: () => void;
};

type EvidenceLegendProps = {
  toggles: LayerToggles;
  evidence: ObservedSiteEvidence;
  overlay: EvidenceOverlay;
  theme: CrowdTheme;
  readings: ReadingsState;
  isAdmin: boolean;
};

type LegendSectionProps = {
  title: string;
  children: ReactNode;
};

const LAYER_KEYS: readonly LayerKey[] = ["grid", "ta", "readings", "places"];
const LEGEND_LINE_CLASS = "flex items-center gap-2 text-muted-foreground";
const SWATCH_CLASS = "size-2.5 shrink-0 rounded-xs";

function countSquares(evidence: ObservedSiteEvidence): number {
  return new Set(evidence.timingAdvanceSquares.map((square) => `${square.latitude},${square.longitude}`)).size;
}

function LayerRow({ label, count, isOn, isDisabled, onToggle }: LayerRowProps) {
  const switchId = useId();

  return (
    <div className="flex h-8 items-center justify-between gap-2 rounded-md px-1.5 transition-colors hover:bg-muted/50">
      <label htmlFor={switchId} className="min-w-0 flex-1 cursor-pointer truncate text-sm">
        {label}
      </label>
      <span className="flex shrink-0 items-center gap-2">
        {count === "" ? null : <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
        <Switch id={switchId} checked={isOn} disabled={isDisabled} onCheckedChange={onToggle} className="cursor-pointer" />
      </span>
    </div>
  );
}

export function EvidenceLayersPanel({ toggles, evidence, onToggle }: EvidenceLayersPanelProps) {
  const { t } = useTranslation("admin");
  const squareCount = countSquares(evidence);
  const counts: Record<LayerKey, string> = {
    grid: "",
    ta: squareCount === 0 ? "" : t("observationFlags.evidence.layers.squares", { count: squareCount }),
    readings: "",
    places: String(evidence.candidates.length),
  };
  const isAvailable: Record<LayerKey, boolean> = {
    grid: evidence.grid !== null,
    ta: squareCount > 0,
    readings: evidence.cells.length > 0,
    places: evidence.candidates.length > 0,
  };

  return (
    <div className="absolute top-3 left-3 z-10 w-59 rounded-lg border bg-background/95 px-1.5 pt-2 pb-1.5 shadow-sm backdrop-blur-sm max-sm:w-52">
      <h2 className="px-1.5 pb-1 text-xs font-semibold text-muted-foreground">{t("observationFlags.evidence.layers.title")}</h2>
      {LAYER_KEYS.map((key) => (
        <LayerRow
          key={key}
          label={t(`observationFlags.evidence.layers.${key}`)}
          count={counts[key]}
          isOn={toggles[key] && isAvailable[key]}
          isDisabled={!isAvailable[key]}
          onToggle={() => onToggle(key)}
        />
      ))}
    </div>
  );
}

function LegendSection({ title, children }: LegendSectionProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-semibold">{title}</span>
      {children}
    </div>
  );
}

function ReadingsNote({ readings }: { readings: ReadingsState }) {
  const { t } = useTranslation(["admin", "common"]);

  if (readings.status === "error") {
    return (
      <span className="flex items-center justify-between gap-2 text-destructive">
        {t("observationFlags.evidence.legend.readingsError")}
        <Button type="button" variant="outline" size="xs" className="cursor-pointer" onClick={readings.retry}>
          {t("common:actions.retry")}
        </Button>
      </span>
    );
  }
  if (readings.status === "idle") return <span className="text-muted-foreground">{t("observationFlags.evidence.legend.readingsZoomIn")}</span>;
  if (readings.status === "empty") return <span className="text-muted-foreground">{t("observationFlags.evidence.legend.readingsEmpty")}</span>;
  return null;
}

export function EvidenceLegend({ toggles, evidence, overlay, theme, readings, isAdmin }: EvidenceLegendProps) {
  const { t, i18n } = useTranslation("admin");
  const zoneColors = listZoneColors(overlay);
  const showsGrid = toggles.grid && evidence.grid !== null;
  const showsSquares = toggles.ta && evidence.timingAdvanceSquares.length > 0;
  const showsReadings = toggles.readings && evidence.cells.length > 0;
  const [firstLimit, secondLimit, lastLimit] = TA_BUCKET_METERS;
  const taLabels = [
    t("observationFlags.evidence.legend.taUpTo", { distance: formatDistance(firstLimit, i18n.language) }),
    t("observationFlags.evidence.legend.taBetween", { from: firstLimit, to: formatDistance(secondLimit, i18n.language) }),
    t("observationFlags.evidence.legend.taBetween", { from: secondLimit, to: formatDistance(lastLimit, i18n.language) }),
    t("observationFlags.evidence.legend.taOver", { distance: formatDistance(lastLimit, i18n.language) }),
  ];

  return (
    <div
      role="note"
      aria-label={t("observationFlags.evidence.legend.title")}
      className="absolute right-2 bottom-7 z-10 flex w-62 flex-col gap-2.5 rounded-lg border bg-background/95 px-3 py-2.5 text-xs shadow-sm backdrop-blur-sm max-sm:hidden"
    >
      {evidence.fit === null ? null : (
        <LegendSection title={t("observationFlags.evidence.legend.estimate")}>
          <span className={LEGEND_LINE_CLASS}>
            <svg width="28" height="14" aria-hidden="true" className="shrink-0 rounded-[3px] bg-muted">
              <ellipse cx="14" cy="7" rx="12" ry="5.5" fill="none" stroke={overlay.ring} strokeWidth="1.75" />
              <circle cx="14" cy="7" r="3" fill="#ffffff" stroke={overlay.point} strokeWidth="2" />
            </svg>
            {t("observationFlags.evidence.legend.pointArea")}
          </span>
          <span className={LEGEND_LINE_CLASS}>
            <svg width="28" height="14" aria-hidden="true" className="shrink-0 rounded-[3px] bg-muted">
              <circle cx="14" cy="7" r="5.5" fill="none" stroke={overlay.ring} strokeWidth="1.25" strokeDasharray="3 3" />
            </svg>
            {t("observationFlags.evidence.legend.radius")}
          </span>
        </LegendSection>
      )}
      {showsGrid ? (
        <LegendSection title={t("observationFlags.evidence.layers.grid")}>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {t("observationFlags.evidence.legend.more")}
            <span aria-hidden="true" className="flex overflow-hidden rounded-[3px]">
              {zoneColors.map((color) => (
                <span key={color} className="h-2.5 w-5.5" style={{ background: color }} />
              ))}
            </span>
            {t("observationFlags.evidence.legend.less")}
          </span>
        </LegendSection>
      ) : null}
      {showsSquares ? (
        <LegendSection title={t("observationFlags.evidence.legend.ta")}>
          <span className="grid grid-cols-2 gap-x-2 gap-y-0.75 text-muted-foreground">
            {taLabels.map((label, index) => (
              <span key={label} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={SWATCH_CLASS} style={{ background: TA_COLORS[index] }} />
                {label}
              </span>
            ))}
          </span>
          {isAdmin ? null : <span className="text-muted-foreground">{t("observationFlags.evidence.legend.taPublicOnly")}</span>}
          {evidence.timingAdvanceSquaresTruncated ? (
            <span className="text-muted-foreground">{t("observationFlags.evidence.legend.taTruncated")}</span>
          ) : null}
        </LegendSection>
      ) : null}
      {showsReadings ? (
        <LegendSection title={t("observationFlags.evidence.legend.readings")}>
          <LevelLegend theme={theme} caption={t("observationFlags.evidence.legend.readingsCaption")} />
          <ReadingsNote readings={readings} />
        </LegendSection>
      ) : null}
    </div>
  );
}
