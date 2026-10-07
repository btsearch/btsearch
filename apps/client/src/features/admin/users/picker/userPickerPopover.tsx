import { ArrowDown01Icon, Cancel01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { type PickerUser, pickerSelectedUsersQueryOptions } from "./api";
import { getPickerUserName, indexPickerUsers, toPickerAvatarUser } from "./pickerUser";
import { UserPicker } from "./userPicker";
import { UserAvatar } from "@/components/app/userAvatar";
import { AvatarGroup } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TRIGGER_AVATAR_LIMIT = 3;
const POP_IN_CLASS = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50";
const TRIGGER_AVATAR_CLASS = cn("size-5 *:data-[slot=avatar-fallback]:text-[0.5625rem]", POP_IN_CLASS);
const SWAP_TRANSITION_CLASS = "transition-[opacity,rotate,scale] duration-150 ease-out motion-reduce:transition-none";
const SWAPPED_OUT_CLASS = "scale-50 opacity-0";
const TRIGGER_OPEN_CLASS = cn(
  "aria-expanded:bg-background data-popup-open:border-ring data-popup-open:ring-3 data-popup-open:ring-ring/50",
  "dark:aria-expanded:bg-input/30 dark:data-popup-open:border-ring",
);

type UserPickerPopoverProps = {
  selectedUserIds: string[];
  onSelectionChange: (ids: string[]) => void;
};

function pickTriggerUsers(selectedUserIds: string[], selectedUsers: readonly PickerUser[]): PickerUser[] {
  const usersById = indexPickerUsers(selectedUsers);
  const triggerUsers: PickerUser[] = [];
  for (const id of selectedUserIds) {
    const user = usersById.get(id);
    if (user !== undefined) triggerUsers.push(user);
    if (triggerUsers.length === TRIGGER_AVATAR_LIMIT) break;
  }
  return triggerUsers;
}

function TriggerAvatars({ users }: { users: PickerUser[] }) {
  const firstUser = users.at(0);
  if (firstUser === undefined) return <HugeiconsIcon icon={UserIcon} aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />;
  if (users.length === 1) return <UserAvatar user={toPickerAvatarUser(firstUser)} className={TRIGGER_AVATAR_CLASS} />;

  return (
    <AvatarGroup className="shrink-0 -space-x-1.5">
      {users.map((user) => (
        <UserAvatar key={user.id} user={toPickerAvatarUser(user)} className={TRIGGER_AVATAR_CLASS} />
      ))}
    </AvatarGroup>
  );
}

export function UserPickerPopover({ selectedUserIds, onSelectionChange }: UserPickerPopoverProps) {
  const { t } = useTranslation("admin");
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const { data: selectedUsers } = useQuery(pickerSelectedUsersQueryOptions(selectedUserIds));

  const selectedCount = selectedUserIds.length;
  const hasSelection = selectedCount > 0;
  const showClear = hasSelection && !open;
  const triggerUsers = pickTriggerUsers(selectedUserIds, selectedUsers ?? []);
  const onlyUser = selectedCount === 1 ? triggerUsers.at(0) : undefined;
  const onlyUserName = onlyUser === undefined ? null : getPickerUserName(onlyUser);
  const label = hasSelection ? (onlyUserName ?? t("users.picker.selected", { count: selectedCount })) : t("users.picker.allUsers");

  return (
    <div className="relative inline-flex w-fit max-w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={triggerId}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "max-w-65 min-w-36 cursor-pointer justify-start gap-2 pr-2 font-normal",
            TRIGGER_OPEN_CLASS,
          )}
        >
          <TriggerAvatars users={triggerUsers} />
          <span className={cn("min-w-0 flex-1 truncate text-left", hasSelection && "font-medium")}>{label}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            aria-hidden="true"
            className={cn("size-3.5 shrink-0 text-muted-foreground", SWAP_TRANSITION_CLASS, open && "rotate-180", showClear && SWAPPED_OUT_CLASS)}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0">
          <UserPicker selectedUserIds={selectedUserIds} onSelectionChange={onSelectionChange} />
        </PopoverContent>
      </Popover>
      <Tooltip>
        <TooltipTrigger
          aria-label={t("users.picker.clearSelection")}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              inert={!showClear}
              className={cn(
                "absolute top-1/2 right-1.5 size-5 -translate-y-1/2 cursor-pointer text-muted-foreground",
                SWAP_TRANSITION_CLASS,
                !showClear && SWAPPED_OUT_CLASS,
              )}
            />
          }
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            if (event.currentTarget === document.activeElement) document.getElementById(triggerId)?.focus();
            onSelectionChange([]);
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{t("users.picker.clearSelection")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
