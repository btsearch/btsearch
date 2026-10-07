import { Link } from "@tanstack/react-router";

import type { TeamMember } from "./teamMember";
import { UserAvatar } from "@/components/app/userAvatar";
import { cn } from "@/lib/utils";

type TeamMemberIdentityProps = {
  member: TeamMember;
  isLinked: boolean;
  className?: string;
};

const MEMBER_NAME_CLASS = "truncate text-sm leading-5 font-medium";
const MEMBER_NAME_LINK_CLASS = cn(
  "block w-fit max-w-full cursor-pointer rounded-sm underline-offset-2 outline-none hover:underline",
  "focus-visible:ring-2 focus-visible:ring-ring",
  MEMBER_NAME_CLASS,
);

export const TEAM_ROW_ITEM_CLASS = "@container/member border-t first:border-t-0";
export const TEAM_ROW_CLASS = "flex min-h-15 items-center gap-3.5 px-4 py-3 sm:px-5";
export const TEAM_ROW_BODY_CLASS = "flex min-w-0 flex-1 flex-col @lg/member:flex-row @lg/member:items-center @lg/member:gap-3.5";

export function TeamMemberAvatar({ member }: { member: TeamMember }) {
  return (
    <span aria-hidden="true" className="flex shrink-0">
      <UserAvatar user={member.avatar} />
    </span>
  );
}

export function TeamMemberIdentity({ member, isLinked, className }: TeamMemberIdentityProps) {
  return (
    <div className={cn("min-w-0", className)}>
      {isLinked && member.hasAccount ? (
        <Link to="/admin/users/$id" params={{ id: member.userId }} className={MEMBER_NAME_LINK_CLASS}>
          {member.name}
        </Link>
      ) : (
        <p className={MEMBER_NAME_CLASS}>{member.name}</p>
      )}
      {member.handle === null ? null : <p className="truncate text-xs leading-4 text-muted-foreground">{member.handle}</p>}
    </div>
  );
}
