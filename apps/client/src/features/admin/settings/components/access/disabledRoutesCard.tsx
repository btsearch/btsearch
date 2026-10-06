import { LockIcon } from "@hugeicons/core-free-icons";
import { useId } from "react";
import { Trans, useTranslation } from "react-i18next";

import { CARD_BLOCK_CLASS } from "../classNames";
import { RouteListEditor } from "./routeListEditor";
import { CONFIRMED_ROUTE, ROUTE_SAMPLE } from "./routeSample";
import { SettingsCard, SettingsCardHeader, SettingsCardNote } from "@/features/settings/components/settingsPrimitives";

export function DisabledRoutesCard({ entries }: { entries: string[] }) {
  const { t } = useTranslation("admin");
  const titleId = useId();

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={LockIcon}
        title={t("settings.routes.disabled.title")}
        titleId={titleId}
        description={t("settings.routes.disabled.description")}
      />
      <div className={CARD_BLOCK_CLASS}>
        <RouteListEditor
          list="disabledRoutes"
          entries={entries}
          labelledBy={titleId}
          fieldLabel={t("settings.routes.disabled.fieldLabel")}
          emptyText={t("settings.routes.disabled.empty")}
          help={<Trans t={t} i18nKey="settings.routes.disabled.help" components={{ mono: ROUTE_SAMPLE }} />}
          additionConfirmation={{
            title: t("settings.routes.disabled.confirm.title"),
            confirmLabel: t("settings.routes.disabled.confirm.action"),
            renderDescription: (route) => (
              <Trans t={t} i18nKey="settings.routes.disabled.confirm.description" values={{ route }} components={{ mono: CONFIRMED_ROUTE }} />
            ),
          }}
        />
      </div>
      <SettingsCardNote className="mt-auto">{t("settings.routes.disabled.note")}</SettingsCardNote>
    </SettingsCard>
  );
}
