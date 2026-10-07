import { CompassIcon, Image01Icon, Message01Icon, SignalFull02Icon } from "@hugeicons/core-free-icons";

export type TabId = "specs" | "sectors" | "comments" | "photos";

export const TAB_OPTIONS = [
  { id: "specs", labelKey: "stationDetails:tabs.specs", icon: SignalFull02Icon },
  { id: "sectors", labelKey: "stationDetails:tabs.sectors", icon: CompassIcon },
  { id: "comments", labelKey: "stationDetails:tabs.comments", icon: Message01Icon },
  { id: "photos", labelKey: "stationDetails:tabs.photos", icon: Image01Icon },
] as const;
