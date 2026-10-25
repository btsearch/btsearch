import type { UserRef } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { UserAvatar } from "@/components/app/userAvatar";
import { resolveDisplayName } from "@/features/admin/users/utils/identity";

export function useContributorName(user: Pick<UserRef, "name" | "username"> | null): string {
  const { t } = useTranslation("admin");
  return (user === null ? "" : resolveDisplayName(user)) || t("measurements.deletedAccount");
}

export function ContributorIdentity({ user }: { user: UserRef | null }) {
  const name = useContributorName(user);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="flex shrink-0">
        <UserAvatar user={{ name, image: user?.image ?? null }} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        {user?.username ? <div className="truncate text-xs text-muted-foreground">@{user.username}</div> : null}
      </div>
    </div>
  );
}
