import type { AuditUserSummary } from "../types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

type UserChipProps = {
  user: AuditUserSummary | null;
  systemLabel: string;
  className?: string;
};

export function UserChip({ user, systemLabel, className }: UserChipProps) {
  if (!user) return <span className={cn("text-muted-foreground italic text-xs", className)}>{systemLabel}</span>;

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar className="size-6 shrink-0">
        <AvatarImage src={resolveAvatarUrl(user.image)} />
        <AvatarFallback className="text-[9px]">{(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="max-w-28 truncate text-xs font-medium">{user.name ?? user.username ?? systemLabel}</span>
        {user.username ? <span className="max-w-28 truncate text-[10px] text-muted-foreground">@{user.username}</span> : null}
      </div>
    </div>
  );
}
