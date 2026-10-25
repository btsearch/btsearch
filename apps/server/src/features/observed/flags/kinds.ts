import { observationFlags } from "@openbts/drizzle";
import { OBSERVATION_FLAG_KINDS } from "@openbts/shared/contract";
import type { ObservationFlag, ObservationFlagKind } from "@openbts/shared/contract";
import { calculateDistance } from "@openbts/shared/geo";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

import { logger } from "../../../utils/logger.js";
import type { FlagKey } from "./subjects.js";

const observationFlagSelectSchema = createSelectSchema(observationFlags);

export const FLAG_REF_COLUMNS = [
  "observedSiteId",
  "observedCellId",
  "stationId",
  "cellId",
  "sectorId",
  "countryCode",
  "regionId",
  "bandId",
  "deviceId",
  "userId",
  "readerVersionId",
  "deviceModelId",
] as const;

export type FlagAudience = "area" | "maintainers" | "admins";
export type FlagRefs = Partial<Pick<z.infer<typeof observationFlagSelectSchema>, (typeof FLAG_REF_COLUMNS)[number]>>;
export type ClosedFlag = { measure: unknown };

const peopleMeasure = z.object({ people: z.number() });
const valueMeasure = z.object({ value: z.number(), people: z.number() });
const channelsMeasure = z.object({ channels: z.array(z.number()), people: z.number() });
const revocationMeasure = z.object({ serial: z.string(), revocationStatus: z.string() });
const devicesMeasure = z.object({ deviceIds: z.array(z.string()) });
const siteMeasure = z.object({ people: z.number(), latitude: z.number(), longitude: z.number(), radiusMeters: z.number() });
const sectorMeasure = z.object({ azimuth: z.number(), people: z.number() });
const sightingMeasure = z.object({ lastSeenOn: z.string().nullable(), people: z.number() });
const gnbLengthMeasure = z.object({ length: z.number(), suggestedLength: z.number() });
const siteIdMeasure = z.object({ siteId: z.string() });

export const SITE_FLAG_KINDS = [
  "unmatchedSite",
  "positionShifts",
  "suggestedSite",
  "positionDiffers",
  "renumbered",
  "nodeSpansPlaces",
] as const satisfies readonly ObservationFlagKind[];

type PeopleMeasure = z.infer<typeof peopleMeasure>;
type SiteKind = (typeof SITE_FLAG_KINDS)[number];
export type SiteMeasure = z.infer<typeof siteMeasure>;

type Measures = {
  cellMissing: PeopleMeasure;
  valueDiffers: z.infer<typeof valueMeasure>;
  valueMissing: z.infer<typeof valueMeasure>;
  networkMissing: PeopleMeasure;
  networkNotSeen: PeopleMeasure;
  bandNotInPlan: z.infer<typeof channelsMeasure>;
  readerQuirk: PeopleMeasure;
  deviceRevoked: z.infer<typeof revocationMeasure>;
  untrustedContributor: z.infer<typeof devicesMeasure>;
  unmatchedSite: SiteMeasure;
  positionShifts: SiteMeasure;
  suggestedSite: SiteMeasure;
  positionDiffers: SiteMeasure;
  renumbered: SiteMeasure;
  nodeSpansPlaces: SiteMeasure;
  bearingDiffers: z.infer<typeof sectorMeasure>;
  possiblyDecommissioned: z.infer<typeof sightingMeasure>;
  gnbLengthSuggestion: z.infer<typeof gnbLengthMeasure>;
  siteIdKnown: z.infer<typeof siteIdMeasure>;
};
type MeasureOf<Kind extends ObservationFlagKind> = Measures[Kind];

type FlagOf<Kind extends ObservationFlagKind> = Extract<ObservationFlag, { kind: Kind }>;
type StoredEvidenceOf<Kind extends ObservationFlagKind> = Omit<FlagOf<Kind>["evidence"], "user">;
type SuggestionOf<Kind extends ObservationFlagKind> = NonNullable<FlagOf<Kind>["suggestion"]>;

export type RaisedFlag<Kind extends ObservationFlagKind = ObservationFlagKind> = {
  [K in Kind]: {
    kind: K;
    subjectKey: string;
    refs: FlagRefs;
    evidence: StoredEvidenceOf<K>;
    suggestion: [SuggestionOf<K>] extends [never] ? null : SuggestionOf<K>;
    measure: MeasureOf<K>;
  };
}[Kind];
export type FlagFindings<Kind extends ObservationFlagKind> = { raised: RaisedFlag<Kind>[]; fixed: FlagKey[] };

type FlagKindDefinition<Kind extends ObservationFlagKind> = {
  seenBy: FlagAudience;
  restsOn?: "observedCellId" | "observedSiteId";
  isWorthRaisingAgain: (dismissed: ClosedFlag, raised: RaisedFlag<Kind>) => boolean;
};

const kindsWithUnreadableFlags = new Set<ObservationFlagKind>();

function parsedAs<T>(schema: z.ZodType<T>, value: unknown, kind: ObservationFlagKind): T | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  if (!kindsWithUnreadableFlags.has(kind)) {
    kindsWithUnreadableFlags.add(kind);
    logger.warn("observations.flags.unreadable_baseline", { kind, issues: parsed.error.issues });
  }
  return null;
}

function hasMorePeople(now: PeopleMeasure, before: PeopleMeasure): boolean {
  return now.people > before.people;
}

function morePeople(dismissed: ClosedFlag, raised: RaisedFlag<"cellMissing" | "networkMissing" | "networkNotSeen" | "readerQuirk">): boolean {
  const before = parsedAs(peopleMeasure, dismissed.measure, raised.kind);
  return before !== null && hasMorePeople(raised.measure, before);
}

function newValueOrMorePeople(dismissed: ClosedFlag, raised: RaisedFlag<"valueDiffers" | "valueMissing">): boolean {
  const before = parsedAs(valueMeasure, dismissed.measure, raised.kind);
  return before !== null && (raised.measure.value !== before.value || hasMorePeople(raised.measure, before));
}

function movedOrMorePeople(dismissed: ClosedFlag, raised: RaisedFlag<SiteKind>): boolean {
  const before = parsedAs(siteMeasure, dismissed.measure, raised.kind);
  if (before === null) return false;
  const now = raised.measure;
  const moved = calculateDistance(before.latitude, before.longitude, now.latitude, now.longitude);
  return moved > before.radiusMeters || hasMorePeople(now, before);
}

const siteKind = { seenBy: "area", restsOn: "observedSiteId", isWorthRaisingAgain: movedOrMorePeople } as const;

export const FLAG_KINDS: { readonly [Kind in ObservationFlagKind]: FlagKindDefinition<Kind> } = {
  valueDiffers: { seenBy: "area", isWorthRaisingAgain: newValueOrMorePeople },
  valueMissing: { seenBy: "area", isWorthRaisingAgain: newValueOrMorePeople },
  networkMissing: { seenBy: "area", isWorthRaisingAgain: morePeople },
  networkNotSeen: { seenBy: "area", isWorthRaisingAgain: morePeople },
  cellMissing: { seenBy: "area", restsOn: "observedCellId", isWorthRaisingAgain: morePeople },
  bandNotInPlan: {
    seenBy: "maintainers",
    isWorthRaisingAgain: (dismissed, raised) => {
      const before = parsedAs(channelsMeasure, dismissed.measure, raised.kind);
      if (before === null) return false;
      return raised.measure.channels.some((channel) => !before.channels.includes(channel)) || hasMorePeople(raised.measure, before);
    },
  },
  readerQuirk: { seenBy: "admins", isWorthRaisingAgain: morePeople },
  deviceRevoked: {
    seenBy: "admins",
    isWorthRaisingAgain: (dismissed, raised) => {
      const before = parsedAs(revocationMeasure, dismissed.measure, raised.kind);
      return before !== null && (raised.measure.serial !== before.serial || raised.measure.revocationStatus !== before.revocationStatus);
    },
  },
  untrustedContributor: {
    seenBy: "admins",
    isWorthRaisingAgain: (dismissed, raised) => {
      const before = parsedAs(devicesMeasure, dismissed.measure, raised.kind);
      return before !== null && raised.measure.deviceIds.some((deviceId) => !before.deviceIds.includes(deviceId));
    },
  },
  unmatchedSite: siteKind,
  positionShifts: siteKind,
  suggestedSite: siteKind,
  positionDiffers: siteKind,
  renumbered: siteKind,
  nodeSpansPlaces: { ...siteKind, seenBy: "admins" },
  bearingDiffers: {
    seenBy: "area",
    restsOn: "observedCellId",
    isWorthRaisingAgain: (dismissed, raised) => {
      const before = parsedAs(sectorMeasure, dismissed.measure, raised.kind);
      return before !== null && (raised.measure.azimuth !== before.azimuth || hasMorePeople(raised.measure, before));
    },
  },
  possiblyDecommissioned: {
    seenBy: "area",
    isWorthRaisingAgain: (dismissed, raised) => {
      const before = parsedAs(sightingMeasure, dismissed.measure, raised.kind);
      return before !== null && (raised.measure.lastSeenOn !== before.lastSeenOn || hasMorePeople(raised.measure, before));
    },
  },
  gnbLengthSuggestion: {
    seenBy: "admins",
    isWorthRaisingAgain: (dismissed, raised) => {
      const before = parsedAs(gnbLengthMeasure, dismissed.measure, raised.kind);
      return before !== null && (raised.measure.length !== before.length || raised.measure.suggestedLength !== before.suggestedLength);
    },
  },
  siteIdKnown: {
    seenBy: "area",
    restsOn: "observedSiteId",
    isWorthRaisingAgain: (dismissed, raised) => {
      const before = parsedAs(siteIdMeasure, dismissed.measure, raised.kind);
      return before !== null && raised.measure.siteId !== before.siteId;
    },
  },
};

export function kindsSeenBy(audience: FlagAudience): ObservationFlagKind[] {
  return OBSERVATION_FLAG_KINDS.filter((kind) => FLAG_KINDS[kind].seenBy === audience);
}

export function kindsRestingOn(reference: "observedCellId" | "observedSiteId"): ObservationFlagKind[] {
  return OBSERVATION_FLAG_KINDS.filter((kind) => FLAG_KINDS[kind].restsOn === reference);
}

export function isWorthRaisingAgain<Kind extends ObservationFlagKind>(dismissed: ClosedFlag, raised: RaisedFlag<Kind>): boolean {
  const definition: FlagKindDefinition<Kind> = FLAG_KINDS[raised.kind];
  return definition.isWorthRaisingAgain(dismissed, raised);
}
