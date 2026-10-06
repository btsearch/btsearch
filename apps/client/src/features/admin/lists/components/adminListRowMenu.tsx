import {
  ArrowUpRight01Icon,
  Delete02Icon,
  Globe02Icon,
  MoreHorizontalCircle01Icon,
  PencilEdit02Icon,
  SecurityLockIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { List } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useAdminListActions } from "./adminListActions";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MENU_BUTTON_CLASS = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "cursor-pointer");
const MENU_ITEM_CLASS = "cursor-pointer";

export function AdminListRowMenu({ list, className }: { list: List; className?: string }) {
  const { t } = useTranslation(["admin", "common", "lists"]);
  const { pendingListId, onEdit, onVisibilityToggle, onDelete } = useAdminListActions();
  const label = t("lists:options");

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger aria-label={label} className={cn(MENU_BUTTON_CLASS, className)} />}>
          <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuItem className={MENU_ITEM_CLASS} render={<Link to="/lists/$uuid" params={{ uuid: list.id }} />}>
          <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} aria-hidden="true" />
          {t("admin:lists.menu.openOnMap")}
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={() => onEdit(list)}>
          <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} aria-hidden="true" />
          {t("admin:lists.menu.rename")}
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ITEM_CLASS} disabled={pendingListId === list.id} onClick={() => onVisibilityToggle(list)}>
          <HugeiconsIcon icon={list.isPublic ? SecurityLockIcon : Globe02Icon} strokeWidth={2} aria-hidden="true" />
          {list.isPublic ? t("lists:togglePrivate") : t("lists:togglePublic")}
        </DropdownMenuItem>
        {list.owner === undefined ? null : (
          <DropdownMenuItem className={MENU_ITEM_CLASS} render={<Link to="/admin/users/$id" params={{ id: list.owner.id }} />}>
            <HugeiconsIcon icon={UserIcon} strokeWidth={2} aria-hidden="true" />
            {t("admin:lists.menu.ownerAdminProfile")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className={MENU_ITEM_CLASS} onClick={() => onDelete(list)}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} aria-hidden="true" />
          {t("common:actions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
