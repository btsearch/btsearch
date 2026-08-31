import { Cancel01Icon, Clock01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

export const SUBMISSION_STATUS = {
  pending: {
    icon: Clock01Icon,
    label: "pending",
    bgClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    iconClass: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    badgeColor: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  },
  approved: {
    icon: Tick02Icon,
    label: "approved",
    bgClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    badgeColor: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  },
  rejected: {
    icon: Cancel01Icon,
    label: "rejected",
    bgClass: "bg-red-500/10 text-red-700 dark:text-red-400",
    iconClass: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
    badgeColor: "text-red-600 bg-red-500/10 border-red-500/20",
  },
} as const;
