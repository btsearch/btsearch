import { ArrowRight01Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { getRevertConflicts } from "../api";
import { getEntityLabel } from "../labels";
import { useRevertOperationMutation } from "../mutations";
import type { RevertConflict } from "../types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { showApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export type RevertDialogCounts = {
  revertible: number;
  skipped: number;
};

type RevertOperationDialogProps = {
  operationId: number;
  entryIds?: number[];
  counts?: RevertDialogCounts;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
};

function formatConflictValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  try {
    return JSON.stringify(value) ?? "-";
  } catch {
    return "-";
  }
}

function identifyConflicts(conflicts: readonly RevertConflict[]): { conflict: RevertConflict; key: string }[] {
  const occurrences = new Map<string, number>();
  return conflicts.map((conflict) => {
    const identity = JSON.stringify([
      conflict.entry_id,
      conflict.entity,
      conflict.op,
      conflict.record_id,
      conflict.station_id,
      conflict.kind,
      conflict.constraint,
      conflict.message,
      conflict.fields,
      conflict.dependents,
    ]);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { conflict, key: `${identity}:${occurrence}` };
  });
}

function ConflictItem({ conflict }: { conflict: RevertConflict }) {
  const { t } = useTranslation("admin");
  return (
    <li className="rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <span className="font-medium">{getEntityLabel(t, conflict.entity)}</span>
        {conflict.record_id ? <span className="truncate font-mono text-muted-foreground">#{conflict.record_id}</span> : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{conflict.message}</p>
      {conflict.fields && conflict.fields.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {conflict.fields.map((field) => (
            <div key={field.field} className="min-w-0 text-xs">
              <span className="font-mono text-muted-foreground">{field.field}</span>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 font-mono">
                <span className="min-w-0 rounded-sm bg-red-500/10 px-1 py-px text-red-700 break-all dark:text-red-300">
                  <span className="sr-only">{t("auditLogs.revert.expected")}: </span>
                  {formatConflictValue(field.expected)}
                </span>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 rounded-sm bg-emerald-500/10 px-1 py-px text-emerald-700 break-all dark:text-emerald-300">
                  <span className="sr-only">{t("auditLogs.revert.current")}: </span>
                  {formatConflictValue(field.current)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function RevertOperationDialog({ operationId, entryIds, counts, open, onOpenChange, className }: RevertOperationDialogProps) {
  const { t } = useTranslation("admin");
  const [conflicts, setConflicts] = useState<RevertConflict[]>([]);
  const mutation = useRevertOperationMutation();
  const isEntryRevert = entryIds !== undefined;
  const hasConflicts = conflicts.length > 0;
  const identifiedConflicts = identifyConflicts(conflicts);

  function closeDialog(): void {
    setConflicts([]);
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (mutation.isPending) return;
    closeDialog();
  }

  function submitRevert(force: boolean): void {
    mutation.mutate(
      { operationId, entryIds, force },
      {
        onSuccess: (result) => {
          toast.success(t("auditLogs.revert.success", { count: result.reverted.length }), {
            description: result.skipped.length > 0 ? t("auditLogs.revert.skipped", { count: result.skipped.length }) : undefined,
          });
          closeDialog();
        },
        onError: (error) => {
          const nextConflicts = getRevertConflicts(error);
          if (nextConflicts.length > 0) {
            setConflicts(nextConflicts);
            return;
          }
          showApiError(error);
        },
      },
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className={cn(hasConflicts && "data-[size=default]:sm:max-w-lg", className)}>
        <AlertDialogHeader>
          <AlertDialogMedia className={cn(hasConflicts && "bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive")}>
            <HugeiconsIcon icon={Undo02Icon} aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t(isEntryRevert ? "auditLogs.revert.entryTitle" : "auditLogs.revert.title", { id: operationId })}</AlertDialogTitle>
          <AlertDialogDescription>{t("auditLogs.revert.description")}</AlertDialogDescription>
        </AlertDialogHeader>

        {hasConflicts ? (
          <section aria-labelledby={`revert-conflicts-${operationId}`} role="status" aria-live="polite">
            <h3 id={`revert-conflicts-${operationId}`} className="text-sm font-semibold">
              {t("auditLogs.revert.conflictsTitle")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("auditLogs.revert.conflictsDescription")}</p>
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto custom-scrollbar">
              {identifiedConflicts.map(({ conflict, key }) => (
                <ConflictItem key={key} conflict={conflict} />
              ))}
            </ul>
          </section>
        ) : null}

        {!hasConflicts && counts !== undefined ? (
          <div className="flex flex-wrap gap-x-2 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <span>{t("auditLogs.revert.revertibleCount", { count: counts.revertible })}</span>
            {counts.skipped > 0 ? <span>· {t("auditLogs.revert.skippedCount", { count: counts.skipped })}</span> : null}
          </div>
        ) : null}

        <AlertDialogFooter className="bg-muted/30">
          <AlertDialogCancel disabled={mutation.isPending}>{t("common:actions.cancel")}</AlertDialogCancel>
          <Button variant={hasConflicts ? "destructive" : "default"} disabled={mutation.isPending} onClick={() => submitRevert(hasConflicts)}>
            {mutation.isPending ? <Spinner className="size-4" /> : null}
            {t(hasConflicts ? "auditLogs.revert.force" : "auditLogs.revert.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
