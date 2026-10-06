import { AlertCircleIcon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { StationDraftApi } from "../../hooks/useStationDraft";
import type { EditError } from "../../model/types";
import { ErrorsList } from "./errorsList";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

type ErrorsChipProps = {
  edit: StationDraftApi;
  errors?: readonly EditError[];
  openRequest: number;
};

type ErrorsChipShellProps = {
  count: number;
  title: string;
  openRequest: number;
  align?: "start" | "end";
  children: (closeAfterPick: () => void) => ReactNode;
};

export const CHIP_POPOVER_CLASS = "w-[460px] max-w-[calc(100vw-1.5rem)] gap-0 rounded-xl p-1.5";
export const CHIP_TITLE_CLASS = "px-2 pt-1.5 pb-2 text-[13px] leading-[18px] font-semibold";
export const CHIP_LIST_CLASS = "custom-scrollbar max-h-[min(60vh,28rem)] overflow-y-auto";

export function ErrorsChipShell({ count, title, openRequest, align = "end", children }: ErrorsChipShellProps) {
  const { t } = useTranslation("stations");
  const [isOpen, setIsOpen] = useState(false);
  const [hasPickedError, setHasPickedError] = useState(false);
  const [seenRequest, setSeenRequest] = useState(openRequest);

  if (seenRequest !== openRequest) {
    setSeenRequest(openRequest);
    setHasPickedError(false);
    setIsOpen(true);
  }
  if (count === 0 && isOpen) setIsOpen(false);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setHasPickedError(false);
    setIsOpen(nextOpen);
  }

  function closeAfterPick() {
    setHasPickedError(true);
    setIsOpen(false);
  }

  if (count === 0) return null;

  return (
    <Popover open={isOpen} onOpenChange={changeOpen}>
      <PopoverTrigger render={<Button type="button" variant="destructive" size="sm" className="cursor-pointer font-semibold" />}>
        <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" />
        {t("edit.frame.errorCount", { count })}
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align={align} className={CHIP_POPOVER_CLASS} finalFocus={() => !hasPickedError}>
        <PopoverTitle className={CHIP_TITLE_CLASS}>{title}</PopoverTitle>
        {children(closeAfterPick)}
      </PopoverContent>
    </Popover>
  );
}

export function ErrorsChip({ edit, errors = edit.errors, openRequest }: ErrorsChipProps) {
  const { t } = useTranslation("stations");

  return (
    <ErrorsChipShell count={errors.length} title={t("edit.frame.errorsTitle")} openRequest={openRequest}>
      {(closeAfterPick) => <ErrorsList edit={edit} errors={errors} onPick={closeAfterPick} className={CHIP_LIST_CLASS} />}
    </ErrorsChipShell>
  );
}
