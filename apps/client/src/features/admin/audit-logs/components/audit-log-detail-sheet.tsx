import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { type AuditLogEntry, TABLE_LABELS, getActionStyle } from "../constants";
import { ChangesTable } from "./changes-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatFullDate, resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AuditLogDetailSheetProps {
  entry: AuditLogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditLogDetailSheet({ entry, open, onOpenChange }: AuditLogDetailSheetProps) {
  const { t, i18n } = useTranslation(["admin", "common", "stationDetails"]);

  if (!entry) return null;

  const style = getActionStyle(entry.action);
  const tableLabel =
    entry.table_name === "station_sectors" ? t("tabs.sectors", { ns: "stationDetails" }) : (TABLE_LABELS[entry.table_name] ?? entry.table_name);

  const stationId =
    entry.table_name === "stations" && entry.record_id !== null
      ? entry.record_id
      : ((entry.metadata?.station_id as number | null | undefined) ?? null);
  const submissionId =
    entry.table_name === "submissions" && entry.record_id !== null
      ? entry.record_id
      : ((entry.metadata?.submission_id as number | null | undefined) ?? null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full! max-w-xl! sm:max-w-5xl! overflow-y-auto custom-scrollbar">
        <SheetHeader>
          <SheetTitle>{t("auditLogs.detail.title")}</SheetTitle>
          <SheetDescription>
            #{entry.id} · {formatFullDate(entry.createdAt, i18n.language)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-4">
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.overview")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.columns.action")}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider border w-fit",
                    style.badgeClass,
                  )}
                >
                  <span className={cn("size-1.5 rounded-[1px]", style.dotClass)} />
                  {entry.action}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.columns.entity")}</span>
                <span className="text-sm font-medium">{tableLabel}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.columns.actor")}</span>
                {entry.user ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="size-5">
                      <AvatarImage src={resolveAvatarUrl(entry.user.image)} />
                      <AvatarFallback className="text-[9px]">{entry.user.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm">{entry.user.name}</span>
                      {entry.user.username && <span className="truncate max-w-28 text-[10px] text-muted-foreground">@{entry.user.username}</span>}
                    </div>
                  </div>
                ) : (
                  <span className="text-sm italic text-muted-foreground">{t("auditLogs.actor.system")}</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.columns.source")}</span>
                <span className="text-sm uppercase">{entry.source ?? "-"}</span>
              </div>
              {(stationId !== null || submissionId !== null) && (
                <div className="flex flex-col gap-1 col-span-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.links")}</span>
                  <div className="flex flex-wrap gap-2">
                    {stationId !== null && (
                      <Link
                        to="/admin/stations/$id"
                        params={{ id: String(stationId) }}
                        search={{ uke: undefined }}
                        className="text-sm text-primary hover:underline"
                        onClick={() => onOpenChange(false)}
                      >
                        {t("auditLogs.detail.station")} #{stationId}
                      </Link>
                    )}
                    {submissionId !== null && (
                      <Link
                        to="/admin/submissions/$id"
                        params={{ id: String(submissionId) }}
                        className="text-sm text-primary hover:underline"
                        onClick={() => onOpenChange(false)}
                      >
                        {t("auditLogs.detail.submission")} #{submissionId}
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.changes")}</h3>
            <ChangesTable oldValues={entry.old_values} newValues={entry.new_values} />
          </section>

          {(entry.metadata || entry.ip_address || entry.user_agent) && (
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.metadata")}</h3>
              <div className="flex flex-col gap-2 text-sm">
                {entry.ip_address && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.ipAddress")}</span>
                    <span className="font-mono text-xs">{entry.ip_address}</span>
                  </div>
                )}
                {entry.user_agent && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("auditLogs.detail.userAgent")}</span>
                    <span className="font-mono text-xs text-muted-foreground break-all">{entry.user_agent}</span>
                  </div>
                )}
                {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
