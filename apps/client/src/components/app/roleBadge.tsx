import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { ROLE_TONES, isToneRole } from "./roleTone";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RoleBadge({ role, className }: { role: string | null | undefined; className?: string }) {
  const { t } = useTranslation("common");
  if (!isToneRole(role)) return null;

  const tone = ROLE_TONES[role];
  return (
    <Badge variant="secondary" className={cn(tone.badge, className)}>
      <HugeiconsIcon icon={tone.icon} data-icon="inline-start" aria-hidden="true" />
      {t(`roles.${role}`)}
    </Badge>
  );
}
