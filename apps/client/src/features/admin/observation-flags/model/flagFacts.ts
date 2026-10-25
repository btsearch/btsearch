import type { ObservationFlag, ObservedSite } from "@openbts/shared/contract";

import { type FlagTextContext, type RenumberedNodes, countRenumberedCells, findFlagRat, getMeasuredFieldCode, getRenumberedNodes } from "./flagText";
import { formatDegrees, formatNetwork, formatShare, getFieldCode, getNodeCode, getRatName } from "./format";
import type { FlagOfKind } from "./kinds";
import { formatDistance, formatShortUtcDate } from "@/lib/format";

export type FlagFact = { label: string; value: string; isMono: boolean };

export type FlagCompare = { label: string; stored: string; observed: string };

type SeenEvidence = { samples: number; people: number; lastSeenOn: string };

function fact(label: string, value: string, isMono = false): FlagFact {
  return { label, value, isMono };
}

function formatSiteRadius(site: ObservedSite | null | undefined, ctx: FlagTextContext): string | null {
  const placement = site?.placement ?? null;
  if (placement === null) return null;
  if (placement.kind === "fit") return formatDistance(placement.radiusMeters, ctx.language);
  return ctx.t("observationFlags.facts.snapped", { share: formatShare(placement.probability, ctx.language) });
}

function listLastSeenFact(site: ObservedSite | null | undefined, ctx: FlagTextContext): FlagFact[] {
  const lastSeenOn = site?.lastSeenOn ?? null;
  return lastSeenOn === null ? [] : [fact(ctx.t("observationFlags.facts.lastSeen"), formatShortUtcDate(lastSeenOn, ctx.language))];
}

function listSiteFacts(site: ObservedSite | null | undefined, radius: string | null, ctx: FlagTextContext): FlagFact[] {
  const { t, language } = ctx;
  const evidence = site?.evidence ?? null;
  const radiusFact = radius === null ? [] : [fact(t("observationFlags.facts.radius"), radius)];
  if (evidence === null) return [...radiusFact, ...listLastSeenFact(site, ctx)];
  return [
    fact(t("observationFlags.facts.people"), evidence.people.toLocaleString(language)),
    fact(t("observationFlags.facts.devices"), evidence.devices.toLocaleString(language)),
    fact(t("observationFlags.facts.readings"), evidence.samples.toLocaleString(language)),
    fact(t("observationFlags.facts.days"), evidence.distinctDays.toLocaleString(language)),
    ...radiusFact,
    fact(t("observationFlags.facts.taShare"), formatShare(evidence.timingAdvanceShare, language)),
    fact(t("observationFlags.facts.arc"), formatDegrees(evidence.angularCoverageDegrees)),
    ...listLastSeenFact(site, ctx),
  ];
}

function listSeenFacts(evidence: SeenEvidence, flag: ObservationFlag, ctx: FlagTextContext): FlagFact[] {
  const { t, language } = ctx;
  const firstSeenOn = flag.observedCell?.firstSeenOn ?? null;
  return [
    fact(t("observationFlags.facts.people"), evidence.people.toLocaleString(language)),
    fact(t("observationFlags.facts.readings"), evidence.samples.toLocaleString(language)),
    fact(t("observationFlags.facts.lastSeen"), formatShortUtcDate(evidence.lastSeenOn, language)),
    ...(firstSeenOn === null ? [] : [fact(t("observationFlags.facts.firstSeen"), formatShortUtcDate(firstSeenOn, language))]),
  ];
}

function formatDayOrNever(day: string | null, ctx: FlagTextContext): string {
  return day === null ? ctx.t("observationFlags.facts.never") : formatShortUtcDate(day, ctx.language);
}

function getBearingDifference(flag: FlagOfKind<"bearingDiffers">): number {
  const difference = Math.abs(flag.evidence.bearingDegrees - flag.evidence.azimuth) % 360;
  return difference > 180 ? 360 - difference : difference;
}

function listNodeFacts(nodes: RenumberedNodes | null, ctx: FlagTextContext): FlagFact[] {
  if (nodes === null) return [];
  const node = getNodeCode(nodes.rat);
  const facts: FlagFact[] = [];
  if (nodes.previous !== null) facts.push(fact(ctx.t("observationFlags.facts.previousNode", { node }), String(nodes.previous), true));
  if (nodes.next !== null) facts.push(fact(ctx.t("observationFlags.facts.newNode", { node }), String(nodes.next), true));
  return facts;
}

function listRenumberedFacts(flag: FlagOfKind<"renumbered">, ctx: FlagTextContext): FlagFact[] {
  const { t, language } = ctx;
  const alike = flag.evidence.alikeCellCount.toLocaleString(language);
  const total = countRenumberedCells(flag).toLocaleString(language);
  return [
    ...listNodeFacts(getRenumberedNodes(flag), ctx),
    fact(t("observationFlags.facts.alikeCells"), t("observationFlags.facts.ofCells", { alike, total })),
  ];
}

export function getFlagFacts(flag: ObservationFlag, ctx: FlagTextContext): FlagFact[] {
  const { t, language } = ctx;
  switch (flag.kind) {
    case "valueDiffers":
    case "valueMissing":
    case "cellMissing":
      return listSeenFacts(flag.evidence, flag, ctx);
    case "networkMissing":
      return [
        fact(t("observationFlags.facts.network"), formatNetwork(flag.evidence.network, ctx.lookups), true),
        fact(t("observationFlags.facts.source"), t(`observationFlags.facts.seenAs.${flag.evidence.seenAs}`)),
        ...listSeenFacts(flag.evidence, flag, ctx),
      ];
    case "networkNotSeen":
      return [
        fact(t("observationFlags.facts.network"), formatNetwork(flag.evidence.network, ctx.lookups), true),
        fact(t("observationFlags.facts.listReadings"), flag.evidence.readingsWithList.toLocaleString(language)),
        fact(t("observationFlags.facts.people"), flag.evidence.people.toLocaleString(language)),
        fact(t("observationFlags.facts.lastListed"), formatDayOrNever(flag.evidence.lastListedOn, ctx)),
      ];
    case "unmatchedSite":
      return listSiteFacts(flag.observedSite, formatSiteRadius(flag.observedSite, ctx), ctx);
    case "positionShifts":
      return [
        fact(t("observationFlags.facts.shift"), formatDistance(flag.evidence.shiftMeters, language)),
        ...listSiteFacts(flag.observedSite, formatDistance(flag.evidence.radiusMeters, language), ctx),
      ];
    case "suggestedSite":
      return [
        fact(t("observationFlags.facts.distanceFromStation"), formatDistance(flag.evidence.distanceMeters, language)),
        ...listSiteFacts(flag.observedSite, formatSiteRadius(flag.observedSite, ctx), ctx),
      ];
    case "nodeSpansPlaces":
      return [
        fact(t("observationFlags.facts.places"), flag.evidence.places.length.toLocaleString(language)),
        ...listSiteFacts(flag.observedSite, formatSiteRadius(flag.observedSite, ctx), ctx),
      ];
    case "positionDiffers": {
      const people = flag.observedSite?.evidence?.people;
      return [
        fact(t("observationFlags.facts.distance"), formatDistance(flag.evidence.distanceMeters, language)),
        fact(t("observationFlags.facts.estimateRadius"), formatDistance(flag.evidence.radiusMeters, language)),
        ...(people === undefined ? [] : [fact(t("observationFlags.facts.people"), people.toLocaleString(language))]),
        ...listLastSeenFact(flag.observedSite, ctx),
      ];
    }
    case "bearingDiffers": {
      const cell = flag.observedCell ?? null;
      return [
        fact(t("observationFlags.facts.difference"), formatDegrees(getBearingDifference(flag))),
        fact(t("observationFlags.facts.spread"), formatDegrees(flag.evidence.spreadDegrees)),
        ...(cell === null
          ? []
          : [
              fact(t("observationFlags.facts.people"), cell.personCount.toLocaleString(language)),
              fact(t("observationFlags.facts.readings"), cell.sampleCount.toLocaleString(language)),
            ]),
      ];
    }
    case "renumbered":
      return listRenumberedFacts(flag, ctx);
    case "possiblyDecommissioned":
      return [
        fact(t("observationFlags.facts.lastSeen"), formatDayOrNever(flag.evidence.lastSeenOn, ctx)),
        fact(t("observationFlags.facts.networkMeasured"), formatShortUtcDate(flag.evidence.networkMeasuredOn, language)),
        fact(t("observationFlags.facts.measuredSquares"), flag.evidence.measuredSquareCount.toLocaleString(language)),
      ];
    case "siteIdKnown":
      return [
        fact(getNodeCode(findFlagRat(flag) ?? "lte"), String(flag.evidence.enbid), true),
        ...(flag.suggestion === null ? [] : [fact(t("observationFlags.facts.registerSite"), flag.suggestion.siteId, true)]),
      ];
    case "bandNotInPlan":
      return [
        fact(t("observationFlags.facts.technology"), getRatName(flag.evidence.rat)),
        fact(t("observationFlags.facts.channels"), flag.evidence.channels.join(", "), true),
        fact(t("observationFlags.facts.people"), flag.evidence.people.toLocaleString(language)),
        fact(t("observationFlags.facts.readings"), flag.evidence.samples.toLocaleString(language)),
        fact(t("observationFlags.facts.lastSeen"), formatShortUtcDate(flag.evidence.lastSeenOn, language)),
      ];
    case "readerQuirk":
      return [
        fact(t("observationFlags.facts.field"), getFieldCode(flag.evidence.field, "lte")),
        fact(
          t("observationFlags.facts.error"),
          t(`observationFlags.facts.patterns.${flag.evidence.pattern}`, { parameter: flag.evidence.parameter ?? 0 }),
        ),
        fact(t("observationFlags.facts.values"), flag.evidence.valueCount.toLocaleString(language)),
        fact(t("observationFlags.facts.cells"), flag.evidence.cellCount.toLocaleString(language)),
        fact(t("observationFlags.facts.uploads"), flag.evidence.uploadCount.toLocaleString(language)),
      ];
    case "untrustedContributor":
      return [
        fact(t("observationFlags.facts.agreement"), formatShare(flag.evidence.agreement, language)),
        fact(t("observationFlags.facts.everyoneAgreement"), formatShare(flag.evidence.everyoneAgreement, language)),
        fact(t("observationFlags.facts.readingsOnConfirmed"), flag.evidence.readings.toLocaleString(language)),
      ];
    case "deviceRevoked":
      return [
        fact(t("observationFlags.facts.certificate"), flag.evidence.serial, true),
        fact(t("observationFlags.facts.certificateStatus"), t(`observationFlags.facts.revocation.${flag.evidence.revocationStatus}`)),
      ];
    case "gnbLengthSuggestion":
      return [
        fact(t("observationFlags.facts.network"), formatNetwork(flag.evidence.plmn, ctx.lookups), true),
        fact(t("observationFlags.facts.length"), t("observationFlags.facts.bits", { count: flag.evidence.length })),
        fact(t("observationFlags.facts.suggestedLength"), t("observationFlags.facts.bits", { count: flag.evidence.suggestedLength })),
        fact(t("observationFlags.facts.gnbCount"), flag.evidence.siteCount.toLocaleString(language)),
      ];
  }
}

export function getFlagCompare(flag: ObservationFlag, ctx: FlagTextContext): FlagCompare | null {
  if (flag.kind === "valueDiffers" || flag.kind === "valueMissing") {
    const { stored, observed } = flag.evidence;
    return {
      label: getMeasuredFieldCode(flag),
      stored: stored === null ? ctx.t("observationFlags.compare.none") : String(stored),
      observed: String(observed),
    };
  }
  if (flag.kind === "bearingDiffers") {
    return {
      label: ctx.t("observationFlags.compare.azimuth"),
      stored: formatDegrees(flag.evidence.azimuth),
      observed: formatDegrees(flag.evidence.bearingDegrees),
    };
  }
  return null;
}
