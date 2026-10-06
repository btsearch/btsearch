import { InformationCircleIcon, ShieldUserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { useSettingsSave } from "../../hooks/useSettingsSave";
import { CARD_BLOCK_CLASS, SMALL_TEXT_CLASS, WARNING_TEXT_CLASS } from "../classNames";
import { RouteListEditor } from "./routeListEditor";
import { ROUTE_SAMPLE } from "./routeSample";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { SETTINGS_DESCRIPTION_CLASS, SettingsCard, SettingsCardHeader, SettingsCardNote } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type SignInCardProps = {
  isSignInRequired: boolean;
  openRoutes?: string[];
};

type OpenRoutesBlockProps = {
  entries: string[];
  isSignInRequired: boolean;
};

function OpenRoutesBlock({ entries, isSignInRequired }: OpenRoutesBlockProps) {
  const { t } = useTranslation("admin");
  const titleId = useId();

  return (
    <>
      <div className={CARD_BLOCK_CLASS}>
        <p id={titleId} className="text-sm leading-5 font-medium">
          {t("settings.routes.open.title")}
        </p>
        <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("settings.routes.open.description")}</p>
        {isSignInRequired ? null : (
          <p className={cn("mt-2 flex items-center gap-1.5", SMALL_TEXT_CLASS, WARNING_TEXT_CLASS)}>
            <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="size-3.5 shrink-0" />
            {t("settings.routes.open.inactive")}
          </p>
        )}
        <RouteListEditor
          className="mt-2.5"
          list="openRoutes"
          entries={entries}
          labelledBy={titleId}
          fieldLabel={t("settings.routes.open.fieldLabel")}
          emptyText={t("settings.routes.open.empty")}
          help={<Trans t={t} i18nKey="settings.routes.open.help" components={{ mono: ROUTE_SAMPLE }} />}
        />
      </div>
      <SettingsCardNote className="mt-auto">
        <Trans t={t} i18nKey="settings.signIn.note" components={{ mono: ROUTE_SAMPLE }} />
      </SettingsCardNote>
    </>
  );
}

export function SignInCard({ isSignInRequired, openRoutes }: SignInCardProps) {
  const { t } = useTranslation("admin");
  const titleId = useId();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const save = useSettingsSave();

  function changeRequirement(isRequired: boolean) {
    if (isRequired) setIsConfirmOpen(true);
    else save.mutate({ isSignInRequired: false });
  }

  function requireSignIn() {
    if (!isConfirmOpen) return;

    setIsConfirmOpen(false);
    save.mutate({ isSignInRequired: true });
  }

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={ShieldUserIcon}
        title={t("settings.signIn.title")}
        titleId={titleId}
        description={t("settings.signIn.description")}
        action={<Switch checked={isSignInRequired} onCheckedChange={changeRequirement} aria-labelledby={titleId} className="cursor-pointer" />}
      />
      {openRoutes === undefined ? null : <OpenRoutesBlock entries={openRoutes} isSignInRequired={isSignInRequired} />}
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={t("settings.signIn.confirm.title")}
        description={t("settings.signIn.confirm.description")}
        confirmLabel={t("settings.signIn.confirm.action")}
        onConfirm={requireSignIn}
        destructive={false}
      />
    </SettingsCard>
  );
}
