import type { Cell, CellApplyChange, ObservationFlag, ObservedCellRecord } from "@openbts/shared/contract";
import type { CellRat } from "@openbts/shared/contract/constants";
import type { TFunction } from "i18next";

import {
  findNetworkOperator,
  formatBand,
  formatCellBand,
  formatNetwork,
  formatShare,
  formatStationLabel,
  getCellIdCode,
  getFieldCode,
  getNodeCode,
  getOperatorName,
  getRatName,
  joinParts,
  joinWords,
  readCellId,
  readItemNumber,
} from "./format";
import type { FlagOfKind } from "./kinds";
import { resolveDisplayName } from "@/features/admin/users/utils/identity";
import { getEstimatedSiteName, getSiteRat } from "@/features/map/crowd/sites/estimatedSites";
import type { MapLookups } from "@/features/map/data/mapLookups";
import { formatDistance, formatShortUtcDate } from "@/lib/format";
import { getCountryName } from "@/lib/geo/countryName";

export type FlagTextContext = {
  t: TFunction;
  language: string;
  lookups: MapLookups | undefined;
};

export type FlagSubjectIcon = "device" | "person" | "country" | "network";

export type FlagSubject = {
  text: string;
  isMono: boolean;
  isEstimated: boolean;
  operatorId: number | null;
  icon: FlagSubjectIcon | null;
};

export type RenumberedNodes = { rat: CellRat; previous: number | null; next: number | null };

type QuirkEvidence = FlagOfKind<"readerQuirk">["evidence"];
type CreatedCell = Extract<CellApplyChange, { action: "create" }>;
type CellLike = Pick<Cell, "rat" | "bandId">;

const ARROW = " → ";

export function findFlagRat(flag: ObservationFlag): CellRat | null {
  const site = flag.observedSite ?? null;
  return flag.cell?.rat ?? flag.observedCell?.rat ?? (site === null ? null : getSiteRat(site));
}

export function findCreatedCell(flag: FlagOfKind<"cellMissing">): CreatedCell | null {
  const [item] = flag.suggestion?.cells ?? [];
  return item?.action === "create" ? item : null;
}

export function getRenumberedNodes(flag: FlagOfKind<"renumbered">): RenumberedNodes | null {
  const cell = flag.cell ?? null;
  if (cell === null) return null;
  const field = cell.rat === "nr" ? "gnbid" : "enbid";
  const [item] = flag.suggestion?.cells ?? [];
  return { rat: cell.rat, previous: readItemNumber(cell, field), next: item === undefined ? null : readItemNumber(item, field) };
}

export function countRenumberedCells(flag: FlagOfKind<"renumbered">): number {
  return Math.max(flag.suggestion?.cells.length ?? 0, flag.evidence.alikeCellCount);
}

export function formatDeviceModel({ manufacturer, model }: NonNullable<QuirkEvidence["deviceModel"]>): string {
  return `${manufacturer} ${model}`;
}

export function formatReaderVersion(readerVersion: QuirkEvidence["readerVersion"]): string {
  return readerVersion === null ? "" : `${readerVersion.reader} ${readerVersion.version}`;
}

export function formatBlockFields(fields: readonly string[]): string {
  return fields.map((field) => (field === "pci" || field === "channel" || field === "areaCode" ? getFieldCode(field, "lte") : field)).join(", ");
}

export function getResolverName(flag: ObservationFlag): string | null {
  return flag.resolvedBy?.username ?? flag.resolvedBy?.name ?? null;
}

export function isStationCreated(flag: ObservationFlag): boolean {
  const isSiteFlag = flag.kind === "unmatchedSite" || flag.kind === "positionShifts";
  return isSiteFlag && flag.closedReason === "applied" && flag.station !== null && flag.station !== undefined;
}

function formatPeople(count: number, ctx: FlagTextContext): string {
  return ctx.t("observationFlags.people", { count });
}

export function getStationSubject(flag: ObservationFlag): FlagSubject {
  const station = flag.station ?? null;
  return {
    text: station === null ? `#${flag.stationId ?? flag.id}` : formatStationLabel(station),
    isMono: (station?.siteId ?? null) !== null,
    isEstimated: false,
    operatorId: station?.operatorId ?? null,
    icon: null,
  };
}

export function formatStationWithOperator(flag: ObservationFlag, lookups: MapLookups | undefined): string {
  return joinWords([getOperatorName(flag.station?.operatorId, lookups), getStationSubject(flag).text]);
}

function getSiteSubject(flag: ObservationFlag): FlagSubject {
  const site = flag.observedSite ?? null;
  return {
    text: site === null ? `#${flag.observedSiteId ?? flag.id}` : getEstimatedSiteName(site),
    isMono: false,
    isEstimated: true,
    operatorId: site?.operatorId ?? null,
    icon: null,
  };
}

function otherSubject(text: string, icon: FlagSubjectIcon, isMono = false): FlagSubject {
  return { text, isMono, isEstimated: false, operatorId: null, icon };
}

export function getFlagSubject(flag: ObservationFlag, ctx: FlagTextContext): FlagSubject {
  switch (flag.kind) {
    case "unmatchedSite":
    case "positionShifts":
    case "suggestedSite":
    case "nodeSpansPlaces":
      return getSiteSubject(flag);
    case "readerQuirk": {
      const { deviceModel, readerVersion } = flag.evidence;
      if (deviceModel !== null) return otherSubject(formatDeviceModel(deviceModel), "device");
      return otherSubject(readerVersion === null ? ctx.t("observationFlags.subjects.reader") : formatReaderVersion(readerVersion), "device");
    }
    case "untrustedContributor":
      return otherSubject(resolveDisplayName(flag.evidence.user) || ctx.t("observationFlags.subjects.contributor"), "person");
    case "deviceRevoked":
      return otherSubject(ctx.t("observationFlags.subjects.device"), "device");
    case "bandNotInPlan":
      return otherSubject(flag.countryCode === null ? "-" : getCountryName(flag.countryCode, ctx.language), "country");
    case "gnbLengthSuggestion":
      return otherSubject(flag.evidence.plmn, "network", true);
    default:
      return getStationSubject(flag);
  }
}

export function getMeasuredFieldCode(flag: FlagOfKind<"valueDiffers" | "valueMissing">): string {
  const rat = findFlagRat(flag);
  return rat === null ? flag.evidence.field : getFieldCode(flag.evidence.field, rat);
}

function describeChangedValue(flag: FlagOfKind<"valueDiffers" | "valueMissing">, ctx: FlagTextContext): string {
  const { observed, stored } = flag.evidence;
  const code = getMeasuredFieldCode(flag);
  if (stored === null) return ctx.t("observationFlags.summary.measuredValue", { field: code, value: observed });
  return `${code} ${stored}${ARROW}${observed}`;
}

function describeFlagCell(flag: ObservationFlag, ctx: FlagTextContext): string | null {
  const cell: CellLike | ObservedCellRecord | null = flag.cell ?? flag.observedCell ?? null;
  return cell === null ? null : formatCellBand(cell, ctx.lookups, ctx.language);
}

function describeNewCell(flag: FlagOfKind<"cellMissing">, ctx: FlagTextContext): string {
  const cell = findCreatedCell(flag);
  if (cell === null) return joinParts([describeFlagCell(flag, ctx), formatPeople(flag.evidence.people, ctx)]);
  const cellId = readCellId(cell);
  const pci = readItemNumber(cell, "pci");
  return joinParts([
    formatCellBand(cell, ctx.lookups, ctx.language),
    cellId === null ? null : `${getCellIdCode(cell.rat)} ${cellId}`,
    pci === null || cell.rat === "gsm" || cell.rat === "umts" ? null : `PCI ${pci}`,
    formatPeople(flag.evidence.people, ctx),
  ]);
}

export function describeSiteFit(radiusMeters: number | null, ctx: FlagTextContext): string {
  if (radiusMeters === null) return ctx.t("observationFlags.summary.snapped");
  return ctx.t("observationFlags.summary.withinRadius", { distance: formatDistance(radiusMeters, ctx.language) });
}

function describeUnmatchedSite(flag: FlagOfKind<"unmatchedSite">, ctx: FlagTextContext): string {
  const rat = findFlagRat(flag);
  const nodeCount = flag.evidence.observedSiteIds.length;
  const cellCount = flag.suggestion?.cells?.length ?? 0;
  return joinParts([
    rat === "lte" || rat === "nr" ? ctx.t("observationFlags.summary.nodeCount", { count: nodeCount, node: getNodeCode(rat) }) : null,
    cellCount === 0 ? null : ctx.t("common:labels.cells", { count: cellCount }),
    describeSiteFit(flag.evidence.radiusMeters, ctx),
    formatPeople(flag.evidence.people, ctx),
  ]);
}

function describeRenumbered(flag: FlagOfKind<"renumbered">, ctx: FlagTextContext): string {
  const nodes = getRenumberedNodes(flag);
  const ids =
    nodes === null || nodes.previous === null || nodes.next === null ? null : `${getNodeCode(nodes.rat)} ${nodes.previous}${ARROW}${nodes.next}`;
  return joinParts([ids, ctx.t("common:labels.cells", { count: countRenumberedCells(flag) })]);
}

function describeReaderQuirk(flag: FlagOfKind<"readerQuirk">, ctx: FlagTextContext): string {
  const { field, pattern, parameter, valueCount, uploadCount } = flag.evidence;
  return joinParts([
    ctx.t(`observationFlags.patterns.${pattern}`, { field: getFieldCode(field, "lte"), parameter: parameter ?? 0 }),
    ctx.t("observationFlags.summary.values", { count: valueCount }),
    ctx.t("observationFlags.summary.uploads", { count: uploadCount }),
  ]);
}

export function getFlagSummary(flag: ObservationFlag, ctx: FlagTextContext): string {
  const { t, language } = ctx;
  switch (flag.kind) {
    case "valueDiffers":
    case "valueMissing":
      return joinParts([describeFlagCell(flag, ctx), describeChangedValue(flag, ctx), formatPeople(flag.evidence.people, ctx)]);
    case "cellMissing":
      return describeNewCell(flag, ctx);
    case "networkMissing":
      return joinParts([
        describeFlagCell(flag, ctx),
        t("observationFlags.summary.alsoBroadcasts", { network: formatNetwork(flag.evidence.network, ctx.lookups) }),
        formatPeople(flag.evidence.people, ctx),
      ]);
    case "networkNotSeen":
      return joinParts([
        describeFlagCell(flag, ctx),
        t("observationFlags.summary.notListed", { network: formatNetwork(flag.evidence.network, ctx.lookups) }),
        formatPeople(flag.evidence.people, ctx),
      ]);
    case "unmatchedSite":
      return describeUnmatchedSite(flag, ctx);
    case "positionShifts":
      return joinParts([
        t("observationFlags.summary.shifts", { distance: formatDistance(flag.evidence.shiftMeters, language) }),
        t("observationFlags.summary.radius", { distance: formatDistance(flag.evidence.radiusMeters, language) }),
        formatPeople(flag.evidence.people, ctx),
      ]);
    case "suggestedSite":
      return joinParts([
        t("observationFlags.summary.fromStation", {
          distance: formatDistance(flag.evidence.distanceMeters, language),
          station: getStationSubject(flag).text,
        }),
        t("common:labels.cells", { count: flag.suggestion?.cells.length ?? 0 }),
        formatPeople(flag.evidence.people, ctx),
      ]);
    case "positionDiffers":
      return joinParts([
        t("observationFlags.summary.estimateFromStation", { distance: formatDistance(flag.evidence.distanceMeters, language) }),
        t("observationFlags.summary.radius", { distance: formatDistance(flag.evidence.radiusMeters, language) }),
      ]);
    case "renumbered":
      return describeRenumbered(flag, ctx);
    case "bearingDiffers":
      return joinParts([
        t("observationFlags.summary.azimuth", { degrees: flag.evidence.azimuth }),
        t("observationFlags.summary.measuredBearing", { degrees: Math.round(flag.evidence.bearingDegrees) }),
      ]);
    case "possiblyDecommissioned":
      return joinParts([
        describeFlagCell(flag, ctx),
        flag.evidence.lastSeenOn === null
          ? t("observationFlags.summary.neverSeen")
          : t("observationFlags.summary.notSeenSince", { date: formatShortUtcDate(flag.evidence.lastSeenOn, language) }),
      ]);
    case "siteIdKnown":
      return flag.suggestion === null ? "" : t("observationFlags.summary.registerSiteId", { siteId: flag.suggestion.siteId });
    case "bandNotInPlan":
      return joinParts([
        joinWords([getRatName(flag.evidence.rat), formatBand(flag.suggestion?.bandId, ctx.lookups, language)]),
        t("observationFlags.summary.channels", { channels: flag.evidence.channels.join(", ") }),
        formatPeople(flag.evidence.people, ctx),
      ]);
    case "readerQuirk":
      return describeReaderQuirk(flag, ctx);
    case "deviceRevoked":
      return t(`observationFlags.summary.certificate.${flag.evidence.revocationStatus}`, { serial: flag.evidence.serial });
    case "untrustedContributor":
      return joinParts([
        t("observationFlags.summary.agreement", { share: formatShare(flag.evidence.agreement, language) }),
        t("observationFlags.summary.readings", { count: flag.evidence.readings }),
      ]);
    case "nodeSpansPlaces":
      return t("observationFlags.summary.places", { count: flag.evidence.places.length });
    case "gnbLengthSuggestion":
      return joinParts([
        t("observationFlags.summary.gnbLength", { length: flag.evidence.length, suggested: flag.evidence.suggestedLength }),
        t("observationFlags.summary.nodeCount", { count: flag.evidence.siteCount, node: getNodeCode("nr") }),
      ]);
  }
}

export function getResolvedTitle(flag: ObservationFlag, t: TFunction): string {
  if (flag.closedReason === "applied") return t("observationFlags.closed.applied.title");
  if (flag.closedReason === "fixedElsewhere") return t("observationFlags.closed.fixedElsewhere.title");
  return t("observationFlags.closed.evidenceGone.title");
}

export function getClosedSummary(flag: ObservationFlag, ctx: FlagTextContext): string {
  const { t } = ctx;
  if (flag.status === "dismissed") {
    const reason = flag.dismissedReason === null ? null : t(`observationFlags.dismissReasons.${flag.dismissedReason}.label`);
    return joinParts([reason, getResolverName(flag)]);
  }
  if (flag.closedReason !== "applied") return getResolvedTitle(flag, t);
  const detail = isStationCreated(flag)
    ? t("observationFlags.closed.stationCreated", { station: getStationSubject(flag).text })
    : getFlagSummary(flag, ctx);
  return t("observationFlags.closed.appliedSummary", { summary: detail });
}

export function getFlagTitle(flag: ObservationFlag, ctx: FlagTextContext): string {
  const { t } = ctx;
  if (flag.kind === "valueDiffers" || flag.kind === "valueMissing") {
    return t(`observationFlags.kinds.${flag.kind}.title`, { field: getMeasuredFieldCode(flag) });
  }
  if (flag.kind === "networkMissing") {
    const operator = findNetworkOperator(flag.evidence.network, ctx.lookups);
    if (operator !== undefined) return t("observationFlags.kinds.networkMissing.titleOperator", { operator: operator.name });
  }
  return t(`observationFlags.kinds.${flag.kind}.title`);
}

export function getFlagTime(flag: ObservationFlag): string {
  return flag.status === "open" ? flag.createdAt : (flag.resolvedAt ?? flag.updatedAt);
}

export function getRegionName(flag: ObservationFlag, lookups: MapLookups | undefined): string {
  return flag.regionId === null ? "" : (lookups?.regionsById.get(flag.regionId)?.name ?? "");
}
