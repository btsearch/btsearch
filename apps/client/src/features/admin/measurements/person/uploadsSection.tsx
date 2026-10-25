import type { MeasurementContributor, MeasurementUploadStatus } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateContributorQueries } from "../api/keys";
import { excludeContributorUploads, uploadPageQueryOptions } from "../api/uploads";
import { DESTRUCTIVE_GHOST_CLASS } from "../components/classNames";
import { ReasonDialog } from "../components/reasonDialog";
import { PERSON_SECTION_IDS } from "./personSections";
import { PersonUploadsTable } from "./personUploadsTable";
import { Button } from "@/components/ui/button";
import { StaleDataNotice } from "@/components/ui/error-state";
import { CARD_FOOTER_LINK_CLASS, CardFooter, CardFooterLinkIcon } from "@/features/admin/dashboard/cards/dashboardCard";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsRowError,
  SettingsSection,
  StatusBadge,
} from "@/features/settings/components/settingsPrimitives";
import { showApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const PERSON_UPLOADS_LIMIT = 6;
const ALL_STATUSES: MeasurementUploadStatus[] = [];

export function UploadsSection({ contributor }: { contributor: MeasurementContributor }) {
  const { t, i18n } = useTranslation(["admin", "settings"]);
  const queryClient = useQueryClient();
  const [isExcludeOpen, setIsExcludeOpen] = useState(false);
  const userId = contributor.user.id;

  const uploadsQuery = useQuery(uploadPageQueryOptions({ statuses: ALL_STATUSES, userId, limit: PERSON_UPLOADS_LIMIT, cursor: null }));

  const excludeMutation = useMutation({
    mutationFn: (reason: string) => excludeContributorUploads(userId, reason),
    onSuccess: async (excludedCount) => {
      await invalidateContributorQueries(queryClient, userId);
      setIsExcludeOpen(false);
      toast.success(t("measurements.person.excludeAll.success", { count: excludedCount }));
    },
    onError: showApiError,
  });

  const uploads = uploadsQuery.data?.data ?? null;
  const total = uploadsQuery.data?.paging.total ?? contributor.uploadCount;
  const hasLoadFailed = uploads === null && uploadsQuery.isError;

  let body: ReactNode;
  if (hasLoadFailed) {
    body = (
      <SettingsRowError
        title={t("settings:measurements.uploads.loadFailed")}
        onRetry={() => uploadsQuery.refetch()}
        isRetrying={uploadsQuery.isFetching}
      />
    );
  } else if (uploads !== null && uploads.length === 0) {
    body = <p className={cn("border-t px-4 py-3.5 sm:px-5", SETTINGS_DESCRIPTION_CLASS)}>{t("settings:measurements.uploads.empty")}</p>;
  } else {
    body = (
      <>
        <PersonUploadsTable uploads={uploads} skeletonRowCount={Math.min(PERSON_UPLOADS_LIMIT, Math.max(contributor.uploadCount, 1))} />
        {uploads === null ? null : (
          <CardFooter shown={uploads.length} total={total}>
            <Link to="/admin/measurements/uploads" search={{ userId }} className={CARD_FOOTER_LINK_CLASS}>
              {t("measurements.person.uploads.all")}
              <CardFooterLinkIcon />
            </Link>
          </CardFooter>
        )}
      </>
    );
  }

  return (
    <SettingsSection id={PERSON_SECTION_IDS.uploads} title={t("measurements.tabs.uploads")}>
      <SettingsCard className="overflow-hidden">
        <SettingsCardHeader
          wrap
          title={t("measurements.person.uploads.cardTitle")}
          badge={
            <StatusBadge tone="muted" className="font-semibold tabular-nums">
              {contributor.uploadCount.toLocaleString(i18n.language)}
            </StatusBadge>
          }
          description={t("measurements.person.uploads.description")}
          action={
            <>
              {uploadsQuery.isRefetchError && uploadsQuery.data !== undefined ? (
                <StaleDataNotice onRetry={() => uploadsQuery.refetch()} isRetrying={uploadsQuery.isFetching} />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={DESTRUCTIVE_GHOST_CLASS}
                disabled={contributor.uploadCount === 0}
                onClick={() => setIsExcludeOpen(true)}
              >
                {t("measurements.person.excludeAll.action")}
              </Button>
            </>
          }
        />
        {body}
      </SettingsCard>
      <ReasonDialog
        open={isExcludeOpen}
        title={t("measurements.person.excludeAll.title")}
        description={t("measurements.person.excludeAll.description")}
        hint={t("measurements.person.excludeAll.reasonHint")}
        confirmLabel={t("measurements.person.excludeAll.action")}
        isDestructive
        isPending={excludeMutation.isPending}
        onOpenChange={setIsExcludeOpen}
        onSubmit={(reason) => excludeMutation.mutate(reason)}
      />
    </SettingsSection>
  );
}
