import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservedCellRecord } from "@openbts/shared/contract";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { CellRat } from "../types";
import { doesBearingDiffer } from "./measuredCells";
import { formatBandwidth, formatDecibels } from "./measurementFormat";
import { type DistanceRing, LEVEL_CHART_SCALE, SINR_CHART_SCALE, SignalDistanceChart } from "./signalDistanceChart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistance } from "@/lib/format";
import { cn } from "@/lib/utils";

type DetailItem = {
  key: string;
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  note?: string;
};

type RecordDetailsProps = {
  record: ObservedCellRecord;
  sectorAzimuth: number | null;
  isOutsideDatabase: boolean;
};

type DistanceChartsProps = {
  rat: CellRat;
  rings: NonNullable<ObservedCellRecord["geometry"]>["levelByDistance"];
  language: string;
};

type EdgeKind = NonNullable<ObservedCellRecord["edges"]>[number]["kind"];

const NOTE_CLASS = "flex items-start gap-1.5 text-xs leading-4 text-muted-foreground";
const EDGE_ORDER: readonly EdgeKind[] = ["handedOver", "faded", "otherLayer", "unmeasured"];
const EDGE_DASHES: Record<Exclude<EdgeKind, "unmeasured">, { dash?: string; cap: "butt" | "round" }> = {
  handedOver: { cap: "butt" },
  faded: { dash: "5 3", cap: "butt" },
  otherLayer: { dash: "0.5 3.5", cap: "round" },
};
const UNMEASURED_SQUARE_OPACITIES = [0.6, 0.35, 0.15];
const PCI_GROUP_SIZE = 3;

export function MeasurementNote({ text }: { text: string }) {
  return (
    <p className={cn(NOTE_CLASS, "shrink-0")}>
      <HugeiconsIcon icon={InformationCircleIcon} className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

export function DetailGrid({ items }: { items: readonly DetailItem[] }) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-3">
      {items.map((item) => (
        <div key={item.key} className="min-w-0">
          {item.hint === undefined ? (
            <span className="block text-xs leading-4 text-muted-foreground">{item.label}</span>
          ) : (
            <Tooltip>
              <TooltipTrigger className="block cursor-help text-left text-xs leading-4 text-muted-foreground">{item.label}</TooltipTrigger>
              <TooltipContent className="max-w-65">{item.hint}</TooltipContent>
            </Tooltip>
          )}
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-sm leading-5 font-medium tabular-nums">
            <span>{item.value}</span>
            {item.sub === undefined ? null : <span className="text-xs leading-4 font-normal text-muted-foreground">{item.sub}</span>}
          </div>
          {item.note === undefined ? null : (
            <p className={cn(NOTE_CLASS, "mt-0.5 gap-1")}>
              <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              <span>{item.note}</span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function listRecordItems(record: ObservedCellRecord, sectorAzimuth: number | null, language: string, t: TFunction): DetailItem[] {
  const items: DetailItem[] = [
    {
      key: "people",
      label: t("measurements.popover.measurements"),
      value: t("measurements.people", { count: record.personCount }),
      sub: t("measurements.popover.squares", { count: record.squareCount }),
    },
  ];
  const isSignalled = record.rat === "lte" || record.rat === "nr";
  if (isSignalled && record.bandwidthKhz !== null) {
    items.push({ key: "bandwidth", label: t("measurements.popover.bandwidth"), value: formatBandwidth(record.bandwidthKhz, language) });
  }
  if (isSignalled && record.pci !== null) {
    items.push({
      key: "pci",
      label: "PCI",
      value: String(record.pci),
      sub: record.rat === "lte" ? `mod 3: ${record.pci % PCI_GROUP_SIZE}` : undefined,
    });
  }

  const { geometry } = record;
  if (geometry === null) return items;

  const spread = t("measurements.spread", { degrees: Math.round(geometry.spreadDegrees) });
  items.push({
    key: "bearing",
    label: t("measurements.popover.bearing"),
    value: `${Math.round(geometry.bearingDegrees)}°`,
    sub: sectorAzimuth === null ? spread : `${spread} · ${t("measurements.popover.azimuth", { degrees: sectorAzimuth })}`,
    note: doesBearingDiffer(geometry, sectorAzimuth) ? t("measurements.bearingDiffers") : undefined,
  });
  items.push({
    key: "reach",
    label: t("measurements.popover.reach"),
    value: formatDistance(geometry.reachMeters, language),
    hint: t("measurements.popover.reachHint"),
  });
  if (geometry.reachByTimingAdvanceMeters !== null) {
    items.push({
      key: "reachByTa",
      label: t("measurements.popover.reachByTa"),
      value: formatDistance(geometry.reachByTimingAdvanceMeters, language),
      hint: t("measurements.popover.reachByTaHint"),
    });
  }
  const isNr = record.rat === "nr";
  if (geometry.meanRsrqDb !== null) {
    items.push({
      key: "rsrq",
      label: t("measurements.popover.meanRsrq", { metric: isNr ? "SS-RSRQ" : "RSRQ" }),
      value: formatDecibels(geometry.meanRsrqDb, language),
    });
  }
  if (geometry.meanSinrDb !== null) {
    items.push({
      key: "sinr",
      label: t("measurements.popover.meanSinr", { metric: isNr ? "SS-SINR" : "SINR" }),
      value: formatDecibels(geometry.meanSinrDb, language),
    });
  }
  return items;
}

export function RecordDetails({ record, sectorAzimuth, isOutsideDatabase }: RecordDetailsProps) {
  const { t, i18n } = useTranslation("stationDetails");
  const language = i18n.language;
  const { geometry } = record;
  const nodeName = record.rat === "lte" ? "eNBID" : "gNBID";
  let nodeId: number | null = null;
  if (record.rat === "lte") nodeId = record.enbid;
  else if (record.rat === "nr") nodeId = record.gnbid;

  return (
    <>
      {record.personCount < 2 ? <MeasurementNote text={t("measurements.popover.onePerson")} /> : null}
      {geometry === null ? <MeasurementNote text={t("measurements.popover.noShape")} /> : null}
      {isOutsideDatabase ? (
        <MeasurementNote
          text={
            nodeId === null
              ? t("measurements.popover.outsideDatabase")
              : t("measurements.popover.outsideDatabaseByNode", { node: nodeName, id: nodeId })
          }
        />
      ) : null}
      <DetailGrid items={listRecordItems(record, sectorAzimuth, language, t)} />
      {geometry === null || geometry.levelByDistance.length === 0 ? null : (
        <DistanceCharts rat={record.rat} rings={geometry.levelByDistance} language={language} />
      )}
      {geometry === null ? null : <EdgeLengths record={record} />}
    </>
  );
}

function DistanceCharts({ rat, rings, language }: DistanceChartsProps) {
  const { t } = useTranslation("stationDetails");
  const sinrMetric = rat === "nr" ? "SS-SINR" : "SINR";
  const levelRings: DistanceRing[] = rings.map((ring) => ({ fromMeters: ring.fromMeters, toMeters: ring.toMeters, value: ring.meanDbm }));
  const sinrRings: DistanceRing[] = rings.flatMap((ring) =>
    ring.meanSinrDb === null ? [] : [{ fromMeters: ring.fromMeters, toMeters: ring.toMeters, value: ring.meanSinrDb }],
  );
  const formatLevel = (value: number) => `${Math.round(value)} dBm`;
  const formatSinr = (value: number) => formatDecibels(value, language);
  const first = levelRings[0];
  const last = levelRings[levelRings.length - 1];
  const maxMeters = Math.max(...levelRings.map((ring) => ring.toMeters));

  return (
    <div className="flex shrink-0 flex-col gap-3">
      <SignalDistanceChart
        caption={t("measurements.chart.level")}
        summary={t("measurements.chart.levelSummary", {
          from: formatLevel(first.value),
          to: formatLevel(last.value),
          distance: formatDistance(last.toMeters, language),
        })}
        rings={levelRings}
        maxMeters={maxMeters}
        scale={LEVEL_CHART_SCALE}
        formatValue={formatLevel}
        language={language}
      />
      {sinrRings.length === 0 ? null : (
        <SignalDistanceChart
          caption={t("measurements.chart.sinr", { metric: sinrMetric })}
          summary={t("measurements.chart.sinrSummary", {
            metric: sinrMetric,
            from: formatSinr(sinrRings[0].value),
            to: formatSinr(sinrRings[sinrRings.length - 1].value),
            distance: formatDistance(sinrRings[sinrRings.length - 1].toMeters, language),
          })}
          rings={sinrRings}
          maxMeters={maxMeters}
          scale={SINR_CHART_SCALE}
          formatValue={formatSinr}
          language={language}
        />
      )}
    </div>
  );
}

function EdgeSwatch({ kind }: { kind: EdgeKind }) {
  return (
    <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true" className="block shrink-0">
      {kind === "unmeasured" ? (
        UNMEASURED_SQUARE_OPACITIES.map((opacity, index) => (
          <rect key={opacity} x={1 + index * 6} y="2" width="4" height="4" opacity={opacity} style={{ fill: "var(--sector-color)" }} />
        ))
      ) : (
        <line
          x1="2"
          y1="4"
          x2="22"
          y2="4"
          strokeWidth="2"
          strokeLinecap={EDGE_DASHES[kind].cap}
          strokeDasharray={EDGE_DASHES[kind].dash}
          style={{ stroke: "var(--sector-color)" }}
        />
      )}
    </svg>
  );
}

function EdgeLengths({ record }: { record: ObservedCellRecord }) {
  const { t, i18n } = useTranslation("stationDetails");
  const edges = EDGE_ORDER.flatMap((kind) => {
    const length = (record.edges ?? []).filter((edge) => edge.kind === kind).reduce((sum, edge) => sum + edge.lengthMeters, 0);
    return length > 0 ? [{ kind, length }] : [];
  });
  if (edges.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border/60 pt-2.5">
      <p className="mb-0.5 text-xs leading-4 font-medium text-muted-foreground">{t("measurements.edges.title")}</p>
      {edges.map((edge) => (
        <div key={edge.kind} className="mt-1 flex min-w-0 items-center gap-2 text-xs leading-4">
          <EdgeSwatch kind={edge.kind} />
          <span className="min-w-0 flex-1">{t(`measurements.edges.${edge.kind}`)}</span>
          <span className="shrink-0 font-mono text-muted-foreground">{formatDistance(edge.length, i18n.language)}</span>
        </div>
      ))}
    </div>
  );
}
