import { Flag02Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import type { ReaderQuirkFlag } from "../api/readingBlocks";
import { getFlagMeta, getFlagTitle } from "./blockText";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";
import { TINTED_BUTTON_CLASS } from "@/features/admin/users/components/detail/userDetailPrimitives";
import { SETTINGS_DESCRIPTION_CLASS, SettingsIconTile } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type ReaderQuirkFlagsCardProps = {
  flags: readonly ReaderQuirkFlag[];
  onCreateBlock: (flag: ReaderQuirkFlag) => void;
};

export function ReaderQuirkFlagsCard({ flags, onCreateBlock }: ReaderQuirkFlagsCardProps) {
  const { t, i18n } = useTranslation("admin");

  return (
    <DashboardCard
      title={t("measurements.blocks.flags.title")}
      count={flags.length}
      headEnd={<span className="min-w-0 truncate text-xs text-muted-foreground">{t("measurements.blocks.flags.source")}</span>}
    >
      {flags.map((flag) => (
        <div key={flag.id} className="flex items-center gap-3.5 border-t px-4 py-3 first:border-t-0">
          <SettingsIconTile icon={Flag02Icon} className="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{getFlagTitle(t, flag, i18n.language)}</p>
            <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{getFlagMeta(t, flag)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("shrink-0 cursor-pointer", TINTED_BUTTON_CLASS)}
            onClick={() => onCreateBlock(flag)}
          >
            {t("measurements.blocks.flags.createBlock")}
          </Button>
        </div>
      ))}
    </DashboardCard>
  );
}
