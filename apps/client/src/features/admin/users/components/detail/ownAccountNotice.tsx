import { ArrowUpRight01Icon, UserSettings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { buttonVariants } from "@/components/ui/button";
import { SettingsCard, SettingsIconTile, SettingsRow } from "@/features/settings/components/settingsPrimitives";

export function OwnAccountNotice() {
  const { t } = useTranslation("admin");

  return (
    <SettingsCard>
      <SettingsRow
        media={<SettingsIconTile icon={UserSettings01Icon} className="bg-primary/12 text-primary" />}
        title={t("users.detail.states.ownAccount.title")}
        description={t("users.detail.states.ownAccount.description")}
        wrap
      >
        <Link to="/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("nav:items.settings")}
          <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" aria-hidden="true" />
        </Link>
      </SettingsRow>
    </SettingsCard>
  );
}
