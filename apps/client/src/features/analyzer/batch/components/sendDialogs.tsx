import { SentIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EDIT_LIMITS } from "@/features/station-editing/model/validate";
import { cn } from "@/lib/utils";

type SendNotePopoverProps = {
  label: string;
  note: string;
  leftOutConfirmCount: number;
  isDisabled: boolean;
  isSending: boolean;
  disabledReason?: string;
  triggerClassName?: string;
  onNoteChange: (note: string) => void;
  onSend: () => void;
};

type ApplyDialogProps = {
  stationCount: number;
  changeCount: number;
  isDisabled: boolean;
  isApplying: boolean;
  disabledReason?: string;
  triggerClassName?: string;
  onApply: () => void;
};

export function SendNotePopover({
  label,
  note,
  leftOutConfirmCount,
  isDisabled,
  isSending,
  disabledReason,
  triggerClassName,
  onNoteChange,
  onSend,
}: SendNotePopoverProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const noteId = useId();

  function send() {
    setIsOpen(false);
    onSend();
  }

  return (
    <Popover open={isOpen && !isDisabled} onOpenChange={setIsOpen}>
      <PopoverTrigger
        title={isDisabled ? disabledReason : undefined}
        render={<Button type="button" variant="outline" disabled={isDisabled} className={cn("cursor-pointer", triggerClassName)} />}
      >
        {isSending ? <Spinner /> : null}
        {isSending ? t("cellAnalyzer:batch.sending") : label}
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[360px] max-w-[calc(100vw-1.5rem)] gap-2.5 rounded-xl p-3">
        <PopoverHeader>
          <PopoverTitle className="text-[13px] leading-[18px] font-semibold">{t("cellAnalyzer:batch.sendAsSubmissions")}</PopoverTitle>
          <PopoverDescription className="text-xs leading-4">{t("cellAnalyzer:batch.sendHint")}</PopoverDescription>
        </PopoverHeader>
        <div>
          <label htmlFor={noteId} className="mb-1 block text-xs leading-4 font-medium">
            {t("cellAnalyzer:batch.noteLabel")}
          </label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={t("submissions:batch.submitterNotePlaceholder")}
            maxLength={EDIT_LIMITS.submissionNote}
            rows={2}
            className="min-h-15 resize-none text-sm"
          />
        </div>
        {leftOutConfirmCount > 0 ? (
          <p className="text-xs leading-4 text-muted-foreground">{t("cellAnalyzer:batch.confirmationsLeftOut", { count: leftOutConfirmCount })}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="cursor-pointer">
            {t("common:actions.cancel")}
          </Button>
          <Button type="button" size="sm" onClick={send} className="cursor-pointer font-semibold">
            {t("cellAnalyzer:batch.send")}
            <HugeiconsIcon icon={SentIcon} aria-hidden="true" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ApplyDialog({ stationCount, changeCount, isDisabled, isApplying, disabledReason, triggerClassName, onApply }: ApplyDialogProps) {
  const { t } = useTranslation();
  const stations = t("cellAnalyzer:batch.onStations", { count: stationCount });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        title={isDisabled ? disabledReason : undefined}
        render={<Button type="button" disabled={isDisabled} className={cn("cursor-pointer font-semibold", triggerClassName)} />}
      >
        {isApplying ? <Spinner /> : <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" />}
        {isApplying ? t("cellAnalyzer:batch.saving") : t("cellAnalyzer:batch.apply")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cellAnalyzer:batch.applyConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("cellAnalyzer:batch.applyConfirmText", { count: changeCount, stations })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">{t("common:actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction className="cursor-pointer font-semibold" onClick={onApply}>
            {t("cellAnalyzer:batch.apply")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
