import type { ObservationFlag, ObservationFlagKind } from "@openbts/shared/contract";
import type { TFunction } from "i18next";

export type FlagOfKind<Kind extends ObservationFlagKind> = Extract<ObservationFlag, { kind: Kind }>;

type FlagApplyRoute = "cells" | "station" | "siteId" | "band" | "readingBlock";
type FlagGroup = "cells" | "networks" | "sites" | "admin";
type FlagButton = "dismiss" | "ignore" | "link" | "edit";

type KindRule = {
  group: FlagGroup;
  isAboutSite: boolean;
  showsEstimateMap: boolean;
  applyRoute: FlagApplyRoute | null;
  buttons: readonly FlagButton[];
};

const CELL_CHANGE_KINDS = [
  "cellMissing",
  "valueDiffers",
  "valueMissing",
  "networkMissing",
  "networkNotSeen",
  "suggestedSite",
  "renumbered",
] as const satisfies readonly ObservationFlagKind[];

type CellChangeFlag = FlagOfKind<(typeof CELL_CHANGE_KINDS)[number]>;

const FLAG_GROUPS: readonly FlagGroup[] = ["cells", "networks", "sites", "admin"];
const STATION_BUTTONS: readonly FlagButton[] = ["dismiss", "edit"];
const SITE_BUTTONS: readonly FlagButton[] = ["ignore", "link"];
const DISMISS_ONLY: readonly FlagButton[] = ["dismiss"];

const KIND_RULES: Record<ObservationFlagKind, KindRule> = {
  valueDiffers: { group: "cells", isAboutSite: false, showsEstimateMap: false, applyRoute: "cells", buttons: STATION_BUTTONS },
  valueMissing: { group: "cells", isAboutSite: false, showsEstimateMap: false, applyRoute: "cells", buttons: STATION_BUTTONS },
  cellMissing: { group: "cells", isAboutSite: false, showsEstimateMap: false, applyRoute: "cells", buttons: STATION_BUTTONS },
  possiblyDecommissioned: { group: "cells", isAboutSite: false, showsEstimateMap: false, applyRoute: null, buttons: STATION_BUTTONS },
  bearingDiffers: { group: "cells", isAboutSite: false, showsEstimateMap: false, applyRoute: null, buttons: STATION_BUTTONS },
  networkMissing: { group: "networks", isAboutSite: false, showsEstimateMap: false, applyRoute: "cells", buttons: STATION_BUTTONS },
  networkNotSeen: { group: "networks", isAboutSite: false, showsEstimateMap: false, applyRoute: "cells", buttons: STATION_BUTTONS },
  unmatchedSite: { group: "sites", isAboutSite: true, showsEstimateMap: true, applyRoute: "station", buttons: SITE_BUTTONS },
  positionShifts: { group: "sites", isAboutSite: true, showsEstimateMap: true, applyRoute: "station", buttons: SITE_BUTTONS },
  suggestedSite: { group: "sites", isAboutSite: true, showsEstimateMap: true, applyRoute: "cells", buttons: SITE_BUTTONS },
  positionDiffers: { group: "sites", isAboutSite: false, showsEstimateMap: true, applyRoute: null, buttons: STATION_BUTTONS },
  renumbered: { group: "sites", isAboutSite: false, showsEstimateMap: false, applyRoute: "cells", buttons: STATION_BUTTONS },
  siteIdKnown: { group: "sites", isAboutSite: false, showsEstimateMap: false, applyRoute: "siteId", buttons: STATION_BUTTONS },
  bandNotInPlan: { group: "admin", isAboutSite: false, showsEstimateMap: false, applyRoute: "band", buttons: DISMISS_ONLY },
  readerQuirk: { group: "admin", isAboutSite: false, showsEstimateMap: false, applyRoute: "readingBlock", buttons: DISMISS_ONLY },
  deviceRevoked: { group: "admin", isAboutSite: false, showsEstimateMap: false, applyRoute: null, buttons: DISMISS_ONLY },
  untrustedContributor: { group: "admin", isAboutSite: false, showsEstimateMap: false, applyRoute: null, buttons: STATION_BUTTONS },
  nodeSpansPlaces: { group: "admin", isAboutSite: true, showsEstimateMap: false, applyRoute: null, buttons: ["ignore"] },
  gnbLengthSuggestion: { group: "admin", isAboutSite: false, showsEstimateMap: false, applyRoute: null, buttons: DISMISS_ONLY },
};

export function isFlagKind(value: unknown): value is ObservationFlagKind {
  return typeof value === "string" && Object.hasOwn(KIND_RULES, value);
}

export const FLAG_KINDS: readonly ObservationFlagKind[] = Object.keys(KIND_RULES).filter(isFlagKind);

export const FLAG_KIND_GROUPS = FLAG_GROUPS.map((group) => ({ group, kinds: FLAG_KINDS.filter((kind) => KIND_RULES[kind].group === group) }));

export function getKindLabel(kind: ObservationFlagKind, t: TFunction): string {
  return t(`admin:observationFlags.kinds.${kind}.label`);
}

export function isCellChangeFlag(flag: ObservationFlag): flag is CellChangeFlag {
  return CELL_CHANGE_KINDS.some((kind) => kind === flag.kind);
}

export function isAboutSite(flag: ObservationFlag): boolean {
  return KIND_RULES[flag.kind].isAboutSite;
}

export function showsEstimateMap(flag: ObservationFlag): boolean {
  return KIND_RULES[flag.kind].showsEstimateMap && flag.observedSiteId !== null;
}

export function listFlagButtons(flag: ObservationFlag): readonly FlagButton[] {
  if (flag.status !== "open") return [];
  return KIND_RULES[flag.kind].buttons.filter((button) => button !== "edit" || flag.kind === "untrustedContributor" || flag.stationId !== null);
}

export function getApplyRoute(flag: ObservationFlag): FlagApplyRoute | null {
  if (flag.status !== "open") return null;
  const route = KIND_RULES[flag.kind].applyRoute;
  if (route === "station") return route;
  return flag.suggestion === null ? null : route;
}
