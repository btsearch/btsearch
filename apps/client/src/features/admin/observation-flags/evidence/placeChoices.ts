import { LicenseIcon, Location01Icon, Target02Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { ObservedSiteEvidence } from "@openbts/shared/contract";
import { calculateDistance } from "@openbts/shared/geo";

import { formatShare, formatSiteLabel, getOperatorName, joinParts, joinWords } from "../model/format";
import type { EvidenceTextContext } from "./evidenceText";
import { formatDistance } from "@/lib/format";
import { formatCoordinates } from "@/lib/geo/coordinates";

type EvidenceCandidate = ObservedSiteEvidence["candidates"][number];
export type LocationCandidate = Extract<EvidenceCandidate, { kind: "location" }>;
type ChoiceKind = "fit" | "alternative" | EvidenceCandidate["kind"];

export type PlaceChoice = {
  key: string;
  kind: ChoiceKind;
  latitude: number;
  longitude: number;
  title: string;
  line: string;
  share: string | null;
  isSnap: boolean;
  operatorIds: readonly number[];
  createLabel: string;
};

export const CHOICE_ICONS: Record<ChoiceKind, IconSvgElement> = {
  fit: Target02Icon,
  alternative: Target02Icon,
  location: Location01Icon,
  officialSite: LicenseIcon,
  observedSite: Target02Icon,
};

const FIT_CHOICE_KEY = "fit";
const ALTERNATIVE_CHOICE_KEY = "alternative";
const MOST_CHOICE_LOGOS = 2;

export function listStationOperatorIds(candidate: LocationCandidate): number[] {
  const operatorIds = (candidate.location.stations ?? []).flatMap((station) => (station.operatorId === null ? [] : [station.operatorId]));
  return [...new Set(operatorIds)];
}

function describeLocationStations(candidate: LocationCandidate, ctx: EvidenceTextContext): string | null {
  const stations = candidate.location.stations ?? [];
  if (stations.length === 0) return null;
  return stations.map((station) => joinWords([getOperatorName(station.operatorId, ctx.lookups), station.siteId ?? station.nodeName])).join(", ");
}

function getCandidateId(candidate: EvidenceCandidate): number {
  if (candidate.kind === "location") return candidate.locationId;
  if (candidate.kind === "officialSite") return candidate.officialSiteId;
  return candidate.observedSiteId;
}

function getCandidateKey(candidate: EvidenceCandidate): string {
  return `${candidate.kind}-${getCandidateId(candidate)}`;
}

function getCandidateOperatorIds(candidate: EvidenceCandidate): number[] {
  if (candidate.kind === "location") return listStationOperatorIds(candidate);
  const operatorId = candidate.kind === "officialSite" ? candidate.officialSite?.operatorId : candidate.observedSite?.operatorId;
  return operatorId === null || operatorId === undefined ? [] : [operatorId];
}

export function getCandidateTitle(candidate: EvidenceCandidate, ctx: EvidenceTextContext): string {
  const { t } = ctx;
  switch (candidate.kind) {
    case "location":
      return t("observationFlags.evidence.choices.location", { id: candidate.locationId });
    case "officialSite": {
      const site = candidate.officialSite;
      const name = site === undefined ? "" : joinWords([getOperatorName(site.operatorId, ctx.lookups), site.siteId]);
      return name === "" ? t("observationFlags.evidence.choices.officialSiteHidden") : t("observationFlags.evidence.choices.officialSite", { name });
    }
    case "observedSite":
      return candidate.observedSite === undefined
        ? t("observationFlags.evidence.choices.observedSiteHidden")
        : t("observationFlags.evidence.choices.observedSite", { name: formatSiteLabel(candidate.observedSite, ctx.lookups) });
  }
}

function describeCandidate(candidate: EvidenceCandidate, ctx: EvidenceTextContext): string | null {
  const { t } = ctx;
  switch (candidate.kind) {
    case "location":
      return joinParts([describeLocationStations(candidate, ctx), candidate.location.address ?? candidate.location.city]);
    case "officialSite": {
      const place = candidate.officialSite?.location;
      return place === undefined ? null : (place.address ?? place.city);
    }
    case "observedSite":
      if (candidate.observedSite === undefined) return null;
      return candidate.observedSite.status === "unmatched"
        ? t("observationFlags.evidence.choices.otherEstimateUnmatched")
        : t("observationFlags.evidence.choices.otherEstimate");
  }
}

function getCreateLabel(candidate: EvidenceCandidate, ctx: EvidenceTextContext): string {
  const { t } = ctx;
  switch (candidate.kind) {
    case "location":
      return t("observationFlags.evidence.create.location", { id: candidate.locationId });
    case "officialSite": {
      const siteId = candidate.officialSite?.siteId ?? null;
      return siteId === null
        ? t("observationFlags.evidence.create.officialSitePlace")
        : t("observationFlags.evidence.create.officialSite", { siteId });
    }
    case "observedSite": {
      const operator = getOperatorName(candidate.observedSite?.operatorId, ctx.lookups);
      return operator === null
        ? t("observationFlags.evidence.create.observedSitePlace")
        : t("observationFlags.evidence.create.observedSite", { operator });
    }
  }
}

function formatDistanceFromFit(evidence: ObservedSiteEvidence, latitude: number, longitude: number, ctx: EvidenceTextContext): string | null {
  const { fit } = evidence;
  if (fit === null) return null;
  const distance = calculateDistance(fit.latitude, fit.longitude, latitude, longitude);
  return ctx.t("observationFlags.evidence.choices.fromEstimate", { distance: formatDistance(distance, ctx.language) });
}

function rankCandidates(candidates: readonly EvidenceCandidate[]): EvidenceCandidate[] {
  return [...candidates].sort((left, right) => right.probability - left.probability);
}

export function listPlaceChoices(evidence: ObservedSiteEvidence, ctx: EvidenceTextContext): PlaceChoice[] {
  const { t, language, gpsFormat } = ctx;
  const { fit } = evidence;
  const createHere = t("observationFlags.evidence.create.point");
  const choices: PlaceChoice[] = [];

  if (fit !== null) {
    choices.push({
      key: FIT_CHOICE_KEY,
      kind: "fit",
      latitude: fit.latitude,
      longitude: fit.longitude,
      title: t(fit.alternative === null ? "observationFlags.evidence.choices.fit" : "observationFlags.evidence.choices.first"),
      line: formatCoordinates(fit.latitude, fit.longitude, gpsFormat),
      share: null,
      isSnap: false,
      operatorIds: [],
      createLabel: createHere,
    });
  }
  if (fit?.alternative) {
    const { latitude, longitude } = fit.alternative;
    const distance = calculateDistance(fit.latitude, fit.longitude, latitude, longitude);
    choices.push({
      key: ALTERNATIVE_CHOICE_KEY,
      kind: "alternative",
      latitude,
      longitude,
      title: t("observationFlags.evidence.choices.second"),
      line: t("observationFlags.evidence.choices.secondLine", {
        coordinates: formatCoordinates(latitude, longitude, gpsFormat),
        distance: formatDistance(distance, language),
      }),
      share: null,
      isSnap: false,
      operatorIds: [],
      createLabel: createHere,
    });
  }

  for (const candidate of rankCandidates(evidence.candidates)) {
    const share = formatShare(candidate.probability, language);
    choices.push({
      key: getCandidateKey(candidate),
      kind: candidate.kind,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      title: getCandidateTitle(candidate, ctx),
      line: joinParts([formatDistanceFromFit(evidence, candidate.latitude, candidate.longitude, ctx), describeCandidate(candidate, ctx)]),
      share: candidate.isSnap ? joinParts([t("observationFlags.evidence.choices.snapped"), share]) : share,
      isSnap: candidate.isSnap,
      operatorIds: getCandidateOperatorIds(candidate).slice(0, MOST_CHOICE_LOGOS),
      createLabel: getCreateLabel(candidate, ctx),
    });
  }
  return choices;
}

export function pickDefaultChoiceKey(evidence: ObservedSiteEvidence, choices: readonly PlaceChoice[]): string | null {
  const snap = evidence.candidates.find((candidate) => candidate.isSnap);
  if (snap !== undefined) return getCandidateKey(snap);
  return choices[0]?.key ?? null;
}
