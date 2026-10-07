import { Alert02Icon, Note01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { StationRecord } from "../../types";

type StationPanelBannersProps = {
  station: StationRecord;
};

export function StationPanelBanners({ station }: StationPanelBannersProps) {
  const { t } = useTranslation("stationDetails");
  const notes = station.notes?.trim();

  return (
    <>
      {notes ? (
        <div className="border-t border-primary/20 bg-primary/8 px-6 py-3 text-primary">
          <div className="flex items-start gap-2.5">
            <HugeiconsIcon icon={Note01Icon} className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold">{t("specs.internalNotes")}</p>
              <p className="max-h-20 overflow-y-auto whitespace-pre-wrap wrap-break-word pr-1 text-xs leading-relaxed text-foreground custom-scrollbar">
                {notes}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {station.status === "inactive" ? (
        <div className="border-t border-red-600/30 bg-red-500/10 px-6 py-3 text-red-700 dark:border-red-400/35 dark:bg-red-400/12 dark:text-red-300">
          <div className="flex items-start gap-2.5">
            <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">{t("dialog.inactiveStationTitle")}</p>
              <p className="text-xs text-red-700/85 dark:text-red-300/80">{t("dialog.inactiveStationDescription")}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
