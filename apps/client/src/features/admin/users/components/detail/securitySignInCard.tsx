import { Alert02Icon, LockIcon, LockPasswordIcon, SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { hasPasswordQueryOptions } from "../../api/account";
import { showUserAdminError, storeUpdatedAccount, updateUserFields } from "../../api/authAdmin";
import type { AdminUser } from "../../types";
import { PasswordDialog } from "./passwordDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsRow,
  SettingsRowError,
  SettingsRowSkeleton,
  StatusBadge,
} from "@/features/settings/components/settingsPrimitives";

type PasswordRowProps = {
  hasPassword: boolean;
  isSelf: boolean;
  onSetPassword: () => void;
};

function PasswordRow({ hasPassword, isSelf, onSetPassword }: PasswordRowProps) {
  const { t } = useTranslation("admin");

  return (
    <SettingsRow
      icon={LockPasswordIcon}
      title={t("common:labels.password")}
      description={hasPassword ? t("users.detail.security.password.set") : t("users.detail.security.password.missing")}
    >
      {isSelf ? null : (
        <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={onSetPassword}>
          {hasPassword ? t("users.detail.security.password.setNew") : t("settings:security.password.setAction")}
        </Button>
      )}
    </SettingsRow>
  );
}

export function SecuritySignInCard({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const requirementTitleId = useId();
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const { data: hasPassword, isError, isFetching, refetch } = useQuery(hasPasswordQueryOptions(user.id));

  const requirementMutation = useMutation({
    mutationFn: (isRequired: boolean) => updateUserFields(user.id, { isTwoFactorRequired: isRequired }),
    onSuccess: (updatedUser) => {
      storeUpdatedAccount(queryClient, updatedUser);
      toast.success(
        updatedUser.isTwoFactorRequired
          ? t("users.detail.security.requireTwoFactor.enabledToast")
          : t("users.detail.security.requireTwoFactor.disabledToast"),
      );
    },
    onError: showUserAdminError,
  });

  const isTwoFactorRequired = requirementMutation.isPending ? requirementMutation.variables : user.isTwoFactorRequired;
  const isMissingPassword = hasPassword === false && !user.isTwoFactorRequired;
  const canChangeRequirement = hasPassword === true || user.isTwoFactorRequired;

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("users.detail.security.signIn.title")} description={t("users.detail.security.signIn.description")} />
      <div className="border-t">
        {hasPassword !== undefined ? (
          <PasswordRow hasPassword={hasPassword} isSelf={isSelf} onSetPassword={() => setIsSettingPassword(true)} />
        ) : isError ? (
          <SettingsRowError title={t("users.detail.security.password.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : (
          <SettingsRowSkeleton />
        )}
        <SettingsRow
          icon={SecurityCheckIcon}
          title={t("common:labels.twoFactor")}
          description={user.isTwoFactorEnabled ? t("users.detail.security.twoFactor.enabled") : t("users.detail.security.twoFactor.disabled")}
        >
          {user.isTwoFactorEnabled ? (
            <StatusBadge tone="success" className="text-emerald-700">
              {t("settings:security.twoFactor.on")}
            </StatusBadge>
          ) : (
            <StatusBadge tone="warning" icon={Alert02Icon} className="text-amber-700">
              {t("settings:security.twoFactor.off")}
            </StatusBadge>
          )}
        </SettingsRow>
        <SettingsRow
          icon={LockIcon}
          title={t("users.detail.security.requireTwoFactor.title")}
          titleId={requirementTitleId}
          description={
            isMissingPassword ? t("users.detail.security.requireTwoFactor.needsPassword") : t("users.detail.security.requireTwoFactor.description")
          }
        >
          <Switch
            checked={isTwoFactorRequired}
            disabled={!canChangeRequirement || requirementMutation.isPending}
            aria-labelledby={requirementTitleId}
            onCheckedChange={(isRequired) => requirementMutation.mutate(isRequired)}
            className="cursor-pointer"
          />
        </SettingsRow>
      </div>
      <PasswordDialog user={user} open={isSettingPassword} onOpenChange={setIsSettingPassword} />
    </SettingsCard>
  );
}
