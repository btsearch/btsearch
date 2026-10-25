import type { IconSvgElement } from "@hugeicons/react";
import type { UserRef } from "@openbts/shared/contract";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ByUserText } from "../components/byUserText";
import { SETTINGS_DESCRIPTION_CLASS, SettingsIconTile, SettingsMeta, SettingsMetaItem } from "@/features/settings/components/settingsPrimitives";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type TrustTileTone = "default" | "primary" | "destructive";

type TrustCardHeaderProps = {
  icon: IconSvgElement;
  tone: TrustTileTone;
  title: string;
  description: ReactNode;
  action: ReactNode;
};

type GrantedLineProps = {
  i18nKey: string;
  by: UserRef | null;
  at: string;
};

export function TrustCardHeader({ icon, tone, title, description, action }: TrustCardHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 px-4 py-3.5 sm:flex-nowrap sm:px-5 sm:py-4">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3.5">
        <SettingsIconTile
          icon={icon}
          tone={tone === "destructive" ? "destructive" : "default"}
          className={cn(tone === "primary" && "bg-primary/10 text-primary")}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm leading-5 font-semibold">{title}</h3>
          <div className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{description}</div>
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">{action}</div>
    </div>
  );
}

export function GrantedLine({ i18nKey, by, at }: GrantedLineProps) {
  const { i18n } = useTranslation("admin");

  return (
    <SettingsMeta>
      {by === null ? null : (
        <SettingsMetaItem>
          <ByUserText i18nKey={i18nKey} user={by} />
        </SettingsMetaItem>
      )}
      <SettingsMetaItem>{formatShortDate(at, i18n.language)}</SettingsMetaItem>
    </SettingsMeta>
  );
}
