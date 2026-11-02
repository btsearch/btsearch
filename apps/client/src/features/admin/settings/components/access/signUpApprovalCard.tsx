import { UserCheck01Icon } from "@hugeicons/core-free-icons";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsSave } from "../../hooks/useSettingsSave";
import { Switch } from "@/components/ui/switch";
import { SettingsCard, SettingsCardHeader } from "@/features/settings/components/settingsPrimitives";

export function SignUpApprovalCard({ isSignUpApprovalRequired }: { isSignUpApprovalRequired: boolean }) {
  const { t } = useTranslation("admin");
  const titleId = useId();
  const save = useSettingsSave();

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={UserCheck01Icon}
        title={t("settings.signUpApproval.title")}
        titleId={titleId}
        description={t("settings.signUpApproval.description")}
        action={
          <Switch
            checked={isSignUpApprovalRequired}
            onCheckedChange={(isRequired) => save.mutate({ isSignUpApprovalRequired: isRequired })}
            aria-labelledby={titleId}
            className="cursor-pointer"
          />
        }
      />
    </SettingsCard>
  );
}
