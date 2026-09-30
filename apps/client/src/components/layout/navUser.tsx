import { UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { AccountMenuContent, type AccountUser } from "./accountMenu";
import { UserAvatar } from "@/components/app/userAvatar";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export function NavUser({ user }: { user: AccountUser }) {
  const { isMobile } = useSidebar();
  const { t } = useTranslation("nav");

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              size="lg"
              tooltip={t("floating.account")}
              className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
            />
          }
        >
          <UserAvatar user={user} />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.username ? `@${user.username}` : user.email}</span>
          </div>
          <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto text-muted-foreground" />
        </DropdownMenuTrigger>
        <AccountMenuContent user={user} side={isMobile ? "top" : "right"} align="end" sideOffset={isMobile ? 4 : 16} collisionPadding={8} />
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

export function NavUserSkeleton() {
  return (
    <SidebarMenuItem>
      <div aria-hidden="true" className="flex h-12 items-center gap-2 px-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-2 w-16" />
        </div>
      </div>
    </SidebarMenuItem>
  );
}
