import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { memo, useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { getEntityLabel, getOpLabel } from "../labels";
import { auditOperationQueryOptions } from "../queries";
import type { AuditEntry, AuditOperationSummary } from "../types";
import { ChangesTable } from "./changes-table";
import { OperationKindBadge } from "./operation-kind-badge";
import { RevertOperationDialog } from "./revert-dialog";
import type { RevertDialogCounts } from "./revert-dialog";
import { UserChip } from "./user-chip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type RevertTarget = {
  operationId: number;
  entryIds?: number[];
  counts: RevertDialogCounts;
};

type OperationDetailSheetProps = {
  operationId: number;
  listRow?: AuditOperationSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenOperation: (operationId: number) => void;
};

const EMPTY_ENTRIES: AuditEntry[] = [];

function metadataNumber(metadata: Record<string, unknown> | null, key: string): number | null {
  const value = metadata?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function getEntryActionClass(op: AuditEntry["op"]): string {
  if (op === "create") return "text-emerald-700 dark:text-emerald-300";
  if (op === "delete") return "text-rose-700 dark:text-rose-300";
  return "text-blue-700 dark:text-blue-300";
}

const OperationEntryBlock = memo(function OperationEntryBlock({ entry, onRevert }: { entry: AuditEntry; onRevert: (entry: AuditEntry) => void }) {
  const { t } = useTranslation("admin");
  const revertButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={!entry.revertible}
      onClick={() => onRevert(entry)}
      aria-label={t("auditLogs.revert.entryAction")}
    >
      <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-3.5" aria-hidden="true" />
    </Button>
  );

  return (
    <article className="[content-visibility:auto] [contain-intrinsic-size:auto_8rem]">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <span className="text-xs font-medium">{getEntityLabel(t, entry.entity)}</span>
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", getEntryActionClass(entry.op))}>{getOpLabel(t, entry.op)}</span>
        {entry.record_id ? <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">#{entry.record_id}</span> : null}
        <div className="ml-auto shrink-0">
          {entry.revertible ? (
            revertButton
          ) : (
            <Tooltip>
              <TooltipTrigger render={<span />}>{revertButton}</TooltipTrigger>
              <TooltipContent>{entry.revert_reason ?? t("auditLogs.revert.notRevertible")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <ChangesTable oldValues={entry.old_values} newValues={entry.new_values} />
    </article>
  );
});

function OperationDetailFallback({ isError, onRetry }: { isError: boolean; onRetry: () => void }) {
  const { t } = useTranslation("common");

  if (isError)
    return (
      <div className="mx-4 rounded-lg border border-destructive/25 bg-destructive/5 p-3" role="alert">
        <p className="text-sm text-destructive">{t("error.title")}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          {t("actions.retry")}
        </Button>
      </div>
    );

  return (
    <div className="space-y-4 px-4" aria-hidden="true">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function OperationDetailSheet({ operationId, listRow, open, onOpenChange, onOpenOperation }: OperationDetailSheetProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const [revertTarget, setRevertTarget] = useState<RevertTarget | null>(null);
  const detailQuery = useQuery({ ...auditOperationQueryOptions(operationId), enabled: open });
  const operation = detailQuery.data ?? listRow ?? null;
  const entries = detailQuery.data?.entries ?? EMPTY_ENTRIES;
  const submissionId = metadataNumber(operation?.metadata ?? null, "submission_id");
  const revertsOperationId = operation?.reverts_operation_id ?? null;
  const revertedByOperationId = operation?.reverted_by_operation_id ?? null;
  const metadata = operation?.metadata ?? null;
  const hasMetadata = metadata !== null && Object.keys(metadata).length > 0;

  function openLinkedOperation(id: number): void {
    setRevertTarget(null);
    onOpenOperation(id);
  }

  const openEntryRevert = useCallback(
    (entry: AuditEntry): void => {
      setRevertTarget({ operationId, entryIds: [entry.id], counts: { revertible: 1, skipped: 0 } });
    },
    [operationId],
  );

  function openFullRevert(): void {
    const revertible = entries.filter((entry) => entry.revertible).length;
    setRevertTarget({ operationId, counts: { revertible, skipped: entries.length - revertible } });
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) setRevertTarget(null);
    onOpenChange(nextOpen);
  }

  const fullRevertButton = (
    <Button variant="outline" size="sm" disabled={detailQuery.data?.revertible !== true} onClick={openFullRevert}>
      <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-4" aria-hidden="true" />
      {t("auditLogs.revert.action")}
    </Button>
  );
  let fullRevertControl = fullRevertButton;
  if (detailQuery.data !== undefined && !detailQuery.data.revertible)
    fullRevertControl = (
      <Tooltip>
        <TooltipTrigger render={<span className="w-fit" />}>{fullRevertButton}</TooltipTrigger>
        <TooltipContent>
          {revertedByOperationId !== null ? t("auditLogs.revert.alreadyReverted") : t("auditLogs.revert.notRevertible")}
        </TooltipContent>
      </Tooltip>
    );

  let changesContent: ReactNode;
  if (detailQuery.isPending)
    changesContent = (
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  else if (detailQuery.isError)
    changesContent = (
      <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3" role="alert">
        <p className="text-sm text-destructive">{t("common:error.title")}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void detailQuery.refetch()}>
          {t("common:actions.retry")}
        </Button>
      </div>
    );
  else
    changesContent = (
      <div className="space-y-4">
        {entries.map((entry) => (
          <OperationEntryBlock key={entry.id} entry={entry} onRevert={openEntryRevert} />
        ))}
      </div>
    );

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full! max-w-xl! sm:max-w-5xl! overflow-y-auto custom-scrollbar">
          <SheetHeader>
            <SheetTitle>{t("auditLogs.detail.title")}</SheetTitle>
            <SheetDescription>
              #{operationId}
              {operation ? ` · ${formatFullDate(operation.createdAt, i18n.language)}` : ""}
            </SheetDescription>
          </SheetHeader>

          {operation ? (
            <div className="flex flex-col gap-5 px-4 pb-4">
              {operation.reverted_by_operation_id !== null ? (
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{t("auditLogs.revert.alreadyReverted")}</p>
              ) : null}

              <section className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.overview")}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.columns.kind")}</span>
                    <OperationKindBadge kind={operation.kind} t={t} className="w-fit" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.columns.source")}</span>
                    <span className="text-sm uppercase">{operation.source}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.columns.actor")}</span>
                    <UserChip user={operation.actor} systemLabel={t("auditLogs.actor.system")} />
                  </div>
                  {operation.performer && operation.performer.id !== operation.actor?.id ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.performedBy")}</span>
                      <UserChip user={operation.performer} systemLabel={t("auditLogs.actor.system")} />
                    </div>
                  ) : null}
                  {operation.station_ids.length > 0 || submissionId !== null ? (
                    <div className="col-span-2 flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.links")}</span>
                      <div className="flex flex-wrap gap-2">
                        {operation.station_ids.map((stationId) => (
                          <Link
                            key={stationId}
                            to="/admin/stations/$id"
                            params={{ id: String(stationId) }}
                            search={{ uke: undefined }}
                            className="text-sm text-primary hover:underline"
                            onClick={() => handleOpenChange(false)}
                          >
                            {t("auditLogs.detail.station")} #{stationId}
                          </Link>
                        ))}
                        {submissionId !== null ? (
                          <Link
                            to="/admin/submissions/$id"
                            params={{ id: String(submissionId) }}
                            className="text-sm text-primary hover:underline"
                            onClick={() => handleOpenChange(false)}
                          >
                            {t("auditLogs.detail.submission")} #{submissionId}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {revertsOperationId !== null ? (
                    <button
                      type="button"
                      className="col-span-2 w-fit text-sm text-primary hover:underline"
                      onClick={() => openLinkedOperation(revertsOperationId)}
                    >
                      {t("auditLogs.detail.reverts", { id: revertsOperationId })}
                    </button>
                  ) : null}
                  {revertedByOperationId !== null ? (
                    <button
                      type="button"
                      className="col-span-2 w-fit text-sm text-primary hover:underline"
                      onClick={() => openLinkedOperation(revertedByOperationId)}
                    >
                      {t("auditLogs.detail.revertedBy", { id: revertedByOperationId })}
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.changes")}</h3>
                  {fullRevertControl}
                </div>
                {changesContent}
              </section>

              {hasMetadata || operation.ip_address || operation.user_agent ? (
                <section className="flex flex-col gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.metadata")}</h3>
                  <div className="flex flex-col gap-2 text-sm">
                    {operation.ip_address ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.ipAddress")}</span>
                        <span className="font-mono text-xs">{operation.ip_address}</span>
                      </div>
                    ) : null}
                    {operation.user_agent ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.userAgent")}</span>
                        <span className="font-mono text-xs text-muted-foreground break-all">{operation.user_agent}</span>
                      </div>
                    ) : null}
                    {hasMetadata ? (
                      <div className="rounded-lg border p-3 bg-muted/30">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">
                          {JSON.stringify(metadata, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <OperationDetailFallback isError={detailQuery.isError} onRetry={() => void detailQuery.refetch()} />
          )}
        </SheetContent>
      </Sheet>

      {revertTarget ? (
        <RevertOperationDialog
          operationId={revertTarget.operationId}
          entryIds={revertTarget.entryIds}
          counts={revertTarget.counts}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setRevertTarget(null);
          }}
        />
      ) : null}
    </>
  );
}
