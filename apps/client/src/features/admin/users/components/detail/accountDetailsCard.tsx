import { Copy01Icon, Globe02Icon, LockKeyIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { profileVisibilityQueryOptions } from "../../api/activity";
import type { AdminUser } from "../../types";
import { RowIconButton } from "./userDetailPrimitives";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SETTINGS_DESCRIPTION_CLASS, SettingsCard, SettingsCardHeader, StatusBadge } from "@/features/settings/components/settingsPrimitives";
import { useCopyText } from "@/features/settings/copyText";
import { supportedLanguages } from "@/i18n/config";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const EMPTY_VALUE = "-";

function AccountFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-t px-4 py-1.5 sm:px-5">
      <dt className={cn("shrink-0", SETTINGS_DESCRIPTION_CLASS)}>{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-sm leading-5">{children}</dd>
    </div>
  );
}

function CopyIdButton({ userId }: { userId: string }) {
  const { t } = useTranslation("admin");
  const { copied, copy } = useCopyText();
  const label = copied ? t("common:actions.copied") : t("users.detail.account.details.copyId");

  return <RowIconButton label={label} icon={copied ? Tick02Icon : Copy01Icon} onClick={() => copy(userId)} />;
}

function ProfileVisibilityValue({ user }: { user: AdminUser }) {
  const { t } = useTranslation("admin");
  const { data: visibility, isPending } = useQuery(profileVisibilityQueryOptions(user.id, user.username));

  if (isPending) return <Skeleton aria-hidden="true" className="h-5 w-20 rounded-4xl" />;
  if (visibility === "public") {
    return (
      <Badge variant="secondary">
        <HugeiconsIcon icon={Globe02Icon} data-icon="inline-start" aria-hidden="true" />
        {t("users.detail.account.details.visibility.public")}
      </Badge>
    );
  }
  if (visibility === "private") {
    return (
      <StatusBadge tone="warning" icon={LockKeyIcon} className="text-amber-700">
        {t("users.detail.account.details.visibility.private")}
      </StatusBadge>
    );
  }
  return <>{EMPTY_VALUE}</>;
}

export function AccountDetailsCard({ user, className }: { user: AdminUser; className?: string }) {
  const { t, i18n } = useTranslation("admin");
  const language = supportedLanguages.find((candidate) => candidate.code === user.locale);

  return (
    <SettingsCard className={className}>
      <SettingsCardHeader title={t("common:labels.details")} />
      <dl>
        <AccountFact label={t("common:labels.id")}>
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{user.id}</span>
          <CopyIdButton userId={user.id} />
        </AccountFact>
        <AccountFact label={t("common:labels.created")}>{formatFullDate(user.createdAt, i18n.language)}</AccountFact>
        <AccountFact label={t("common:labels.updated")}>{formatFullDate(user.updatedAt, i18n.language)}</AccountFact>
        <AccountFact label={t("settings:preferences.language")}>
          {language === undefined ? (user.locale ?? EMPTY_VALUE) : <span lang={language.code}>{language.nativeName}</span>}
        </AccountFact>
        <AccountFact label={t("users.detail.account.details.profile")}>
          <ProfileVisibilityValue user={user} />
        </AccountFact>
      </dl>
    </SettingsCard>
  );
}
