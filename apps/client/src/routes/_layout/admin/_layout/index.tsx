import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Delete02Icon,
  MessageMultiple01Icon,
  MinusSignIcon,
  TaskDone02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMutation, useQueries } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Lightbox, type LightboxPhoto } from "@/components/lightbox";
import type { AdminComment } from "@/features/admin/comments/types";
import { API_BASE } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { getOperatorColor } from "@/lib/operatorUtils";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const EditorNotes = lazy(() => import("@/features/admin/dashboard/EditorNotes").then((m) => ({ default: m.EditorNotes })));
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { getActionStyle } from "@/features/admin/audit-logs/constants";
import {
  fetchDashboardStats,
  fetchDashboardDelta,
  fetchPendingSubmissions,
  fetchPendingComments,
  fetchRecentAuditLogs,
  fetchImportStatus,
} from "@/features/admin/dashboard/api";
import type { StepStatus } from "@/features/admin/uke-import/api";
import { SubmissionTypeBadge } from "@/features/submissions/components/submissionTypeBadge";
import { formatRelativeTime, formatShortDate, resolveAvatarUrl } from "@/lib/format";

const STEP_ICON: Record<StepStatus, { icon: IconSvgElement | null; className: string }> = {
  success: { icon: CheckmarkCircle02Icon, className: "text-emerald-500" },
  error: { icon: Cancel01Icon, className: "text-destructive" },
  running: { icon: null, className: "text-primary" },
  pending: { icon: Clock01Icon, className: "text-muted-foreground/50" },
  skipped: { icon: AlertCircleIcon, className: "text-muted-foreground/30" },
};

function AdminDashboardPage() {
  "use no memo";
  const { t, i18n } = useTranslation(["common", "admin", "nav"]);
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  const [statsQuery, deltaQuery, submissionsQuery, commentsQuery, auditQuery, importQuery] = useQueries({
    queries: [
      {
        queryKey: ["admin", "dashboard", "stats"],
        queryFn: fetchDashboardStats,
        staleTime: 30_000,
      },
      {
        queryKey: ["admin", "dashboard", "delta"],
        queryFn: fetchDashboardDelta,
        staleTime: 60_000,
      },
      {
        queryKey: ["admin", "dashboard", "pending-submissions"],
        queryFn: fetchPendingSubmissions,
        staleTime: 0,
        refetchOnMount: "always" as const,
      },
      {
        queryKey: ["admin", "dashboard", "pending-comments"],
        queryFn: fetchPendingComments,
        staleTime: 0,
        refetchOnMount: "always" as const,
      },
      {
        queryKey: ["admin", "dashboard", "audit-logs"],
        queryFn: fetchRecentAuditLogs,
        staleTime: 30_000,
      },
      {
        queryKey: ["admin", "dashboard", "import-status"],
        queryFn: fetchImportStatus,
        staleTime: 30_000,
      },
    ],
  });

  const stats = statsQuery.data;
  const delta = deltaQuery.data?.delta.weekly;
  const pendingCount = submissionsQuery.data?.totalCount ?? 0;
  const pendingCommentCount = commentsQuery.data?.totalCount ?? 0;
  const submissions = submissionsQuery.data?.data ?? [];
  const comments = commentsQuery.data?.data ?? [];
  const auditLogs = auditQuery.data?.data ?? [];
  const importStatus = importQuery.data;

  const approveMutation = useMutation({
    mutationFn: async (comment: AdminComment) => {
      const res = await fetch(`${API_BASE}/stations/${comment.station_id}/comments/${comment.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      });
      if (!res.ok) throw new Error("Failed to approve");
    },
    onSuccess: () => {
      toast.success(t("comments.approveSuccess", { ns: "admin" }));
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "pending-comments"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (comment: AdminComment) => {
      const res = await fetch(`${API_BASE}/stations/${comment.station_id}/comments/${comment.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast.success(t("comments.deleteSuccess", { ns: "admin" }));
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "pending-comments"] });
    },
  });

  const [lightbox, setLightbox] = useState<{ comment: AdminComment; index: number } | null>(null);

  const lightboxPhotos: LightboxPhoto[] = lightbox
    ? (lightbox.comment.attachments ?? []).map((att) => ({
        attachment_uuid: att.uuid,
        note: null,
        createdAt: lightbox.comment.createdAt,
        author: lightbox.comment.author
          ? {
              uuid: lightbox.comment.author.id,
              username: lightbox.comment.author.username ?? lightbox.comment.author.name,
              name: lightbox.comment.author.name,
            }
          : null,
      }))
    : [];

  const importNeedsAttention = importStatus?.state === "running" || importStatus?.state === "error";

  const importStateColor =
    importStatus?.state === "running"
      ? "text-primary"
      : importStatus?.state === "success"
        ? "text-emerald-500"
        : importStatus?.state === "error"
          ? "text-destructive"
          : "text-muted-foreground";

  const statsItems = [
    { key: "stations", label: t("items.stations", { ns: "nav" }), value: stats?.counts.stations, weeklyDelta: delta?.stations },
    { key: "cells", label: t("dashboard.stats.cells", { ns: "admin" }), value: stats?.counts.cells, weeklyDelta: delta?.cells },
    { key: "ukePermits", label: t("dashboard.stats.ukePermits", { ns: "admin" }), value: stats?.counts.uke_permits },
    { key: "radiolines", label: t("lists.table.radiolines", { ns: "admin" }), value: stats?.counts.uke_radiolines },
  ];

  const freshnessItems = [
    { key: "stations", label: t("items.stations", { ns: "nav" }), date: stats?.lastUpdated.stations ?? null },
    { key: "ukePermits", label: t("dashboard.stats.ukePermits", { ns: "admin" }), date: stats?.lastUpdated.stations_permits ?? null },
    { key: "radiolines", label: t("lists.table.radiolines", { ns: "admin" }), date: stats?.lastUpdated.radiolines ?? null },
  ];

  return (
    <main className="flex-1 flex flex-col px-4 md:px-5 pt-5 pb-4 gap-5 overflow-y-auto md:overflow-hidden md:min-h-0">
      <div className="shrink-0 flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold tracking-tight">{t("breadcrumbs.dashboard", { ns: "admin" })}</h1>

          <div className="grid grid-cols-2 sm:flex sm:items-start gap-x-4 sm:gap-x-5">
            <Link
              to="/admin/submissions"
              search={{ page: 0, q: undefined }}
              className="flex flex-col gap-0.5 group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm"
              aria-label={`${pendingCount} ${t("dashboard.toReview", { ns: "admin", count: pendingCount })}`}
            >
              {submissionsQuery.isLoading ? (
                <Skeleton className="h-7 w-14" aria-hidden="true" />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn("text-2xl font-bold tabular-nums leading-none", pendingCount > 0 ? "text-amber-500" : "text-muted-foreground")}
                >
                  {pendingCount}
                </span>
              )}
              <span aria-hidden="true" className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
                {t("dashboard.toReview", { ns: "admin", count: pendingCount })}
              </span>
              {delta !== undefined && (
                <div
                  className={cn(
                    "flex items-center gap-0.5 mt-0.5",
                    delta.submissions > 0 ? "text-emerald-500" : delta.submissions < 0 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  <HugeiconsIcon
                    icon={delta.submissions > 0 ? ArrowUp01Icon : delta.submissions < 0 ? ArrowDown01Icon : MinusSignIcon}
                    className="size-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-[10px] tabular-nums">
                    {delta.submissions > 0 ? "+" : ""}
                    {delta.submissions} {t("dashboard.thisWeek", { ns: "admin" })}
                  </span>
                </div>
              )}
            </Link>

            <div className="hidden sm:block w-px self-stretch bg-border" aria-hidden="true" />

            <Link
              to="/admin/comments"
              className="flex flex-col gap-0.5 group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm"
              aria-label={`${pendingCommentCount} ${t("dashboard.toModerate", { ns: "admin", count: pendingCommentCount })}`}
            >
              {commentsQuery.isLoading ? (
                <Skeleton className="h-7 w-8" aria-hidden="true" />
              ) : (
                <span aria-hidden="true" className="text-2xl font-bold tabular-nums leading-none">
                  {pendingCommentCount}
                </span>
              )}
              <span aria-hidden="true" className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
                {t("dashboard.toModerate", { ns: "admin", count: pendingCommentCount })}
              </span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-start gap-y-3" role="list" aria-label={t("dashboard.databaseStats", { ns: "admin" })}>
          {statsItems.map(({ key, label, value, weeklyDelta }, i) => (
            <div key={key} role="listitem" className={cn("flex flex-col gap-0.5", i > 0 && "sm:ml-5 sm:pl-5 sm:border-l border-border")}>
              {statsQuery.isLoading ? (
                <Skeleton className="h-5 w-14" aria-hidden="true" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[15px] font-semibold tabular-nums">{(value ?? 0).toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                  {weeklyDelta !== undefined && (
                    <div
                      className={cn(
                        "flex items-center gap-0.5",
                        weeklyDelta > 0 ? "text-emerald-500" : weeklyDelta < 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      <HugeiconsIcon
                        icon={weeklyDelta > 0 ? ArrowUp01Icon : weeklyDelta < 0 ? ArrowDown01Icon : MinusSignIcon}
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-[10px] tabular-nums">
                        {weeklyDelta > 0 ? "+" : ""}
                        {weeklyDelta} {t("dashboard.thisWeek", { ns: "admin" })}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(0,0.65fr)_200px] gap-4 md:flex-1 md:min-h-0">
        <div className="flex flex-col md:min-h-0">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("items.submissions", { ns: "nav" })}</h2>
            <Link
              to="/admin/submissions"
              search={{ page: 0, q: undefined }}
              className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm transition-colors"
            >
              {t("dashboard.allSubmissions", { ns: "admin" })}
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" aria-hidden="true" />
            </Link>
          </div>
          <div
            className="flex-1 bg-card border border-border rounded-xl flex flex-col min-h-0 overflow-hidden"
            role="region"
            aria-label={t("items.submissions", { ns: "nav" })}
            aria-busy={submissionsQuery.isLoading}
          >
            <div className="flex flex-col overflow-y-auto flex-1 custom-scrollbar max-h-72 md:max-h-none">
              {submissionsQuery.isLoading ? (
                <div className="p-4 space-y-3" role="status" aria-label={t("actions.loading", { ns: "common" })}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3" aria-hidden="true">
                      <Skeleton className="size-7 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                      <Skeleton className="h-3 w-12" />
                    </div>
                  ))}
                </div>
              ) : submissions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 p-8">
                  <HugeiconsIcon icon={TaskDone02Icon} className="size-7 opacity-20" aria-hidden="true" />
                  <p className="text-sm">{t("dashboard.queueClear", { ns: "admin" })}</p>
                </div>
              ) : (
                submissions.map((s) => {
                  const stationId = s.station?.station_id ?? s.proposedStation?.station_id;
                  const submissionTypeLabel = t(`submissionType.${s.type}`, { ns: "common" });
                  return (
                    <Link
                      key={s.id}
                      to="/admin/submissions/$id"
                      params={{ id: s.id }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring transition-colors border-b border-border/50 last:border-0"
                      aria-label={`${stationId ?? t("labels.newStation", { ns: "common" })} - ${s.submitter?.name ?? t("detail.deletedUser", { ns: "submissions" })}, ${submissionTypeLabel}`}
                    >
                      <Avatar className="size-7 shrink-0" aria-hidden="true">
                        {s.submitter ? (
                          <>
                            <AvatarImage src={resolveAvatarUrl(s.submitter.image)} alt="" />
                            <AvatarFallback className="text-[10px] font-bold">{s.submitter.name.charAt(0).toUpperCase()}</AvatarFallback>
                          </>
                        ) : (
                          <AvatarFallback className="text-[10px] font-bold">?</AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {stationId ? (
                            <span className="font-mono text-xs font-semibold truncate">{stationId}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">{t("labels.newStation", { ns: "common" })}</span>
                          )}
                          <SubmissionTypeBadge type={s.type} />
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {s.submitter?.name ?? t("detail.deletedUser", { ns: "submissions" })}
                          {s.cells.length > 0 && <> · {t("dashboard.cells", { ns: "admin", count: s.cells.length })}</>}
                        </div>
                      </div>
                      <span aria-hidden="true" className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                        {formatRelativeTime(s.createdAt, t)}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:min-h-0">
          <div className="flex flex-col flex-1 md:min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("items.comments", { ns: "nav" })}</h2>
              <Link
                to="/admin/comments"
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm transition-colors"
              >
                {t("dashboard.allComments", { ns: "admin" })}
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" aria-hidden="true" />
              </Link>
            </div>
            <div
              className="flex-1 bg-card border border-border rounded-xl flex flex-col min-h-0 overflow-hidden"
              role="region"
              aria-label={t("items.comments", { ns: "nav" })}
              aria-busy={commentsQuery.isLoading}
            >
              <div className="flex flex-col overflow-y-auto flex-1 custom-scrollbar max-h-72 md:max-h-none">
                {commentsQuery.isLoading ? (
                  <div className="p-4 space-y-3" role="status" aria-label={t("actions.loading", { ns: "common" })}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex gap-2.5" aria-hidden="true">
                        <Skeleton className="size-6 rounded-full shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : comments.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 p-6">
                    <HugeiconsIcon icon={MessageMultiple01Icon} className="size-6 opacity-20" aria-hidden="true" />
                    <p className="text-sm">{t("dashboard.noCommentsToModerate", { ns: "admin" })}</p>
                  </div>
                ) : (
                  comments.map((c) => {
                    const op = c.station?.operator;
                    const color = op?.mnc ? getOperatorColor(op.mnc) : "#00E1FF";
                    const attachments = c.attachments ?? [];
                    return (
                      <div key={c.id} className="px-3.5 py-2.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs text-muted-foreground truncate">
                              {c.author?.name ?? t("dashboard.unknownAuthor", { ns: "admin" })}
                              {c.station && <> · </>}
                            </span>
                            {c.station && (
                              <>
                                <div className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: color }} />
                                <span className="font-mono text-xs text-muted-foreground truncate">{c.station.station_id}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => approveMutation.mutate(c)}
                              disabled={approveMutation.isPending || deleteMutation.isPending}
                              className="p-0.5 rounded text-emerald-500 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                            >
                              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" aria-label={t("actions.approve", { ns: "common" })} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteMutation.mutate(c)}
                              disabled={approveMutation.isPending || deleteMutation.isPending}
                              className="p-0.5 rounded text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                            >
                              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" aria-label={t("actions.delete", { ns: "common" })} />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs leading-relaxed line-clamp-2">{c.content}</p>
                        {attachments.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {attachments.map((att, i) => (
                              <button
                                key={att.uuid}
                                type="button"
                                className="size-8 rounded overflow-hidden border bg-muted hover:opacity-80 transition-opacity shrink-0"
                                onClick={() => setLightbox({ comment: c, index: i })}
                              >
                                <img src={`/uploads/${att.uuid}.webp`} alt="" className="size-full object-cover" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {isAdmin ? (
            <div className="flex flex-col flex-1 md:min-h-0">
              <div className="mb-2 shrink-0">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("items.auditLogs", { ns: "nav" })}</h2>
              </div>
              <div
                className="flex-1 bg-card border border-border rounded-xl flex flex-col min-h-0 overflow-hidden"
                role="region"
                aria-label={t("items.auditLogs", { ns: "nav" })}
                aria-busy={auditQuery.isLoading}
              >
                <div className="flex flex-col overflow-y-auto flex-1 custom-scrollbar max-h-72 md:max-h-none">
                  {auditQuery.isLoading ? (
                    <div className="p-4 space-y-2.5" role="status" aria-label={t("actions.loading", { ns: "common" })}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3" aria-hidden="true">
                          <Skeleton className="size-1.5 rounded-full shrink-0" />
                          <Skeleton className="h-3 flex-1" />
                          <Skeleton className="h-3 w-12" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    auditLogs.map((log) => {
                      const style = getActionStyle(log.action);
                      return (
                        <div key={log.id} className="flex items-center gap-3 px-3.5 py-2 border-b border-border/50 last:border-0">
                          <span
                            className={cn(
                              "shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider border",
                              style.badgeClass,
                            )}
                          >
                            <span className={cn("size-1.5 rounded-[1px]", style.dotClass)} aria-hidden="true" />
                            {log.action}
                          </span>
                          <div className="flex-1 min-w-0 text-[11px] truncate">
                            {log.user && (
                              <span className="text-muted-foreground">
                                {log.user.name} (<span className="text-foreground">@{log.user.username}</span>)
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{formatRelativeTime(log.createdAt, t)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 md:min-h-0">
              <div className="mb-2 shrink-0">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("dashboard.editorNotes", { ns: "admin" })}
                </h2>
              </div>
              <Suspense fallback={<Skeleton className="flex-1 rounded-xl" />}>
                <EditorNotes />
              </Suspense>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("dashboard.dataFreshness", { ns: "admin" })}
            </h2>
            <div className="flex flex-col gap-2" role="list" aria-label={t("dashboard.dataFreshness", { ns: "admin" })}>
              {freshnessItems.map(({ key, label, date }) => (
                <div key={key} role="listitem" className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-full shrink-0",
                        statsQuery.isLoading ? "bg-muted animate-pulse" : date ? "bg-emerald-500" : "bg-amber-500",
                      )}
                    />
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                    <span className="sr-only">
                      {statsQuery.isLoading
                        ? ""
                        : date
                          ? t("dashboard.freshnessFresh", { ns: "admin" })
                          : t("dashboard.freshnessStale", { ns: "admin" })}
                    </span>
                  </div>
                  {statsQuery.isLoading ? (
                    <Skeleton className="h-3 w-20" aria-hidden="true" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground tabular-nums">{date ? formatShortDate(date, i18n.language) : "-"}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isAdmin ? <div className="border-t border-border" aria-hidden="true" /> : null}

          {isAdmin ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("items.ukeImport", { ns: "nav" })}</h2>
                <span className={cn("text-[10px] tabular-nums", importStateColor)}>
                  {importStatus?.state ? t(`ukeImport.status.${importStatus.state}`, { ns: "admin", defaultValue: importStatus.state }) : "-"}
                </span>
              </div>

              {importNeedsAttention && (
                <div className="flex flex-col gap-1" role="list" aria-label={t("items.ukeImport", { ns: "nav" })}>
                  {(importStatus?.steps ?? []).map((step) => {
                    const cfg = STEP_ICON[step.status];
                    const stepLabel = t(`dashboard.importSteps.${step.key}`, { ns: "admin", defaultValue: step.key });
                    const stepStatus = t(`ukeImport.stepStatus.${step.status}`, { ns: "admin", defaultValue: step.status });
                    return (
                      <div
                        key={step.key}
                        role="listitem"
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/40"
                        aria-label={`${stepLabel}: ${stepStatus}`}
                      >
                        {cfg.icon ? (
                          <HugeiconsIcon icon={cfg.icon} className={cn("size-3 shrink-0", cfg.className)} aria-hidden="true" />
                        ) : (
                          <Spinner className={cn("size-3 shrink-0", cfg.className)} aria-hidden="true" />
                        )}
                        <span className="text-[11px] font-medium">{stepLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <Link
                to="/admin/uke-import"
                className="text-xs text-primary hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm transition-opacity"
              >
                {t("dashboard.openImportPage", { ns: "admin" })}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
      <Lightbox
        photos={lightboxPhotos}
        index={lightbox?.index ?? null}
        onClose={() => setLightbox(null)}
        onPrev={() => setLightbox((s) => (s && s.index > 0 ? { ...s, index: s.index - 1 } : s))}
        onNext={() => setLightbox((s) => (s && s.index < lightboxPhotos.length - 1 ? { ...s, index: s.index + 1 } : s))}
      />
    </main>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/")({
  component: AdminDashboardPage,
  staticData: {
    titleKey: "breadcrumbs.dashboard",
    i18nNamespace: "admin",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", i18nNamespace: "admin" }],
    allowedRoles: ["admin", "editor"],
  },
});
