import { AirportTowerIcon, Globe02Icon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ObservationFlag, StationCreate } from "@openbts/shared/contract";
import type { TFunction } from "i18next";

import { type FlagTextContext, formatBlockFields, formatDeviceModel, formatReaderVersion, getStationSubject } from "../model/flagText";
import { findBand, formatDegrees, getNodeCode, getOperatorName, getRatName, joinParts, joinWords, readItemNumber } from "../model/format";
import type { FlagOfKind } from "../model/kinds";
import { BrandMark } from "@/components/cellular/brandMark";
import { getEstimatedSiteName } from "@/features/map/crowd/sites/estimatedSites";
import { getOperatorLook } from "@/features/map/data/mapLookups";
import { formatBandMhzLabel, getBandCode } from "@/features/station-details/station/utils/bands";
import { RAT_ORDER } from "@/features/station-editing/model/ratFields";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type BoxRow = { label: string; value: string; hint: string | null; isMono: boolean; operatorId: number | null };

type ChangeBoxSpec = { icon: IconSvgElement; title: string; subtitle: string | null; rows: BoxRow[] };

type ChangeBoxProps = {
  box: ChangeBoxSpec;
  ctx: FlagTextContext;
};

const COORDINATE_DIGITS = 5;

function row(label: string, value: string, hint: string | null = null, isMono = false, operatorId: number | null = null): BoxRow {
  return { label, value, hint, isMono, operatorId };
}

function formatList(items: readonly string[], language: string): string {
  return new Intl.ListFormat(language, { type: "conjunction" }).format(items);
}

function describeCells(suggestion: StationCreate, ctx: FlagTextContext): { value: string; hint: string | null } {
  const cells = suggestion.cells ?? [];
  const counts = RAT_ORDER.flatMap((rat) => {
    const count = cells.filter((cell) => cell.rat === rat).length;
    return count === 0 ? [] : [`${count.toLocaleString(ctx.language)} ${getRatName(rat)}`];
  });
  const bandLabels = [...new Set(cells.flatMap((cell) => findBand(cell.bandId, ctx.lookups)?.labelMhz ?? []))]
    .sort((left, right) => left - right)
    .map((labelMhz) => formatBandMhzLabel(labelMhz, ctx.language));
  const nodeIds = [...new Set(cells.flatMap((cell) => readItemNumber(cell, cell.rat === "nr" ? "gnbid" : "enbid") ?? []))];
  const [firstCell] = cells;
  const nodes =
    firstCell === undefined || nodeIds.length === 0 ? null : `${getNodeCode(firstCell.rat)} ${formatList(nodeIds.map(String), ctx.language)}`;
  const bands = bandLabels.length === 0 ? null : formatList(bandLabels, ctx.language);
  const hint = joinWords([bands, nodes === null ? null : ctx.t("observationFlags.box.fromNodes", { nodes })]);
  return { value: counts.length === 0 ? "-" : counts.join(", "), hint };
}

function describeAzimuths(suggestion: StationCreate, ctx: FlagTextContext): BoxRow {
  const { t } = ctx;
  const azimuths = (suggestion.sectors ?? []).flatMap((sector) => (sector.azimuth === null ? [] : [formatDegrees(sector.azimuth)]));
  if (azimuths.length === 0) {
    return row(t("observationFlags.box.azimuths"), t("observationFlags.compare.none"), t("observationFlags.box.noAzimuthsHint"));
  }
  return row(t("observationFlags.box.azimuths"), azimuths.join(", "), t("observationFlags.box.azimuthsHint"));
}

function buildStationBox(flag: FlagOfKind<"unmatchedSite">, ctx: FlagTextContext): ChangeBoxSpec | null {
  const { t } = ctx;
  const { suggestion } = flag;
  if (suggestion === null) return null;
  const { operatorId, siteId } = suggestion.station;
  const siteName = flag.observedSite === null || flag.observedSite === undefined ? "" : getEstimatedSiteName(flag.observedSite);
  const { location } = suggestion;
  const cells = describeCells(suggestion, ctx);
  return {
    icon: AirportTowerIcon,
    title: t("observationFlags.box.newStation"),
    subtitle: t("observationFlags.box.newStationSubtitle"),
    rows: [
      row(t("common:labels.operator"), getOperatorName(operatorId, ctx.lookups) ?? "-", null, false, operatorId),
      siteId === undefined
        ? row(t("observationFlags.box.siteId"), t("observationFlags.compare.none"), t("observationFlags.box.noSiteIdHint", { name: siteName }))
        : row(t("observationFlags.box.siteId"), siteId, t("observationFlags.box.fromRegister"), true),
      ...(location === undefined
        ? []
        : [
            row(
              t("observationFlags.box.position"),
              `${location.latitude.toFixed(COORDINATE_DIGITS)}, ${location.longitude.toFixed(COORDINATE_DIGITS)}`,
              t("observationFlags.box.positionHint"),
              true,
            ),
          ]),
      row(t("observationFlags.box.cells"), cells.value, cells.hint),
      describeAzimuths(suggestion, ctx),
      row(t("common:labels.confirmed"), t("observationFlags.box.yes"), t("observationFlags.box.confirmedHint")),
    ],
  };
}

function buildSiteIdBox(flag: FlagOfKind<"siteIdKnown">, ctx: FlagTextContext): ChangeBoxSpec | null {
  const { t } = ctx;
  if (flag.suggestion === null) return null;
  return {
    icon: AirportTowerIcon,
    title: t("observationFlags.box.siteId"),
    subtitle: null,
    rows: [
      row(
        t("observationFlags.box.now"),
        t("observationFlags.box.temporary"),
        t("observationFlags.box.shownAs", { name: getStationSubject(flag).text }),
      ),
      row(t("observationFlags.box.after"), flag.suggestion.siteId, t("observationFlags.box.fromRegister"), true),
    ],
  };
}

function buildReadingBlockBox(flag: FlagOfKind<"readerQuirk">, ctx: FlagTextContext): ChangeBoxSpec | null {
  const { t } = ctx;
  const block = flag.suggestion?.readingBlock;
  if (block === undefined) return null;
  const { deviceModel, readerVersion } = flag.evidence;
  return {
    icon: SmartPhone01Icon,
    title: t("observationFlags.box.readingBlock"),
    subtitle: null,
    rows: [
      deviceModel === null
        ? row(t("observationFlags.box.reader"), formatReaderVersion(readerVersion))
        : row(t("observationFlags.box.phones"), formatDeviceModel(deviceModel)),
      row(t("observationFlags.facts.field"), formatBlockFields(block.fields)),
      row(t("observationFlags.facts.values"), t(`observationFlags.box.blockMode.${block.mode}`), t("observationFlags.box.reasonHint")),
    ],
  };
}

function buildBandBox(flag: FlagOfKind<"bandNotInPlan">, ctx: FlagTextContext): ChangeBoxSpec | null {
  const { t, language } = ctx;
  const band = findBand(flag.suggestion?.bandId, ctx.lookups);
  if (band === undefined) return null;
  const country = flag.countryCode === null ? "" : getCountryName(flag.countryCode, language);
  const megahertz = band.labelMhz === null ? null : `${formatBandMhzLabel(band.labelMhz, language)} MHz`;
  return {
    icon: Globe02Icon,
    title: t("observationFlags.box.bandPlan", { country }),
    subtitle: null,
    rows: [row(t("observationFlags.box.addBand"), getBandCode(band) ?? band.name, joinParts([getRatName(flag.evidence.rat), megahertz]), true)],
  };
}

export function buildChangeBox(flag: ObservationFlag, ctx: FlagTextContext): ChangeBoxSpec | null {
  if (flag.status !== "open") return null;
  switch (flag.kind) {
    case "unmatchedSite":
      return buildStationBox(flag, ctx);
    case "siteIdKnown":
      return buildSiteIdBox(flag, ctx);
    case "readerQuirk":
      return buildReadingBlockBox(flag, ctx);
    case "bandNotInPlan":
      return buildBandBox(flag, ctx);
    default:
      return null;
  }
}

export function getChangeTitle(flag: ObservationFlag, t: TFunction): string {
  if (flag.status === "open" && flag.kind === "readerQuirk") return t("observationFlags.change.readingBlock");
  if (flag.status === "open" && flag.kind === "unmatchedSite") return t("observationFlags.change.station");
  return t("observationFlags.change.title");
}

export function getNoneText(flag: ObservationFlag, t: TFunction): string | null {
  if (flag.status === "dismissed") return t("observationFlags.none.dismissed");
  if (flag.status === "resolved") return t("observationFlags.none.resolved");
  switch (flag.kind) {
    case "positionDiffers":
    case "bearingDiffers":
    case "possiblyDecommissioned":
    case "positionShifts":
    case "untrustedContributor":
    case "deviceRevoked":
    case "nodeSpansPlaces":
    case "gnbLengthSuggestion":
      return t(`observationFlags.none.${flag.kind}`);
    default:
      return flag.suggestion === null ? t("observationFlags.none.noSuggestion") : null;
  }
}

export function ChangeBox({ box, ctx }: ChangeBoxProps) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
        <HugeiconsIcon icon={box.icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">{box.title}</span>
        {box.subtitle === null ? null : <span className="text-xs text-muted-foreground">{box.subtitle}</span>}
      </div>
      <dl className="grid grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-2.5 px-4 py-3 max-sm:grid-cols-1 max-sm:gap-y-1">
        {box.rows.map((boxRow) => (
          <div key={boxRow.label} className="contents">
            <dt className="text-sm font-medium max-sm:mt-1.5">{boxRow.label}</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
              {boxRow.operatorId === null ? null : <BrandMark brand={getOperatorLook(ctx.lookups, boxRow.operatorId).brand} size={16} />}
              <span className={cn("tabular-nums", boxRow.isMono ? "font-mono font-semibold" : "font-medium")}>{boxRow.value}</span>
              {boxRow.hint === null || boxRow.hint === "" ? null : <span className="text-xs text-muted-foreground">{boxRow.hint}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
