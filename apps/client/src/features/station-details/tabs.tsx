import { CompassIcon, Image01Icon, Message01Icon, SignalFull02Icon } from "@hugeicons/core-free-icons";

export type TabId = "specs" | "sectors" | "comments" | "photos";

export const TAB_OPTIONS = [
  { id: "specs", label: "Specifications", icon: SignalFull02Icon },
  { id: "sectors", label: "Azimuths", icon: CompassIcon },
  { id: "comments", label: "Comments", icon: Message01Icon },
  { id: "photos", label: "Photos", icon: Image01Icon },
] as const;
