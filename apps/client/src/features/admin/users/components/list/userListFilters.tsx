import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { USER_SEARCH_MAX_LENGTH } from "../../constants";
import type { UserRole } from "../../types";
import { USER_ROLES, getUserRoleLabel } from "../../utils/roles";
import { USER_ROLE_ICONS } from "../shared/userRoleIcon";
import type { UserListStatus } from "./userListSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

export type UserListFilterProps = {
  searchText: string;
  roles: readonly UserRole[];
  status: UserListStatus;
  activeFilterCount: number;
  onSearchTextChange: (text: string) => void;
  onRolesChange: (roles: UserRole[]) => void;
  onStatusChange: (status: UserListStatus) => void;
  onClearFilters: () => void;
};

type UserStatusOption = {
  value: UserListStatus;
  label: string;
};

type UserSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  inputClassName?: string;
};

type UserRoleTogglesProps = {
  roles: readonly UserRole[];
  onRolesChange: (roles: UserRole[]) => void;
  layout: "row" | "list";
  ariaLabel?: string;
  ariaLabelledBy?: string;
};

const PRESSED_TOGGLE_CLASS = "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:hover:bg-primary/15";

export function useUserStatusOptions(): UserStatusOption[] {
  const { t } = useTranslation("admin");

  return [
    { value: "all", label: t("users.list.status.all") },
    { value: "active", label: t("users.list.status.active") },
    { value: "banned", label: t("users.list.status.banned") },
  ];
}

export function UserSearchField({ value, onChange, id, label, inputClassName }: UserSearchFieldProps) {
  const { t } = useTranslation(["admin", "common"]);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearLabel = t("common:actions.clear");

  return (
    <div className="relative">
      <HugeiconsIcon
        icon={Search01Icon}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={t("users.list.searchPlaceholder")}
        aria-label={label}
        maxLength={USER_SEARCH_MAX_LENGTH}
        {...NO_AUTOFILL_PROPS}
        spellCheck={false}
        className={cn("pr-8 pl-8", inputClassName)}
      />
      {value === "" ? null : (
        <Tooltip>
          <TooltipTrigger
            aria-label={clearLabel}
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer text-muted-foreground"
              />
            }
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{clearLabel}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function UserRoleToggles({ roles, onRolesChange, layout, ariaLabel, ariaLabelledBy }: UserRoleTogglesProps) {
  const { t } = useTranslation("admin");
  const isList = layout === "list";

  return (
    <div role="group" aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} className={isList ? "grid gap-1" : "flex gap-1"}>
      {USER_ROLES.map((role) => {
        const isPressed = roles.includes(role);

        return (
          <Button
            key={role}
            type="button"
            variant={isPressed || isList ? "ghost" : "outline"}
            aria-pressed={isPressed}
            className={cn("cursor-pointer", isList && "w-full justify-start px-2 font-normal", isPressed && PRESSED_TOGGLE_CLASS)}
            onClick={() => onRolesChange(isPressed ? roles.filter((selected) => selected !== role) : [...roles, role])}
          >
            <HugeiconsIcon
              icon={USER_ROLE_ICONS[role].icon}
              data-icon="inline-start"
              aria-hidden="true"
              className={isPressed ? undefined : USER_ROLE_ICONS[role].className}
            />
            {getUserRoleLabel(t, role)}
          </Button>
        );
      })}
    </div>
  );
}
