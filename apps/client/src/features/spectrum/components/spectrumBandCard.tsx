import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SpectrumHolding } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { formatMhz, formatRange, formatWidth, readableTextColor, sourceLink } from "../format";
import { type KhzRange, type PlacedHolding, type SpectrumSection, widthKhz } from "../model";
import { BrandMark } from "@/components/cellular/brandMark";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatShortUtcDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type SpectrumBandCardProps = {
  section: SpectrumSection;
  highlightedOperatorId: number | null;
  regionNames: ReadonlyMap<number, string>;
};

type BarRow = { label: string; range: KhzRange; rangeOf: (holding: SpectrumHolding) => KhzRange | null };

type Segment = { key: string; range: KhzRange; percent: number; placed: PlacedHolding | null };

const LABEL_MIN_PERCENT = 3.5;
const TICK_MIN_PERCENT = 4;
const GAP_BORDER_MIN_PERCENT = 1.5;
const UPCOMING_HATCH = "repeating-linear-gradient(135deg, transparent 0 6px, rgb(0 0 0 / 0.45) 6px 10px)";

function gapSegment(low: number, high: number, span: number): Segment {
  return { key: `gap-${low}`, range: [low, high], percent: ((high - low) / span) * 100, placed: null };
}

function buildSegments(row: BarRow, holdings: readonly PlacedHolding[]): Segment[] {
  const span = widthKhz(row.range);
  const segments: Segment[] = [];
  let cursor = row.range[0];

  const placedRanges = holdings
    .map((placed) => ({ placed, range: row.rangeOf(placed.holding) }))
    .filter((entry): entry is { placed: PlacedHolding; range: KhzRange } => entry.range !== null)
    .sort((left, right) => left.range[0] - right.range[0]);

  for (const { placed, range } of placedRanges) {
    if (range[0] > cursor) segments.push(gapSegment(cursor, range[0], span));
    segments.push({ key: `holding-${placed.holding.id}`, range, percent: (widthKhz(range) / span) * 100, placed });
    cursor = Math.max(cursor, range[1]);
  }
  if (cursor < row.range[1]) segments.push(gapSegment(cursor, row.range[1], span));
  return segments;
}

function HoldingDetails({ placed, section }: { placed: PlacedHolding; section: SpectrumSection }) {
  const { t, i18n } = useTranslation("spectrum");
  const { holding, operator } = placed;
  const source = holding.source === null ? null : (sourceLink(holding.source) ?? holding.source);

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <BrandMark brand={operator.brand} />
        <span className="truncate font-semibold">{operator.name}</span>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{section.duplex === "tdd" ? t("band.tdd") : t("band.downlink")}</dt>
        <dd className="font-mono tabular-nums">{formatRange(t, holding.downlinkKhz)}</dd>
        {holding.uplinkKhz === null ? null : (
          <>
            <dt className="text-muted-foreground">{t("band.uplink")}</dt>
            <dd className="font-mono tabular-nums">{formatRange(t, holding.uplinkKhz)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("holding.width")}</dt>
        <dd className="font-mono tabular-nums">{formatWidth(t, widthKhz(holding.downlinkKhz), holding.uplinkKhz !== null)}</dd>
        {holding.validFrom === null ? null : (
          <>
            <dt className="text-muted-foreground">{t("holding.validFrom")}</dt>
            <dd className="tabular-nums">{formatShortUtcDate(holding.validFrom, i18n.language)}</dd>
          </>
        )}
        {holding.validTo === null ? null : (
          <>
            <dt className="text-muted-foreground">{t("holding.validTo")}</dt>
            <dd className="tabular-nums">{formatShortUtcDate(holding.validTo, i18n.language)}</dd>
          </>
        )}
        {source === null ? null : (
          <>
            <dt className="text-muted-foreground">{t("holding.source")}</dt>
            <dd className="min-w-0 truncate">
              {typeof source === "string" ? (
                source
              ) : (
                <a
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-0.5 text-primary underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:decoration-current"
                >
                  <span className="truncate">{source.label}</span>
                  <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3 shrink-0" aria-hidden="true" />
                </a>
              )}
            </dd>
          </>
        )}
      </dl>
    </>
  );
}

type HoldingBlockProps = { placed: PlacedHolding; range: KhzRange; percent: number; section: SpectrumSection; isDimmed: boolean };

function HoldingBlock({ placed, range, percent, section, isDimmed }: HoldingBlockProps) {
  const { t } = useTranslation("spectrum");
  const showsWidth = percent > LABEL_MIN_PERCENT && !isDimmed && !placed.isUpcoming;
  const width = formatMhz(widthKhz(range));
  const title = t("holding.blockLabel", { name: placed.operator.name, width, range: formatRange(t, range) });

  return (
    <Popover>
      <PopoverTrigger
        aria-label={title}
        title={title}
        style={{
          width: `${percent}%`,
          backgroundColor: placed.operator.color,
          backgroundImage: placed.isUpcoming ? UPCOMING_HATCH : undefined,
          color: readableTextColor(placed.operator.color),
        }}
        className={cn(
          "flex h-full shrink-0 cursor-pointer items-center justify-center overflow-hidden text-[10px] font-semibold leading-none outline-none",
          "transition-opacity focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground",
          "data-popup-open:ring-2 data-popup-open:ring-inset data-popup-open:ring-foreground",
          isDimmed && "opacity-25",
        )}
      >
        {showsWidth ? width : null}
      </PopoverTrigger>
      <PopoverContent align="start">
        <HoldingDetails placed={placed} section={section} />
      </PopoverContent>
    </Popover>
  );
}

function SpectrumBar({ row, section, highlightedOperatorId }: { row: BarRow; section: SpectrumSection; highlightedOperatorId: number | null }) {
  const { t } = useTranslation("spectrum");
  const segments = buildSegments(row, section.barHoldings);

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
      <div className="text-[11px] leading-snug text-muted-foreground sm:w-32 sm:shrink-0 sm:pt-1">
        <span className="font-medium text-foreground sm:block">{row.label}</span> {formatRange(t, row.range)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex h-9 overflow-hidden rounded-md ring-1 ring-border/50">
          {segments.map((segment) =>
            segment.placed === null ? (
              <div
                key={segment.key}
                style={{ width: `${segment.percent}%` }}
                className={cn("h-full shrink-0 bg-muted/40", segment.percent > GAP_BORDER_MIN_PERCENT && "border-x border-dashed border-border/50")}
              />
            ) : (
              <HoldingBlock
                key={segment.key}
                placed={segment.placed}
                range={segment.range}
                percent={segment.percent}
                section={section}
                isDimmed={highlightedOperatorId !== null && highlightedOperatorId !== segment.placed.operator.id}
              />
            ),
          )}
        </div>
        <div aria-hidden="true" className="mt-0.5 flex">
          {segments.map((segment) => (
            <div key={segment.key} style={{ width: `${segment.percent}%` }} className="shrink-0 overflow-hidden text-center">
              {segment.percent > TICK_MIN_PERCENT ? (
                <span className="whitespace-nowrap text-[10px] leading-none text-muted-foreground">
                  {formatMhz(segment.range[0])}-{formatMhz(segment.range[1])}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OperatorChips({ section }: { section: SpectrumSection }) {
  const { t } = useTranslation("spectrum");
  const isPaired = section.uplinkKhz !== null;
  const chips = new Map<number, { placed: PlacedHolding; khz: number; validTo: Set<string | null> }>();

  for (const placed of section.barHoldings) {
    if (placed.isUpcoming) continue;
    const chip = chips.get(placed.operator.id) ?? { placed, khz: 0, validTo: new Set<string | null>() };
    chip.khz += widthKhz(placed.holding.downlinkKhz);
    chip.validTo.add(placed.holding.validTo);
    chips.set(placed.operator.id, chip);
  }

  return (
    <div className="mt-auto flex flex-wrap gap-1.5 border-t border-border pt-3">
      {[...chips.values()].map(({ placed, khz, validTo }) => {
        const sharedValidTo = validTo.size === 1 ? ([...validTo][0] ?? null) : null;
        return (
          <span key={placed.operator.id} className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5 text-[11px] font-medium">
            <BrandMark brand={placed.operator.brand} size={14} />
            {placed.operator.name}
            <span className="text-muted-foreground tabular-nums">{formatWidth(t, khz, isPaired)}</span>
            {sharedValidTo === null ? null : (
              <span className="text-muted-foreground tabular-nums">{t("holding.until", { year: sharedValidTo.slice(0, 4) })}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

type HoldingListProps = { title: string; holdings: readonly PlacedHolding[]; noteOf: (holding: SpectrumHolding) => string | null };

function HoldingList({ title, holdings, noteOf }: HoldingListProps) {
  const { t } = useTranslation("spectrum");

  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium">{title}</h4>
      <ul className="divide-y rounded-md text-xs ring-1 ring-border">
        {holdings.map(({ holding, operator }) => (
          <li key={holding.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
              <BrandMark brand={operator.brand} size={14} />
              {operator.name}
            </span>
            <span className="font-mono text-muted-foreground tabular-nums">{formatRange(t, holding.downlinkKhz)}</span>
            <span className="ml-auto text-muted-foreground">{noteOf(holding)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SpectrumBandCard({ section, highlightedOperatorId, regionNames }: SpectrumBandCardProps) {
  const { t, i18n } = useTranslation("spectrum");
  const isPaired = section.uplinkKhz !== null;
  const duplex = section.duplex.toUpperCase();
  const bandKhz = widthKhz(section.downlinkKhz);
  const bandWidth = formatWidth(t, bandKhz, isPaired);
  const rows: BarRow[] =
    section.uplinkKhz === null
      ? [
          {
            label: section.duplex === "tdd" ? t("band.tdd") : t("band.downlink"),
            range: section.downlinkKhz,
            rangeOf: (holding) => holding.downlinkKhz,
          },
        ]
      : [
          { label: t("band.downlink"), range: section.downlinkKhz, rangeOf: (holding) => holding.downlinkKhz },
          { label: t("band.uplink"), range: section.uplinkKhz, rangeOf: (holding) => holding.uplinkKhz },
        ];

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold leading-none">
            {section.showsDuplex ? t("band.titleWithDuplex", { mhz: section.labelMhz, duplex }) : t("band.title", { mhz: section.labelMhz })}
          </h3>
          {section.codes.map((code) => (
            <span key={code} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs leading-none text-muted-foreground">
              {code}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {section.assignedKhz === bandKhz
            ? t("band.fullyAssigned", { duplex, width: bandWidth })
            : t("band.partlyAssigned", { duplex, width: bandWidth, assigned: formatWidth(t, section.assignedKhz, isPaired) })}
        </p>
      </header>
      <div className="space-y-5">
        {rows.map((row) => (
          <SpectrumBar key={row.label} row={row} section={section} highlightedOperatorId={highlightedOperatorId} />
        ))}
      </div>
      {section.laterHoldings.length > 0 ? (
        <HoldingList
          title={t("band.later")}
          holdings={section.laterHoldings}
          noteOf={(holding) =>
            holding.validFrom === null ? null : t("holding.from", { date: formatShortUtcDate(holding.validFrom, i18n.language) })
          }
        />
      ) : null}
      {section.regionalHoldings.length > 0 ? (
        <HoldingList
          title={t("band.regional")}
          holdings={section.regionalHoldings}
          noteOf={(holding) => (holding.regionId === null ? null : (regionNames.get(holding.regionId) ?? null))}
        />
      ) : null}
      <OperatorChips section={section} />
    </article>
  );
}
