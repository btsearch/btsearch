import { ArrowRight01Icon, Message01Icon, Note01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type CommentCounts, type SubmissionCounts, type UserActivityCounts, userActivityQueryOptions } from "../../api/activity";
import type { AdminUser } from "../../types";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsMeta,
  SettingsMetaItem,
  SettingsRow,
  SettingsRowError,
  SettingsRowSkeleton,
} from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type ContributionRowProps = {
  icon: IconSvgElement;
  title: string;
  description: ReactNode;
  count: number | null;
};

type ContributionRowsProps = {
  userId: string;
  counts: UserActivityCounts;
};

const ROW_LINK_CLASS = cn(
  "block border-t transition-colors first:border-t-0 hover:bg-muted/50",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
);

function ContributionRow({ icon, title, description, count }: ContributionRowProps) {
  const { i18n } = useTranslation();

  return (
    <SettingsRow icon={icon} title={title} description={description}>
      {count === null ? null : (
        <>
          <span className="text-lg leading-7 font-semibold tabular-nums">{count.toLocaleString(i18n.language)}</span>
          <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" className="size-4 text-muted-foreground" />
        </>
      )}
    </SettingsRow>
  );
}

function SubmissionBreakdown({ counts }: { counts: SubmissionCounts }) {
  const { t } = useTranslation("admin");

  return (
    <SettingsMeta>
      <SettingsMetaItem>{t("users.detail.activity.contribution.submissions.pending", { count: counts.pending })}</SettingsMetaItem>
      <SettingsMetaItem>{t("users.detail.activity.contribution.submissions.accepted", { count: counts.accepted })}</SettingsMetaItem>
      <SettingsMetaItem>{t("users.detail.activity.contribution.submissions.rejected", { count: counts.rejected })}</SettingsMetaItem>
    </SettingsMeta>
  );
}

function CommentBreakdown({ counts }: { counts: CommentCounts }) {
  const { t } = useTranslation("admin");

  return (
    <SettingsMeta>
      <SettingsMetaItem>{t("users.detail.activity.contribution.comments.pending", { count: counts.pending })}</SettingsMetaItem>
      <SettingsMetaItem>{t("users.detail.activity.contribution.comments.approved", { count: counts.approved })}</SettingsMetaItem>
    </SettingsMeta>
  );
}

function ContributionRows({ userId, counts }: ContributionRowsProps) {
  const { t } = useTranslation("admin");
  const { submissions, comments, auditOperations } = counts;
  const auditTitle = t("users.detail.activity.contribution.auditOperations.title");
  const auditDescription = t("users.detail.activity.contribution.auditOperations.description");

  return (
    <>
      {submissions === null ? (
        <ContributionRow icon={SentIcon} title={t("common:labels.submissions")} description={t("settings.submissionsDisabled")} count={null} />
      ) : (
        <Link to="/admin/submissions" search={{ page: 0, q: undefined, submitter: userId }} className={ROW_LINK_CLASS}>
          <ContributionRow
            icon={SentIcon}
            title={t("common:labels.submissions")}
            description={<SubmissionBreakdown counts={submissions} />}
            count={submissions.total}
          />
        </Link>
      )}
      {comments === null ? (
        <ContributionRow icon={Message01Icon} title={t("common:labels.comments")} description={t("settings.commentsDisabled")} count={null} />
      ) : (
        <Link to="/admin/comments" search={{ authors: userId, statuses: "pending,approved" }} className={ROW_LINK_CLASS}>
          <ContributionRow
            icon={Message01Icon}
            title={t("common:labels.comments")}
            description={<CommentBreakdown counts={comments} />}
            count={comments.total}
          />
        </Link>
      )}
      {auditOperations === null ? (
        <ContributionRow icon={Note01Icon} title={auditTitle} description={auditDescription} count={null} />
      ) : (
        <Link to="/admin/audit-logs" search={{ user: userId }} className={ROW_LINK_CLASS}>
          <ContributionRow icon={Note01Icon} title={auditTitle} description={auditDescription} count={auditOperations} />
        </Link>
      )}
    </>
  );
}

export function ActivityContributionCard({ user }: { user: AdminUser }) {
  const { t } = useTranslation("admin");
  const { data: counts, isError, isFetching, refetch } = useQuery(userActivityQueryOptions(user.id));

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("users.detail.activity.contribution.title")} description={t("users.detail.activity.contribution.description")} />
      <div className="border-t">
        {counts !== undefined ? (
          <ContributionRows userId={user.id} counts={counts} />
        ) : isError ? (
          <SettingsRowError title={t("users.detail.activity.contribution.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : (
          <>
            <SettingsRowSkeleton />
            <SettingsRowSkeleton />
            <SettingsRowSkeleton />
          </>
        )}
      </div>
    </SettingsCard>
  );
}
