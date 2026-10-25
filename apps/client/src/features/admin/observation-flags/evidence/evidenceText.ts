import type { ObservedSite, ObservedSiteEvidence } from "@openbts/shared/contract";
import { calculateDistance } from "@openbts/shared/geo";
import type { TFunction } from "i18next";

import type { EvidenceFit } from "../map/geometry";
import { describeSiteFit } from "../model/flagText";
import { formatDegrees, formatShare, getOperatorName, joinParts } from "../model/format";
import { type LocationCandidate, getCandidateTitle, listStationOperatorIds } from "./placeChoices";
import type { MapLookups } from "@/features/map/data/mapLookups";
import type { GpsFormat } from "@/hooks/usePreferences";
import { formatDistance } from "@/lib/format";
import { formatCoordinates } from "@/lib/geo/coordinates";

export type EvidenceTextContext = {
  t: TFunction;
  language: string;
  lookups: MapLookups | undefined;
  gpsFormat: GpsFormat;
};

export type PlaceSummary = {
  title: string;
  sub: string;
  note: string;
  isAmbiguous: boolean;
};

export type EvidenceFact = { key: string; label: string; value: string };

function listOperators(operatorIds: readonly number[], ctx: EvidenceTextContext): string {
  const names = operatorIds.flatMap((operatorId) => getOperatorName(operatorId, ctx.lookups) ?? []);
  return new Intl.ListFormat(ctx.language, { type: "conjunction" }).format(names);
}

function findNearestLocation(evidence: ObservedSiteEvidence, fit: EvidenceFit): LocationCandidate | null {
  let nearest: LocationCandidate | null = null;
  let nearestDistance = Infinity;
  for (const candidate of evidence.candidates) {
    if (candidate.kind !== "location") continue;
    const distance = calculateDistance(fit.latitude, fit.longitude, candidate.latitude, candidate.longitude);
    if (distance >= nearestDistance) continue;
    nearest = candidate;
    nearestDistance = distance;
  }
  return nearest;
}

function describeNearest(evidence: ObservedSiteEvidence, fit: EvidenceFit, ctx: EvidenceTextContext): string | null {
  const nearest = findNearestLocation(evidence, fit);
  if (nearest === null) return null;
  const operators = listOperators(listStationOperatorIds(nearest), ctx);
  return operators === ""
    ? ctx.t("observationFlags.evidence.place.nearest", { id: nearest.locationId })
    : ctx.t("observationFlags.evidence.place.nearestWithStations", { id: nearest.locationId, operators });
}

function joinSentences(sentences: readonly (string | null)[]): string {
  return sentences.filter((sentence): sentence is string => sentence !== null).join(". ");
}

export function summarizePlace(evidence: ObservedSiteEvidence, ctx: EvidenceTextContext): PlaceSummary {
  const { t, language, gpsFormat } = ctx;
  const { fit } = evidence;

  if (fit === null) {
    return {
      title: t("observationFlags.evidence.place.noEstimate"),
      sub: "",
      note: t("observationFlags.evidence.place.noEstimateNote"),
      isAmbiguous: false,
    };
  }

  if (fit.alternative !== null) {
    const distance = calculateDistance(fit.latitude, fit.longitude, fit.alternative.latitude, fit.alternative.longitude);
    return {
      title: t("observationFlags.evidence.status.ambiguous"),
      sub: t("observationFlags.evidence.place.ambiguousSub", {
        distance: formatDistance(distance, language),
        radius: formatDistance(fit.radiusMeters, language),
      }),
      note: t("observationFlags.evidence.place.ambiguousNote"),
      isAmbiguous: true,
    };
  }

  const snap = evidence.candidates.find((candidate) => candidate.isSnap);
  if (snap !== undefined) {
    const distance = calculateDistance(fit.latitude, fit.longitude, snap.latitude, snap.longitude);
    const operators = snap.kind === "location" ? listOperators(listStationOperatorIds(snap), ctx) : "";
    return {
      title: snap.kind === "location" ? t("observationFlags.evidence.place.snappedLocation", { id: snap.locationId }) : getCandidateTitle(snap, ctx),
      sub: t("observationFlags.evidence.place.snappedSub", {
        share: formatShare(snap.probability, language),
        distance: formatDistance(distance, language),
      }),
      note: joinSentences([
        t(`observationFlags.evidence.place.snappedNote.${snap.kind}`),
        operators === "" ? null : t("observationFlags.evidence.place.stationsThere", { operators }),
      ]),
      isAmbiguous: false,
    };
  }

  return {
    title: t("observationFlags.evidence.place.withinRadius", { distance: formatDistance(fit.radiusMeters, language) }),
    sub: t("observationFlags.evidence.place.fitSub", {
      share: formatShare(fit.confidence, language),
      coordinates: formatCoordinates(fit.latitude, fit.longitude, gpsFormat),
    }),
    note: joinSentences([t("observationFlags.evidence.place.fitNote"), describeNearest(evidence, fit, ctx)]),
    isAmbiguous: false,
  };
}

export function listEvidenceFacts(site: ObservedSite, ctx: EvidenceTextContext): EvidenceFact[] {
  const { evidence } = site;
  if (evidence === null) return [];
  const { t, language } = ctx;
  return [
    { key: "people", label: t("observationFlags.facts.people"), value: evidence.people.toLocaleString(language) },
    { key: "devices", label: t("observationFlags.facts.devices"), value: evidence.devices.toLocaleString(language) },
    { key: "samples", label: t("observationFlags.facts.readings"), value: evidence.samples.toLocaleString(language) },
    { key: "days", label: t("observationFlags.facts.days"), value: evidence.distinctDays.toLocaleString(language) },
    { key: "arc", label: t("observationFlags.facts.arc"), value: formatDegrees(evidence.angularCoverageDegrees) },
    { key: "farthest", label: t("observationFlags.facts.farthest"), value: formatDistance(evidence.maxDistanceMeters, language) },
  ];
}

export function describeSiteForDialog(site: ObservedSite, groupNames: readonly string[], cellCount: number, ctx: EvidenceTextContext): string {
  const { t } = ctx;
  const { placement } = site;
  return joinParts([
    groupNames.length === 0 ? null : t("observationFlags.evidence.withGroup", { names: groupNames.join(", ") }),
    cellCount === 0 ? null : t("common:labels.cells", { count: cellCount }),
    placement === null ? null : describeSiteFit(placement.kind === "fit" ? placement.radiusMeters : null, ctx),
  ]);
}
