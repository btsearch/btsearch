import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { UserAccount } from "../../types";
import { getBanSummary, getBanUntilLabel } from "../../utils/ban";
import { getAccountName } from "../../utils/identity";
import { getUserRoleLabel } from "../../utils/roles";
import { getUserStatus, getUserStatusLabel } from "../../utils/userStatus";
import { GrantChipList, GrantChipSkeleton } from "../shared/grantChip";
import { UserStatusBadge } from "../shared/userStatusBadge";
import type { UserListGrantChips, UserListRow } from "./useUserListRows";
import { RoleBadge } from "@/components/app/roleBadge";
import { UserAvatar } from "@/components/app/userAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function EmailVerifiedMark({ className }: { className: string }) {
  const { t } = useTranslation("settings");
  const label = t("settings:account.email.verified");

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0 text-emerald-600 dark:text-emerald-500" />}>
        <HugeiconsIcon icon={CheckmarkCircle02Icon} role="img" aria-label={label} className={className} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function UserGrantChips({ chips }: { chips: UserListGrantChips | null }) {
  if (chips === null) return null;
  if (chips.state === "loading") return <GrantChipSkeleton />;
  return <GrantChipList grants={chips.grants} regionNames={chips.regionNames} />;
}

export function UserIdentity({ row }: { row: UserListRow }) {
  const { t } = useTranslation("admin");
  const { user, isViewer } = row;
  const accountName = getAccountName({ name: user.name, email: user.account.email });

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="flex shrink-0">
        <UserAvatar user={{ name: accountName, image: user.image }} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {accountName}
          {isViewer ? <span className="font-normal text-muted-foreground"> {t("admin:users.shared.you")}</span> : null}
        </div>
        {user.username ? <div className="truncate text-xs text-muted-foreground">@{user.username}</div> : null}
      </div>
    </div>
  );
}

export function UserEmail({ account, isCompact = false }: { account: UserAccount; isCompact?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center", isCompact ? "gap-1 text-xs text-muted-foreground" : "gap-1.5")}>
      <span className="truncate" title={account.email}>
        {account.email}
      </span>
      {account.isEmailVerified ? <EmailVerifiedMark className={isCompact ? "size-3" : "size-3.5"} /> : null}
    </div>
  );
}

export function UserAccessSummary({ row }: { row: UserListRow }) {
  const { t } = useTranslation("admin");
  const { role } = row.user.account;

  if (role === "user") return <span className="text-muted-foreground">{getUserRoleLabel(t, role)}</span>;

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      <RoleBadge role={role} />
      {role === "admin" ? (
        <span className="text-xs whitespace-nowrap text-muted-foreground">{t("admin:users.shared.inline.allCountries")}</span>
      ) : (
        <UserGrantChips chips={row.grantChips} />
      )}
    </div>
  );
}

export function UserStatusSummary({ account }: { account: UserAccount }) {
  const { t, i18n } = useTranslation("admin");
  const status = getUserStatus(account);

  if (status === "active") return <span className="text-muted-foreground">{getUserStatusLabel(t, status)}</span>;
  if (status === "unverified") return <UserStatusBadge status={status} />;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
          <UserStatusBadge status={status} />
        </TooltipTrigger>
        <TooltipContent>{getBanSummary(t, i18n.language, account)}</TooltipContent>
      </Tooltip>
      <span className="text-xs whitespace-nowrap text-muted-foreground">{getBanUntilLabel(t, i18n.language, account.banExpiresAt, "short")}</span>
    </div>
  );
}
