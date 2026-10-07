import { File02Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { AnalyzerDraft } from "../../model/draft";
import type { AnalyzerSearch } from "../../model/search";
import { Button } from "@/components/ui/button";
import { EditPageHead } from "@/features/station-editing/components/frame/editPageHead";
import { TEXT_SEPARATOR } from "@/features/station-editing/model/changes";
import { useIsMobile } from "@/hooks/useMobile";
import { getAnalyzerFormatLabel } from "@/lib/analyzer/analyzerParsers";

type BatchHeadProps = {
  draft: AnalyzerDraft;
  stationCount: number;
  changeCount: number;
  isWritten: boolean;
  hasRemovals: boolean;
  isLocked: boolean;
  onRestoreAll: () => void;
};

const NO_SEARCH: AnalyzerSearch = {};
const COUNT_CLASS = "text-muted-foreground tabular-nums whitespace-nowrap";
const FILE_CLASS = "flex min-w-0 items-center gap-1.5 text-xs leading-4 whitespace-nowrap text-muted-foreground";

export function useBackToAnalyzer(search: AnalyzerSearch = NO_SEARCH): () => void {
  const navigate = useNavigate();
  return () => void navigate({ to: "/analyzer", search });
}

export function BatchHead({ draft, stationCount, changeCount, isWritten, hasRemovals, isLocked, onRestoreAll }: BatchHeadProps) {
  const { t } = useTranslation();
  const isPhone = useIsMobile();
  const goBack = useBackToAnalyzer(draft.returnSearch);
  const restoreLabel = t("submissions:batch.restoreRemoved");
  const countText = `${t("common:labels.stations", { count: stationCount })}, ${t("stations:edit.frame.changeCount", { count: changeCount })}`;
  const showsRestore = hasRemovals && !isWritten;

  const restoreButton = showsRestore ? (
    <Button
      type="button"
      variant="ghost"
      size={isPhone ? "icon-sm" : "sm"}
      aria-label={isPhone ? restoreLabel : undefined}
      disabled={isLocked}
      onClick={onRestoreAll}
      className="shrink-0 cursor-pointer"
    >
      <HugeiconsIcon icon={Undo02Icon} aria-hidden="true" />
      {isPhone ? null : restoreLabel}
    </Button>
  ) : null;
  const queue = isPhone ? (
    restoreButton
  ) : (
    <span className="flex min-w-0 items-center gap-3">
      <span title={t("submissions:batch.sourceFile")} className={FILE_CLASS}>
        <HugeiconsIcon icon={File02Icon} aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{draft.file.name === "" ? t("submissions:batch.unknownFile") : draft.file.name}</span>
        {TEXT_SEPARATOR}
        {getAnalyzerFormatLabel(draft.file.format)}
      </span>
      {restoreButton}
    </span>
  );

  return (
    <EditPageHead
      title={t("cellAnalyzer:batch.title")}
      backLabel={t("submissions:batch.backToAnalyzer")}
      onBack={goBack}
      queue={queue}
      badges={
        <span aria-live="polite" className={`text-sm ${COUNT_CLASS}`}>
          {countText}
        </span>
      }
      compactBadges={<span className={`text-xs ${COUNT_CLASS}`}>{countText}</span>}
      subtitle={isWritten ? t("cellAnalyzer:batch.writtenDescription") : t("cellAnalyzer:batch.description")}
    />
  );
}
