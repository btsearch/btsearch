import { UserBlock01Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";

import { accountHistoryQueryOptions } from "../../api/activity";
import type { AdminUser, AuditOperation } from "../../types";
import { findActiveBanOperation, getOperationAuthor } from "../../utils/accountHistory";
import { getBanReasonLabel, getBanUntilLabel } from "../../utils/ban";
import { formatLongDate } from "../../utils/dates";
import { resolveDisplayName } from "../../utils/identity";
import { ModerationBanControls } from "./moderationBanControls";
import { META_USER_LINK_CLASS } from "./userDetailPrimitives";
import { SettingsMeta, SettingsMetaItem, SettingsRow } from "@/features/settings/components/settingsPrimitives";
import { UserLink } from "@/features/user-profile/components/userLink";

function BanAuthorship({ operation }: { operation: AuditOperation }) {
  const { t, i18n } = useTranslation("admin");
  const author = getOperationAuthor(operation);
  const authorName = author === null ? "" : resolveDisplayName(author);
  const date = formatLongDate(operation.createdAt, i18n.language);
  if (authorName === "") return <>{t("users.detail.moderation.notice.bannedOn", { date })}</>;

  return (
    <Trans
      t={t}
      i18nKey="admin:users.detail.moderation.notice.bannedBy"
      values={{ name: authorName, date }}
      components={{
        user: (
          <UserLink user={author} className={META_USER_LINK_CLASS}>
            {authorName}
          </UserLink>
        ),
      }}
    />
  );
}

export function BanNotice({ user }: { user: AdminUser }) {
  const { t, i18n } = useTranslation("admin");
  const { data: accountHistory } = useQuery(accountHistoryQueryOptions(user.id));
  const banOperation = accountHistory === undefined ? null : findActiveBanOperation(accountHistory);

  return (
    <div role="status" className="rounded-xl border border-destructive/25 bg-destructive/5">
      <SettingsRow
        icon={UserBlock01Icon}
        iconTone="destructive"
        title={t("users.detail.moderation.notice.title", { until: getBanUntilLabel(t, i18n.language, user.banExpiresAt, "long") })}
        description={
          <SettingsMeta>
            <SettingsMetaItem>{getBanReasonLabel(t, user.banReason)}</SettingsMetaItem>
            {banOperation === null ? null : (
              <SettingsMetaItem>
                <BanAuthorship operation={banOperation} />
              </SettingsMetaItem>
            )}
          </SettingsMeta>
        }
        wrap
      >
        <ModerationBanControls user={user} />
      </SettingsRow>
    </div>
  );
}
