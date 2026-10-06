import { KeyboardIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

const KEY_CLASS = "inline-flex h-5 items-center rounded-md border bg-muted px-1.5 text-[11px] leading-none font-semibold whitespace-nowrap";

function ShortcutList() {
  const { t } = useTranslation();
  const shortcuts = [
    { keys: "Enter", action: t("stations:edit.cells.shortcuts.nextRow") },
    { keys: "Ctrl + ↑ / ↓", action: t("stations:edit.cells.shortcuts.rowUpDown") },
    { keys: "Ctrl + ← / →", action: t("stations:edit.cells.shortcuts.fieldLeftRight") },
    { keys: "Ctrl + Enter", action: t("stations:edit.cells.shortcuts.newRow") },
    { keys: "Ctrl + D", action: t("stations:edit.cells.shortcuts.duplicate") },
    { keys: "Ctrl + S", action: t("stations:edit.cells.shortcuts.save") },
  ];

  return (
    <>
      <PopoverTitle className="px-2 pt-1.5 pb-2 text-[13px] leading-[18px] font-semibold">{t("stations:edit.cells.shortcuts.title")}</PopoverTitle>
      <dl>
        {shortcuts.map((shortcut) => (
          <div key={shortcut.keys} className="flex items-center gap-2.5 px-2 py-[5px]">
            <dt className="w-[118px] shrink-0">
              <kbd className={KEY_CLASS}>{shortcut.keys}</kbd>
            </dt>
            <dd className="min-w-0 flex-1 text-[13px] leading-[18px] text-muted-foreground">{shortcut.action}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function ShortcutsPopover() {
  const { t } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" className="cursor-pointer text-muted-foreground" />}>
        <HugeiconsIcon icon={KeyboardIcon} aria-hidden="true" />
        {t("stations:edit.cells.shortcuts.button")}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] max-w-[calc(100vw-1rem)] gap-0 p-1.5">
        <ShortcutList />
      </PopoverContent>
    </Popover>
  );
}
