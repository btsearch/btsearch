import { Delete02Icon, UserBlock01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { removeUser, showUserAdminError } from "../../api/authAdmin";
import type { AdminUser } from "../../types";
import { getBanReasonLabel, getBanUntilSentence } from "../../utils/ban";
import { getAccountName } from "../../utils/identity";
import { ModerationBanControls } from "./moderationBanControls";
import { USER_DETAIL_TWO_COLUMN_CLASS } from "./userDetailPrimitives";
import { USER_DETAIL_SECTION_IDS } from "./userDetailSections";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsIconTile,
  SettingsMeta,
  SettingsMetaItem,
  SettingsSection,
} from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type ModerationCardHeaderProps = {
  icon: IconSvgElement;
  iconTone: "default" | "destructive";
  title: string;
  description: ReactNode;
  children: ReactNode;
};

type ModerationSectionProps = {
  user: AdminUser;
  onRemoved: () => void;
};

function ModerationCardHeader({ icon, iconTone, title, description, children }: ModerationCardHeaderProps) {
  return (
    <div className="flex flex-wrap items-start gap-x-3.5 gap-y-3 px-4 py-3.5 sm:flex-nowrap sm:items-center sm:px-5 sm:py-4">
      <SettingsIconTile icon={icon} tone={iconTone} />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm leading-5 font-semibold">{title}</h3>
        <div className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{description}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 max-sm:w-full max-sm:pl-11.5">{children}</div>
    </div>
  );
}

function ModerationBanCard({ user }: { user: AdminUser }) {
  const { t, i18n } = useTranslation("admin");

  return (
    <SettingsCard>
      <ModerationCardHeader
        icon={UserBlock01Icon}
        iconTone={user.isBanned ? "destructive" : "default"}
        title={user.isBanned ? t("users.detail.moderation.ban.banned") : t("users.detail.moderation.ban.title")}
        description={
          user.isBanned ? (
            <SettingsMeta>
              <SettingsMetaItem>{getBanUntilSentence(t, i18n.language, user.banExpiresAt)}</SettingsMetaItem>
              <SettingsMetaItem>{getBanReasonLabel(t, user.banReason)}</SettingsMetaItem>
            </SettingsMeta>
          ) : (
            t("users.detail.moderation.ban.description")
          )
        }
      >
        <ModerationBanControls user={user} />
      </ModerationCardHeader>
    </SettingsCard>
  );
}

function ModerationDeleteCard({ user, onRemoved }: ModerationSectionProps) {
  const { t } = useTranslation("admin");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const removeMutation = useMutation({
    mutationFn: () => removeUser(user.id),
    onSuccess: () => {
      toast.success(t("users.detail.moderation.delete.success"));
      onRemoved();
    },
    onError: showUserAdminError,
  });

  const isRemoving = removeMutation.isPending || removeMutation.isSuccess;

  return (
    <SettingsCard tone="destructive">
      <ModerationCardHeader
        icon={Delete02Icon}
        iconTone="destructive"
        title={t("settings:account.delete.title")}
        description={t("users.detail.moderation.delete.description")}
      >
        <Button type="button" variant="destructive" size="sm" className="cursor-pointer" onClick={() => setIsConfirmOpen(true)}>
          {t("settings:account.delete.title")}
        </Button>
      </ModerationCardHeader>
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!isRemoving) setIsConfirmOpen(open);
        }}
        title={t("users.detail.moderation.delete.confirmTitle", { name: getAccountName(user) })}
        description={t("users.detail.moderation.delete.confirmDescription")}
        confirmLabel={t("settings:account.delete.title")}
        pending={isRemoving}
        onConfirm={() => removeMutation.mutate()}
      />
    </SettingsCard>
  );
}

export function ModerationSection({ user, onRemoved }: ModerationSectionProps) {
  const { t } = useTranslation("admin");

  return (
    <SettingsSection id={USER_DETAIL_SECTION_IDS.moderation} title={t("users.detail.moderation.title")}>
      <div className={USER_DETAIL_TWO_COLUMN_CLASS}>
        <ModerationBanCard user={user} />
        <ModerationDeleteCard user={user} onRemoved={onRemoved} />
      </div>
    </SettingsSection>
  );
}
