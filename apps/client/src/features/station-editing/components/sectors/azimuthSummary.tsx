import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { type StationDraftApi, useEditText } from "../../hooks/useStationDraft";
import { getSectorRowState, toDegreesPart } from "../../model/changes";
import { groupErrorsByKey } from "../../model/validate";
import { useEditPage } from "../frame/editPage";
import { getFieldClass, getSectorLook } from "../frame/fieldLook";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AzimuthSummaryProps = {
  edit: StationDraftApi;
};

const CHIP_CLASS = "inline-flex h-6.5 items-center rounded-lg border border-input px-2.25 font-mono text-[12.5px] leading-none dark:bg-input/30";

export function AzimuthSummary({ edit }: AzimuthSummaryProps) {
  const { t } = useTranslation(["stations", "stationDetails", "common"]);
  const text = useEditText();
  const page = useEditPage();
  const { session } = edit;
  const { sectors } = session.draft;
  const errorsByKey = groupErrorsByKey(edit.errors, "sector");
  const isReview = session.kind === "review";

  return (
    <div className="mb-2 flex min-h-10 items-center gap-2.5 pr-0.5 pl-1">
      <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{t("common:labels.azimuths")}</h2>
      {sectors.length === 0 ? (
        <span className="text-xs text-muted-foreground">{t("stationDetails:sectors.empty")}</span>
      ) : (
        <ul className="flex min-w-0 flex-wrap gap-1.5 py-1.5">
          {sectors.map((sector, index) => {
            const look = getSectorLook(getSectorRowState(session, sector), isReview);
            const hasError = errorsByKey.has(sector.key);
            return (
              <li
                key={sector.key}
                className={cn(
                  CHIP_CLASS,
                  sector.degrees === null ? "text-muted-foreground" : null,
                  getFieldClass(look, hasError, true),
                  hasError ? "border-destructive" : null,
                )}
              >
                {sector.degrees === null ? `A${index + 1}` : text.formatPart(toDegreesPart(sector.degrees))}
              </li>
            );
          })}
        </ul>
      )}
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 cursor-pointer text-muted-foreground"
        onClick={() => page.reveal({ scope: "sector" })}
      >
        <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
        <span className={page.isPhone ? "sr-only" : undefined}>{t("edit.azimuths.summaryEdit")}</span>
      </Button>
    </div>
  );
}
