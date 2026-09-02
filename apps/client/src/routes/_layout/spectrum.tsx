import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { getOperatorColor } from "@/lib/operatorUtils";
import { buildStaticPageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

type Operator = "plus" | "t-mobile" | "play" | "orange";
type NrStatus = "active" | "deployment" | "lte-only" | "gsm-lte";

const BG: Record<Operator, string> = {
  plus: getOperatorColor(26001),
  "t-mobile": getOperatorColor(26002),
  orange: getOperatorColor(26003),
  play: getOperatorColor(26006),
};

const TEXT: Record<Operator, string> = {
  plus: "#0d1a10",
  "t-mobile": "#ffffff",
  play: "#ffffff",
  orange: "#1a0d00",
};

const DISPLAY: Record<Operator, string> = {
  plus: "Plus",
  "t-mobile": "T-Mobile",
  play: "Play",
  orange: "Orange",
};

const NR_BADGE_CLASS: Record<NrStatus, string> = {
  active: "bg-primary/10 text-primary",
  deployment: "bg-chart-2/15 text-chart-2",
  "lte-only": "bg-muted text-muted-foreground",
  "gsm-lte": "bg-muted text-muted-foreground",
};

const NR_BADGE_KEY: Record<NrStatus, string> = {
  active: "badges.active",
  deployment: "badges.deployment",
  "lte-only": "badges.lteOnly",
  "gsm-lte": "badges.gsmLte",
};

interface Block {
  operator: Operator;
  startMhz: number;
  endMhz: number;
  note?: string;
}

interface SpectrumRow {
  label: string;
  rangeStart: number;
  rangeEnd: number;
  blocks: Block[];
}

interface Band {
  id: string;
  freqMhz: string;
  bandName?: string;
  standard: string;
  technology: string;
  nrStatus: NrStatus;
  maxBw?: string;
  rows: SpectrumRow[];
  summary: Partial<Record<Operator, string>>;
}

const BANDS: Band[] = [
  {
    id: "n78",
    freqMhz: "3500 MHz",
    bandName: "IMT-2020",
    standard: "n78",
    technology: "NR 5G NSA · TDD",
    nrStatus: "active",
    maxBw: "400 MHz",
    rows: [
      {
        label: "TDD\n3400-3800 MHz",
        rangeStart: 3400,
        rangeEnd: 3800,
        blocks: [
          { operator: "plus", startMhz: 3400, endMhz: 3500 },
          { operator: "play", startMhz: 3500, endMhz: 3600 },
          { operator: "orange", startMhz: 3600, endMhz: 3700 },
          { operator: "t-mobile", startMhz: 3700, endMhz: 3800 },
        ],
      },
    ],
    summary: { plus: "100 MHz", play: "100 MHz", orange: "100 MHz", "t-mobile": "100 MHz" },
  },
  {
    id: "b3",
    freqMhz: "1800 MHz",
    bandName: "1800 DCS",
    standard: "B3",
    technology: "LTE · FDD",
    nrStatus: "lte-only",
    maxBw: "2x75 MHz",
    rows: [
      {
        label: "FDD UL\n1710-1785 MHz",
        rangeStart: 1710,
        rangeEnd: 1785,
        blocks: [
          { operator: "plus", startMhz: 1710, endMhz: 1740 },
          { operator: "t-mobile", startMhz: 1740, endMhz: 1760 },
          { operator: "orange", startMhz: 1760, endMhz: 1770 },
          { operator: "play", startMhz: 1770, endMhz: 1785 },
        ],
      },
      {
        label: "FDD DL\n1805-1880 MHz",
        rangeStart: 1805,
        rangeEnd: 1880,
        blocks: [
          { operator: "plus", startMhz: 1805, endMhz: 1835 },
          { operator: "t-mobile", startMhz: 1835, endMhz: 1855 },
          { operator: "orange", startMhz: 1855, endMhz: 1865 },
          { operator: "play", startMhz: 1865, endMhz: 1880 },
        ],
      },
    ],
    summary: { plus: "2x30 MHz", "t-mobile": "2x20 MHz", play: "2x15 MHz", orange: "2x10 MHz" },
  },
  {
    id: "b1",
    freqMhz: "2100 MHz",
    bandName: "2100 IMT",
    standard: "n1 / B1",
    technology: "UMTS / LTE / NR 5G DSS · FDD",
    nrStatus: "active",
    maxBw: "2x60 MHz",
    rows: [
      {
        label: "FDD UL\n1920-1980 MHz",
        rangeStart: 1920,
        rangeEnd: 1980,
        blocks: [
          { operator: "orange", startMhz: 1920, endMhz: 1935 },
          { operator: "t-mobile", startMhz: 1935, endMhz: 1950 },
          { operator: "plus", startMhz: 1950, endMhz: 1965 },
          { operator: "play", startMhz: 1965, endMhz: 1980 },
        ],
      },
      {
        label: "FDD DL\n2110-2170 MHz",
        rangeStart: 2110,
        rangeEnd: 2170,
        blocks: [
          { operator: "orange", startMhz: 2110, endMhz: 2125 },
          { operator: "t-mobile", startMhz: 2125, endMhz: 2140 },
          { operator: "plus", startMhz: 2140, endMhz: 2155 },
          { operator: "play", startMhz: 2155, endMhz: 2170 },
        ],
      },
    ],
    summary: { orange: "2x15 MHz", "t-mobile": "2x15 MHz", plus: "2x15 MHz", play: "2x15 MHz" },
  },
  {
    id: "n41",
    freqMhz: "TD-2600",
    bandName: "TD-2600",
    standard: "n41 / B38",
    technology: "LTE TDD / NR 5G NSA · TDD",
    nrStatus: "active",
    maxBw: "50 MHz",
    rows: [
      {
        label: "TDD\n2570-2620 MHz",
        rangeStart: 2570,
        rangeEnd: 2620,
        blocks: [{ operator: "plus", startMhz: 2570, endMhz: 2620 }],
      },
    ],
    summary: { plus: "50 MHz" },
  },
  {
    id: "n28",
    freqMhz: "700 MHz",
    bandName: "700 APT",
    standard: "n28 / B28",
    technology: "NR 5G · FDD",
    nrStatus: "active",
    maxBw: "2x45 MHz",
    rows: [
      {
        label: "FDD UL\n703-748 MHz",
        rangeStart: 703,
        rangeEnd: 748,
        blocks: [
          { operator: "t-mobile", startMhz: 703, endMhz: 708 },
          { operator: "orange", startMhz: 708, endMhz: 718 },
          { operator: "plus", startMhz: 718, endMhz: 723 },
          { operator: "play", startMhz: 723, endMhz: 733 },
        ],
      },
      {
        label: "FDD DL\n758-803 MHz",
        rangeStart: 758,
        rangeEnd: 803,
        blocks: [
          { operator: "t-mobile", startMhz: 758, endMhz: 763 },
          { operator: "orange", startMhz: 763, endMhz: 773 },
          { operator: "plus", startMhz: 773, endMhz: 778 },
          { operator: "play", startMhz: 778, endMhz: 788 },
        ],
      },
    ],
    summary: { orange: "2x10 MHz", play: "2x10 MHz", "t-mobile": "2x5 MHz", plus: "2x5 MHz" },
  },
  {
    id: "b20",
    freqMhz: "800 MHz",
    bandName: "800 DD",
    standard: "B20",
    technology: "LTE · FDD",
    nrStatus: "lte-only",
    maxBw: "2x30 MHz",
    rows: [
      {
        label: "FDD DL\n791-821 MHz",
        rangeStart: 791,
        rangeEnd: 821,
        blocks: [
          { operator: "orange", startMhz: 791, endMhz: 801 },
          { operator: "play", startMhz: 801, endMhz: 806 },
          { operator: "t-mobile", startMhz: 806, endMhz: 821 },
        ],
      },
      {
        label: "FDD UL\n832-862 MHz",
        rangeStart: 832,
        rangeEnd: 862,
        blocks: [
          { operator: "orange", startMhz: 832, endMhz: 842 },
          { operator: "play", startMhz: 842, endMhz: 847 },
          { operator: "t-mobile", startMhz: 847, endMhz: 862 },
        ],
      },
    ],
    summary: { "t-mobile": "2x15 MHz", orange: "2x10 MHz", play: "2x5 MHz" },
  },
  {
    id: "b8",
    freqMhz: "900 MHz",
    bandName: "900 GSM",
    standard: "B8",
    technology: "GSM / LTE · FDD",
    nrStatus: "gsm-lte",
    maxBw: "2x35 MHz",
    rows: [
      {
        label: "FDD UL\n880-915 MHz",
        rangeStart: 880,
        rangeEnd: 915,
        blocks: [
          { operator: "plus", startMhz: 885.1, endMhz: 899.1 },
          { operator: "t-mobile", startMhz: 899.1, endMhz: 908.1 },
          { operator: "orange", startMhz: 908.1, endMhz: 914.9 },
          { operator: "play", startMhz: 880.1, endMhz: 885.1 },
        ],
      },
      {
        label: "FDD DL\n925-960 MHz",
        rangeStart: 925,
        rangeEnd: 960,
        blocks: [
          { operator: "plus", startMhz: 930.1, endMhz: 944.1 },
          { operator: "t-mobile", startMhz: 944.1, endMhz: 953.1 },
          { operator: "orange", startMhz: 953.1, endMhz: 959.9 },
          { operator: "play", startMhz: 925.1, endMhz: 930.1 },
        ],
      },
    ],
    summary: { plus: "2x14 MHz", "t-mobile": "2x9 MHz", orange: "2x6.8 MHz", play: "2x5 MHz" },
  },
  {
    id: "b7",
    freqMhz: "2600 MHz",
    bandName: "2600 FDD",
    standard: "B7",
    technology: "LTE · FDD",
    nrStatus: "lte-only",
    maxBw: "2x70 MHz",
    rows: [
      {
        label: "FDD UL\n2500-2570 MHz",
        rangeStart: 2500,
        rangeEnd: 2570,
        blocks: [
          { operator: "plus", startMhz: 2500, endMhz: 2520 },
          { operator: "orange", startMhz: 2520, endMhz: 2535 },
          { operator: "t-mobile", startMhz: 2535, endMhz: 2550 },
          { operator: "play", startMhz: 2550, endMhz: 2570 },
        ],
      },
      {
        label: "FDD DL\n2620-2690 MHz",
        rangeStart: 2620,
        rangeEnd: 2690,
        blocks: [
          { operator: "plus", startMhz: 2620, endMhz: 2640 },
          { operator: "orange", startMhz: 2640, endMhz: 2655 },
          { operator: "t-mobile", startMhz: 2655, endMhz: 2670 },
          { operator: "play", startMhz: 2670, endMhz: 2690 },
        ],
      },
    ],
    summary: { plus: "2x20 MHz", play: "2x20 MHz", orange: "2x15 MHz", "t-mobile": "2x15 MHz" },
  },
];

const NR_BANDS = BANDS.filter((b) => b.nrStatus === "active" || b.nrStatus === "deployment");
const LTE_BANDS = BANDS.filter((b) => b.nrStatus === "lte-only" || b.nrStatus === "gsm-lte");

type Segment = { kind: "block"; block: Block; pct: number } | { kind: "gap"; startMhz: number; endMhz: number; pct: number };

function buildSegments(row: SpectrumRow): Segment[] {
  const totalRange = row.rangeEnd - row.rangeStart;
  const sorted = [...row.blocks].sort((a, b) => a.startMhz - b.startMhz);
  const segments: Segment[] = [];
  let cursor = row.rangeStart;

  for (const block of sorted) {
    if (block.startMhz > cursor + 0.001) {
      const gap = block.startMhz - cursor;
      segments.push({ kind: "gap", startMhz: cursor, endMhz: block.startMhz, pct: (gap / totalRange) * 100 });
    }
    segments.push({ kind: "block", block, pct: ((block.endMhz - block.startMhz) / totalRange) * 100 });
    cursor = block.endMhz;
  }
  if (cursor < row.rangeEnd - 0.001) {
    const gap = row.rangeEnd - cursor;
    segments.push({ kind: "gap", startMhz: cursor, endMhz: row.rangeEnd, pct: (gap / totalRange) * 100 });
  }
  return segments;
}

function SpectrumBar({ row }: { row: SpectrumRow }) {
  const { t } = useTranslation("spectrum");
  const segments = buildSegments(row);

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
      <div className="sm:w-32 sm:shrink-0 text-[11px] leading-snug text-muted-foreground sm:pt-2 whitespace-pre-line">{row.label}</div>
      <div className="flex-1 min-w-0">
        <div>
          <div className="flex h-9 rounded-md overflow-hidden ring-1 ring-border/50">
            {segments.map((seg, i) => {
              if (seg.kind === "gap") {
                return (
                  <div
                    key={i}
                    style={{ width: `${seg.pct}%`, flexShrink: 0 }}
                    className={cn("h-full bg-muted/40", seg.pct > 1.5 && "border-x border-dashed border-border/50")}
                  />
                );
              }
              const { block, pct } = seg;
              const mhzW = block.endMhz - block.startMhz;
              const label = Number.isInteger(mhzW) ? String(mhzW) : mhzW.toFixed(1);
              const noteDisplay = block.note ? t(block.note) : undefined;
              return (
                <div
                  key={i}
                  style={{ width: `${pct}%`, backgroundColor: BG[block.operator], color: TEXT[block.operator], flexShrink: 0 }}
                  className="h-full flex flex-col items-center justify-center overflow-hidden"
                  title={`${DISPLAY[block.operator]}${noteDisplay ? ` (${noteDisplay})` : ""}: ${label} MHz (${block.startMhz}-${block.endMhz})`}
                >
                  {pct > 3.5 ? <span className="text-[10px] font-semibold leading-none">{label}</span> : null}
                </div>
              );
            })}
          </div>
          <div className="flex mt-0.5">
            {segments.map((seg, i) => {
              if (seg.kind === "gap")
                return (
                  <div key={i} style={{ width: `${seg.pct}%`, flexShrink: 0 }} className="overflow-hidden text-center">
                    {seg.pct > 4 ? (
                      <span className="text-[10px] text-muted-foreground leading-none whitespace-nowrap">
                        {seg.startMhz}-{seg.endMhz}
                      </span>
                    ) : null}
                  </div>
                );
              const { block, pct } = seg;
              const noteDisplay = block.note ? t(block.note) : undefined;
              return (
                <div key={i} style={{ width: `${pct}%`, flexShrink: 0 }} className="overflow-hidden text-center">
                  {pct > 4 ? (
                    <span className="text-[10px] text-muted-foreground leading-none whitespace-nowrap">
                      {block.startMhz}-{block.endMhz}
                    </span>
                  ) : null}
                  {noteDisplay && pct > 4 ? (
                    <span className="block text-[10px] text-foreground font-medium leading-none mt-0.5 truncate px-0.5">{noteDisplay}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BandSection({ band }: { band: Band }) {
  const { t } = useTranslation("spectrum");
  const nrNote = t(`bands.${band.id}.nrNote`, { defaultValue: "" });
  const auctionInfo = t(`bands.${band.id}.auctionInfo`, { defaultValue: "" });
  const validUntil = t(`bands.${band.id}.validUntil`, { defaultValue: "" });
  const notes = t(`bands.${band.id}.notes`, { defaultValue: "" });

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-bold leading-none">{band.freqMhz}</h2>
          <span className="text-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded leading-none">{band.standard}</span>
          <span className={cn("text-xs px-1.5 py-0.5 rounded leading-none", NR_BADGE_CLASS[band.nrStatus])}>{t(NR_BADGE_KEY[band.nrStatus])}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {band.bandName ? (
            <>
              <span>{band.bandName}</span>
              <span>·</span>
            </>
          ) : null}
          <span>{band.technology}</span>
          {band.maxBw ? (
            <>
              <span>·</span>
              <span>
                {t("maxBwPrefix")} {band.maxBw}
              </span>
            </>
          ) : null}
        </div>
        {auctionInfo || validUntil ? <p className="text-xs text-muted-foreground">{[auctionInfo, validUntil].filter(Boolean).join(" · ")}</p> : null}
        {nrNote ? <p className="text-xs text-muted-foreground italic">{nrNote}</p> : null}
      </div>

      <div className="space-y-5">
        {band.rows.map((row) => (
          <SpectrumBar key={row.label} row={row} />
        ))}
      </div>

      {notes ? <p className="text-xs italic text-muted-foreground">{notes}</p> : null}

      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border">
        {(Object.entries(band.summary) as [Operator, string][]).map(([op, bw]) => (
          <span key={op} className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded px-2 py-0.5 bg-muted">
            <span className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: BG[op] }} />
            {DISPLAY[op]}
            <span className="text-muted-foreground">{bw}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">{title}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function SpectrumPage() {
  const { t } = useTranslation("spectrum");

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <div className="space-y-3">
          <SectionDivider title="NR 5G" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {NR_BANDS.map((band) => (
              <BandSection key={band.id} band={band} />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <SectionDivider title="LTE / GSM" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {LTE_BANDS.map((band) => (
              <BandSection key={band.id} band={band} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/spectrum")({
  component: SpectrumPage,
  head: () => buildStaticPageHead("/spectrum"),
  staticData: {
    titleKey: "items.spectrum",
    i18nNamespace: "nav",
  },
});
