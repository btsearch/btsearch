import { UserIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import type { UserRole } from "../../types";
import { ROLE_TONES } from "@/components/app/roleTone";

export const USER_ROLE_ICONS: Record<UserRole, { icon: IconSvgElement; className: string }> = {
  user: { icon: UserIcon, className: "text-muted-foreground" },
  editor: { icon: ROLE_TONES.editor.icon, className: "text-primary" },
  admin: { icon: ROLE_TONES.admin.icon, className: "text-rose-700 dark:text-rose-400" },
};
