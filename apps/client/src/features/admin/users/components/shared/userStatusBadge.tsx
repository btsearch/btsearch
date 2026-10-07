import { Alert02Icon, UserBlock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { type UserStatus, getUserStatusLabel } from "../../utils/userStatus";
import { Badge } from "@/components/ui/badge";

type BadgedUserStatus = Exclude<UserStatus, "active">;

const USER_STATUS_BADGES = {
  unverified: { icon: Alert02Icon, variant: "secondary", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  banned: { icon: UserBlock01Icon, variant: "destructive", className: "" },
} as const;

export function UserStatusBadge({ status }: { status: BadgedUserStatus }) {
  const { t } = useTranslation("admin");
  const badge = USER_STATUS_BADGES[status];

  return (
    <Badge variant={badge.variant} className={badge.className}>
      <HugeiconsIcon icon={badge.icon} data-icon="inline-start" aria-hidden="true" />
      {getUserStatusLabel(t, status)}
    </Badge>
  );
}
