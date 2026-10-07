import { ArrowUpRight01Icon, Note01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { accountHistoryQueryOptions } from "../../api/activity";
import type { AdminUser, AuditOperation } from "../../types";
import { findActiveBanOperation, getOperationAuthor } from "../../utils/accountHistory";
import { getBanUntilLabel, getBanUntilSentence, readBanReason } from "../../utils/ban";
import { resolveDisplayName } from "../../utils/identity";
import { CenteredCardState, META_USER_LINK_CLASS } from "./userDetailPrimitives";
import { buttonVariants } from "@/components/ui/button";
import { OperationKindBadge } from "@/features/admin/audit-operations/components/operationKindBadge";
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsMeta,
  SettingsMetaItem,
  SettingsRowError,
  SettingsRowSkeleton,
} from "@/features/settings/components/settingsPrimitives";
import { UserLink } from "@/features/user-profile/components/userLink";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type HistoryRowProps = {
  operation: AuditOperation;
  description: string | null;
};

const VISIBLE_OPERATION_COUNT = 4;

function describeActiveBan(t: TFunction, language: string, user: AdminUser): string {
  const reason = readBanReason(user.banReason);
  if (reason === null) return getBanUntilSentence(t, language, user.banExpiresAt);
  return t("admin:users.detail.activity.history.banDetails", { reason, until: getBanUntilLabel(t, language, user.banExpiresAt, "long") });
}

function HistoryRow({ operation, description }: HistoryRowProps) {
  const { t, i18n } = useTranslation("admin");
  const author = getOperationAuthor(operation);

  return (
    <div className="border-t px-4 py-3 first:border-t-0 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <OperationKindBadge kind={operation.kind} t={t} />
        {description !== null ? <p className="min-w-0 text-sm leading-5 wrap-anywhere">{description}</p> : null}
      </div>
      <div className="mt-1 text-xs leading-4 text-muted-foreground">
        <SettingsMeta>
          <SettingsMetaItem>
            {author === null ? (
              t("auditLogs.actor.system")
            ) : (
              <UserLink user={author} className={META_USER_LINK_CLASS}>
                {resolveDisplayName(author) || t("auditLogs.actor.system")}
              </UserLink>
            )}
          </SettingsMetaItem>
          <SettingsMetaItem>
            <time dateTime={operation.createdAt}>{formatFullDate(operation.createdAt, i18n.language)}</time>
          </SettingsMetaItem>
        </SettingsMeta>
      </div>
    </div>
  );
}

export function HistoryCard({ user }: { user: AdminUser }) {
  const { t, i18n } = useTranslation("admin");
  const { data: operations, isError, isFetching, refetch } = useQuery(accountHistoryQueryOptions(user.id));

  const activeBanOperation = user.isBanned && operations !== undefined ? findActiveBanOperation(operations) : null;
  const auditLogLink = (
    <Link to="/admin/audit-logs" search={{ q: user.id }} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}>
      {t("nav:items.auditLogs")}
      <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" aria-hidden="true" />
    </Link>
  );

  function describeOperation(operation: AuditOperation): string | null {
    if (operation.kind === "user.unban" && operation.source === "system") return t("admin:users.detail.activity.history.banExpired");
    return operation.id === activeBanOperation?.id ? describeActiveBan(t, i18n.language, user) : null;
  }

  return (
    <SettingsCard>
      <SettingsCardHeader
        title={t("users.detail.activity.history.title")}
        description={t("users.detail.activity.history.description")}
        action={<div className="max-sm:hidden">{auditLogLink}</div>}
      />
      {operations === undefined ? (
        <div className="border-t">
          {isError ? (
            <SettingsRowError title={t("users.detail.activity.history.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
          ) : (
            <>
              <SettingsRowSkeleton />
              <SettingsRowSkeleton />
            </>
          )}
        </div>
      ) : operations.length === 0 ? (
        <CenteredCardState icon={Note01Icon} title={t("common:empty.changes")} description={t("users.detail.activity.history.emptyDescription")} />
      ) : (
        <div className="border-t">
          {operations.slice(0, VISIBLE_OPERATION_COUNT).map((operation) => (
            <HistoryRow key={operation.id} operation={operation} description={describeOperation(operation)} />
          ))}
        </div>
      )}
      <SettingsCardFooter className="mt-auto justify-end sm:hidden">{auditLogLink}</SettingsCardFooter>
    </SettingsCard>
  );
}
