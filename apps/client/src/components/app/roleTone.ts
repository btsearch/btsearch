import { CrownIcon, SecurityCheckIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

export const ROLE_TONES = {
  editor: { icon: SecurityCheckIcon, badge: "bg-primary/12 text-primary", wash: "from-primary/14 via-primary/6" },
  admin: { icon: CrownIcon, badge: "bg-rose-500/12 text-rose-700 dark:text-rose-400", wash: "from-rose-500/14 via-rose-500/5" },
} as const;

export type ToneRole = keyof typeof ROLE_TONES;

export function isToneRole(role: string | null | undefined): role is ToneRole {
  return role === "editor" || role === "admin";
}

export function roleWashClassName(role: string | null | undefined): string {
  return cn(
    "bg-linear-115 via-34% to-transparent to-70%",
    isToneRole(role) ? ROLE_TONES[role].wash : "from-muted-foreground/12 via-muted-foreground/5",
  );
}
