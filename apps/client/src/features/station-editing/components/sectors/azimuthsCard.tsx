import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { FetchedAzimuths } from "../../data/azimuthSources";
import { type StationDraftApi, useEditText } from "../../hooks/useStationDraft";
import { getSuggestedSectorCount } from "../../model/changes";
import { MAX_SECTORS } from "../../model/ratFields";
import { EditCard } from "../frame/editCard";
import { useRevealedOpen } from "../frame/editPage";
import { editTargetProps } from "../frame/editTargets";
import { type PreviewLine, applyPreviewLines } from "./azimuthPreview";
import { type AzimuthPreview, AzimuthPreviewDialog } from "./azimuthPreviewDialog";
import { AzimuthRows } from "./azimuthRows";
import { FetchAzimuthsMenu } from "./fetchAzimuthsMenu";
import { Button } from "@/components/ui/button";

type AzimuthsCardProps = {
  edit: StationDraftApi;
  stationId: number | null;
};

export function AzimuthsCard({ edit, stationId }: AzimuthsCardProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const text = useEditText();
  const [isOpen, setIsOpen] = useRevealedOpen("sector");
  const [preview, setPreview] = useState<AzimuthPreview | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const { session, dispatch, canEdit } = edit;
  const { sectors } = session.draft;
  const suggestedCount = getSuggestedSectorCount(session.draft);
  const cardErrors = edit.errors.filter((error) => error.target.scope === "sector" && error.target.key === undefined);
  const countText = `${sectors.length}/${MAX_SECTORS}`;

  function showPreview(fetched: FetchedAzimuths, partnerName: string | null) {
    setPreview((known) => ({ token: (known?.token ?? 0) + 1, fetched, partnerName }));
    setIsPreviewOpen(true);
  }

  function applyPreview(tickedIds: ReadonlySet<string>, lines: readonly PreviewLine[]) {
    dispatch({ type: "applySectors", sectors: applyPreviewLines(sectors, lines, tickedIds) });
    setIsPreviewOpen(false);
    setIsOpen(true);
  }

  return (
    <>
      <EditCard
        title={t("common:labels.azimuths")}
        isCollapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className={session.kind === "review" ? "bg-card" : undefined}
        actions={
          <>
            {canEdit ? <FetchAzimuthsMenu edit={edit} stationId={stationId} onFetched={showPreview} /> : null}
            <span className="text-xs text-muted-foreground tabular-nums">{countText}</span>
          </>
        }
      >
        <div className="@container pt-3" {...editTargetProps({ scope: "sector" })}>
          {suggestedCount > 0 ? (
            <div className="mx-4 mb-3 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {t("sectors.suggestedCount")} <span className="font-semibold text-foreground tabular-nums">{suggestedCount}</span>
            </div>
          ) : null}
          {cardErrors.map((error, position) => (
            <p key={`${error.messageKey}:${position}`} role="alert" className="mx-4 mb-3 text-xs text-destructive">
              {text.formatError(error)}
            </p>
          ))}
          <AzimuthRows edit={edit} />
          {canEdit ? (
            <div className="p-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 cursor-pointer text-xs data-disabled:pointer-events-none data-disabled:opacity-50"
                onClick={() => dispatch({ type: "addSector" })}
                disabled={sectors.length >= MAX_SECTORS}
                focusableWhenDisabled
              >
                <HugeiconsIcon icon={Add01Icon} className="mr-1.5 size-3.5" />
                {t("sectors.add")}
                <span className="ml-2 text-muted-foreground tabular-nums">{countText}</span>
              </Button>
            </div>
          ) : (
            <div className="h-4" />
          )}
        </div>
      </EditCard>
      <AzimuthPreviewDialog preview={preview} draft={session.draft} isOpen={isPreviewOpen} onOpenChange={setIsPreviewOpen} onApply={applyPreview} />
    </>
  );
}
