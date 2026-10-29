import type { ReactNode } from "react";

import type { UserRef } from "../types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserLink } from "@/features/user-profile/components/userLink";
import { resolveAvatarUrl } from "@/lib/format";

type UserChipProps = {
  user: UserRef | null;
  systemLabel: string;
  linked?: boolean;
  detail?: ReactNode;
};

const SECOND_LINE_CLASS = "truncate text-xs text-muted-foreground";

export function UserChip({ user, systemLabel, linked = false, detail }: UserChipProps) {
  if (!user) {
    return (
      <div className="flex min-w-0 flex-col">
        <span className="text-muted-foreground italic text-xs">{systemLabel}</span>
        {detail === undefined ? null : <span className={SECOND_LINE_CLASS}>{detail}</span>}
      </div>
    );
  }

  const secondLine = detail ?? (user.name && user.username ? `@${user.username}` : null);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-6 shrink-0">
        <AvatarImage src={resolveAvatarUrl(user.image)} />
        <AvatarFallback className="text-[9px]">{(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <UserLink user={linked ? user : null} className="max-w-full self-start truncate text-xs font-medium">
          {user.name ?? user.username ?? systemLabel}
        </UserLink>
        {secondLine === null ? null : <span className={SECOND_LINE_CLASS}>{secondLine}</span>}
      </div>
    </div>
  );
}
