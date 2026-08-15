import { ArrowDown01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { UserPicker } from "./UserPicker";

interface UserPickerPopoverProps {
  selectedUserIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function UserPickerPopover({ selectedUserIds, onSelectionChange }: UserPickerPopoverProps) {
  const { t } = useTranslation("admin");
  const [open, setOpen] = useState(false);

  const label = selectedUserIds.length === 0 ? t("users.picker.allUsers") : t("users.picker.selected", { count: selectedUserIds.length });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "h-8 rounded-lg border bg-transparent px-2.5 text-sm text-foreground transition-colors flex items-center gap-2 min-w-36",
          "border-input dark:bg-input/30 dark:hover:bg-input/50 hover:bg-muted",
        )}
      >
        <HugeiconsIcon icon={UserIcon} className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className={cn("size-3.5 shrink-0 ml-auto transition-transform", open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <UserPicker selectedUserIds={selectedUserIds} onSelectionChange={onSelectionChange} />
      </PopoverContent>
    </Popover>
  );
}
