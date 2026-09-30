import { CrownIcon, SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ROLE_BADGES = {
  editor: { icon: SecurityCheckIcon, className: "bg-primary/12 text-primary" },
  admin: { icon: CrownIcon, className: "bg-linear-to-br from-amber-300 to-amber-500 text-amber-950" },
} as const;

type BadgeRole = keyof typeof ROLE_BADGES;

function isBadgeRole(role: string | null | undefined): role is BadgeRole {
  return role === "editor" || role === "admin";
}

export function RoleBadge({ role, className }: { role: string | null | undefined; className?: string }) {
  const { t } = useTranslation("common");
  if (!isBadgeRole(role)) return null;

  const badge = ROLE_BADGES[role];
  return (
    <Badge variant="secondary" className={cn(badge.className, className)}>
      <HugeiconsIcon icon={badge.icon} data-icon="inline-start" aria-hidden="true" />
      {t(`roles.${role}`)}
    </Badge>
  );
}
