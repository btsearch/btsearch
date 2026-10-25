import type { ObservationFlag } from "@openbts/shared/contract";

import { getFlagCompare } from "./flagFacts";
import {
  type FlagTextContext,
  findCreatedCell,
  findFlagRat,
  formatDeviceModel,
  formatReaderVersion,
  formatStationWithOperator,
  getRenumberedNodes,
  getStationSubject,
} from "./flagText";
import {
  formatBand,
  formatCellBand,
  formatDegrees,
  formatNetwork,
  formatShare,
  getFieldCode,
  getNodeCode,
  getOperatorName,
  getRatName,
  joinWords,
} from "./format";
import type { FlagOfKind } from "./kinds";
import { formatDistance, formatShortUtcDate } from "@/lib/format";

function describeNetworkLead(flag: FlagOfKind<"networkMissing">, ctx: FlagTextContext): string {
  const network = formatNetwork(flag.evidence.network, ctx.lookups);
  const key = flag.evidence.seenAs === "list" ? "observationFlags.leads.networkMissing.list" : "observationFlags.leads.networkMissing.missingCode";
  return ctx.t(key, { count: flag.evidence.people, network });
}

function describeUnmatchedLead(flag: FlagOfKind<"unmatchedSite">, ctx: FlagTextContext): string {
  const rat = findFlagRat(flag);
  const operator = getOperatorName(flag.observedSite?.operatorId, ctx.lookups) ?? "";
  const nodeCount = flag.evidence.observedSiteIds.length;
  const node = rat === null ? "" : getNodeCode(rat);
  const count = flag.evidence.people;
  if (nodeCount > 1) return ctx.t("observationFlags.leads.unmatchedSite.group", { count, nodes: nodeCount, node, operator });
  return ctx.t("observationFlags.leads.unmatchedSite.single", { count, node, operator });
}

function describeReaderLead(flag: FlagOfKind<"readerQuirk">, ctx: FlagTextContext): string {
  const { t } = ctx;
  const { deviceModel, readerVersion, field, pattern, parameter, valueCount, cellCount, uploadCount } = flag.evidence;
  const values = {
    pattern: t(`observationFlags.patterns.${pattern}`, { field: getFieldCode(field, "lte"), parameter: parameter ?? 0 }),
    values: t("observationFlags.summary.values", { count: valueCount }),
    cells: t("observationFlags.leads.readerQuirk.cells", { count: cellCount }),
    uploads: t("observationFlags.leads.readerQuirk.uploads", { count: uploadCount }),
  };
  if (deviceModel !== null) return t("observationFlags.leads.readerQuirk.device", { ...values, device: formatDeviceModel(deviceModel) });
  return t("observationFlags.leads.readerQuirk.reader", { ...values, reader: formatReaderVersion(readerVersion) });
}

function describeDecommissionedLead(flag: FlagOfKind<"possiblyDecommissioned">, ctx: FlagTextContext): string {
  const { t, language } = ctx;
  const cell = flag.cell ?? null;
  const network = joinWords([
    getOperatorName(flag.station?.operatorId, ctx.lookups),
    cell === null ? null : formatCellBand(cell, ctx.lookups, language),
  ]);
  const measuredOn = formatShortUtcDate(flag.evidence.networkMeasuredOn, language);
  if (flag.evidence.lastSeenOn === null) return t("observationFlags.leads.possiblyDecommissioned.never", { measuredOn, network });
  const lastSeenOn = formatShortUtcDate(flag.evidence.lastSeenOn, language);
  return t("observationFlags.leads.possiblyDecommissioned.since", { lastSeenOn, measuredOn, network });
}

function describeRenumberedLead(flag: FlagOfKind<"renumbered">, ctx: FlagTextContext): string {
  const nodes = getRenumberedNodes(flag);
  const count = flag.evidence.alikeCellCount;
  if (nodes === null || nodes.previous === null || nodes.next === null) return ctx.t("observationFlags.leads.renumbered.unknown", { count });
  return ctx.t("observationFlags.leads.renumbered.known", { node: getNodeCode(nodes.rat), previous: nodes.previous, next: nodes.next, count });
}

export function getFlagLead(flag: ObservationFlag, ctx: FlagTextContext): string {
  const { t, language } = ctx;
  switch (flag.kind) {
    case "valueDiffers":
    case "valueMissing": {
      const compare = getFlagCompare(flag, ctx);
      return t(`observationFlags.leads.${flag.kind}`, {
        count: flag.evidence.people,
        field: compare?.label,
        observed: compare?.observed,
        stored: compare?.stored,
      });
    }
    case "cellMissing": {
      const cell = findCreatedCell(flag) ?? flag.observedCell ?? null;
      return t("observationFlags.leads.cellMissing", {
        count: flag.evidence.people,
        cell: cell === null ? "" : formatCellBand(cell, ctx.lookups, language),
      });
    }
    case "networkMissing":
      return describeNetworkLead(flag, ctx);
    case "networkNotSeen":
      return t("observationFlags.leads.networkNotSeen", {
        count: flag.evidence.readingsWithList,
        network: formatNetwork(flag.evidence.network, ctx.lookups),
      });
    case "unmatchedSite":
      return describeUnmatchedLead(flag, ctx);
    case "positionShifts":
      return t("observationFlags.leads.positionShifts", { distance: formatDistance(flag.evidence.shiftMeters, language) });
    case "suggestedSite":
      return t("observationFlags.leads.suggestedSite", {
        node: getNodeCode(findFlagRat(flag) ?? "lte"),
        distance: formatDistance(flag.evidence.distanceMeters, language),
        station: formatStationWithOperator(flag, ctx.lookups),
      });
    case "positionDiffers":
      return t("observationFlags.leads.positionDiffers", {
        distance: formatDistance(flag.evidence.distanceMeters, language),
        radius: formatDistance(flag.evidence.radiusMeters, language),
      });
    case "renumbered":
      return describeRenumberedLead(flag, ctx);
    case "bearingDiffers":
      return t("observationFlags.leads.bearingDiffers", {
        bearing: formatDegrees(flag.evidence.bearingDegrees),
        azimuth: formatDegrees(flag.evidence.azimuth),
      });
    case "possiblyDecommissioned":
      return describeDecommissionedLead(flag, ctx);
    case "siteIdKnown":
      return t("observationFlags.leads.siteIdKnown", { name: getStationSubject(flag).text, siteId: flag.suggestion?.siteId ?? "" });
    case "bandNotInPlan":
      return t("observationFlags.leads.bandNotInPlan", {
        count: flag.evidence.people,
        rat: getRatName(flag.evidence.rat),
        channels: flag.evidence.channels.join(", "),
        band: formatBand(flag.suggestion?.bandId, ctx.lookups, language) ?? "",
      });
    case "readerQuirk":
      return describeReaderLead(flag, ctx);
    case "untrustedContributor":
      return t("observationFlags.leads.untrustedContributor", {
        share: formatShare(flag.evidence.agreement, language),
        everyone: formatShare(flag.evidence.everyoneAgreement, language),
      });
    case "deviceRevoked":
      return t(`observationFlags.leads.deviceRevoked.${flag.evidence.revocationStatus}`, { serial: flag.evidence.serial });
    case "nodeSpansPlaces":
      return t("observationFlags.leads.nodeSpansPlaces", { count: flag.evidence.places.length });
    case "gnbLengthSuggestion":
      return t("observationFlags.leads.gnbLengthSuggestion", {
        network: formatNetwork(flag.evidence.plmn, ctx.lookups),
        length: flag.evidence.length,
        suggested: flag.evidence.suggestedLength,
        sites: flag.evidence.siteCount.toLocaleString(language),
      });
  }
}
