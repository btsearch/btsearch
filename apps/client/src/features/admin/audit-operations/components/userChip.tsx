import type { UserRef } from "../types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserLink } from "@/features/user-profile/components/userLink";
import { resolveAvatarUrl } from "@/lib/format";

type UserChipProps = {
  user: UserRef | null;
  systemLabel: string;
  linked?: boolean;
};

export function UserChip({ user, systemLabel, linked = false }: UserChipProps) {
  if (!user) return <span className="text-muted-foreground italic text-xs">{systemLabel}</span>;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-6 shrink-0">
        <AvatarImage src={resolveAvatarUrl(user.image)} />
        <AvatarFallback className="text-[9px]">{(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <UserLink user={linked ? user : null} className="max-w-28 self-start truncate text-xs font-medium">
          {user.name ?? user.username ?? systemLabel}
        </UserLink>
        {user.username ? <span className="max-w-28 truncate text-[10px] text-muted-foreground">@{user.username}</span> : null}
      </div>
    </div>
  );
}
