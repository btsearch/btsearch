import { Add01Icon } from "@hugeicons/core-free-icons";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCellNavigation } from "../../hooks/useCellNavigation";
import type { StationDraftApi } from "../../hooks/useStationDraft";
import { RAT_FIELDS } from "../../model/ratFields";
import type { Rat } from "../../model/types";
import { EditCard } from "../frame/editCard";
import { useNewReveal } from "../frame/editPage";
import { editTargetProps } from "../frame/editTargets";
import { AreaCodeField } from "./areaCodeField";
import { ErrorLine } from "./cellFields";
import { toGridTemplate } from "./cellGrid";
import { CellRow } from "./cellRow";
import {
  type CellErrorIndex,
  canEditCells,
  getFirstBandId,
  isRatTarget,
  isUnchangedRow,
  isUnchangedTarget,
  listCardErrors,
  listRatColumns,
  listRatTools,
  listRowViews,
} from "./cellRules";
import type { CellTexts } from "./cellTexts";
import { BarButton, CellHeadRow, RatCounterBadges } from "./ratCardHeader";
import { ToolsMenu } from "./toolsMenu";
import { UnchangedToggle } from "./unchangedToggle";
import { useSectorReveal } from "./useCellReveal";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";

type RatCardProps = {
  edit: StationDraftApi;
  rat: Rat;
  errorsByKey: CellErrorIndex;
  texts: CellTexts;
  canConfirm: boolean;
  isNewCellConfirmed: boolean;
};

export function RatCard({ edit, rat, errorsByKey, texts, canConfirm, isNewCellConfirmed }: RatCardProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const [showsUnchanged, setShowsUnchanged] = useState(false);
  const { bodyRef, handleKeyDown } = useCellNavigation({ rat, canEdit: canEditCells(edit), isNewCellConfirmed, dispatch: edit.dispatch });
  const revealedTarget = useNewReveal();
  const revealSector = useSectorReveal();

  const { session, lookups, dispatch } = edit;
  const spec = RAT_FIELDS[rat];
  const canEdit = canEditCells(edit);
  const counters = edit.counters[rat];
  const rows = listRowViews(edit, rat, errorsByKey);
  if (revealedTarget !== null && isRatTarget(revealedTarget, rat, rows)) {
    setIsOpen(true);
    if (isUnchangedTarget(revealedTarget, rows)) setShowsUnchanged(true);
  }

  const unchangedCount = session.kind === "review" ? rows.filter(isUnchangedRow).length : 0;
  const shownRows = unchangedCount > 0 && !showsUnchanged ? rows.filter((row) => !isUnchangedRow(row)) : rows;
  const columns = listRatColumns(edit, rat);
  const gridStyle = { "--cell-columns": toGridTemplate(columns) } as CSSProperties;
  const tools = listRatTools(edit, rat, canConfirm);
  const cardErrors = listCardErrors(edit.errors, rat);

  function addCell() {
    setIsOpen(true);
    dispatch({ type: "addCell", rat, isConfirmed: isNewCellConfirmed, bandId: getFirstBandId(edit, rat) });
  }

  return (
    <div {...editTargetProps({ scope: "cell", rat })} style={gridStyle} className="@container/cells">
      <EditCard
        ariaLabel={t("stations:edit.cells.cardLabel", { rat: spec.name })}
        isCollapsible
        isBarSticky
        open={isOpen}
        onOpenChange={setIsOpen}
        lead={<GenerationTag>{spec.generation}</GenerationTag>}
        title={spec.name}
        count={<span className="whitespace-nowrap">({t("common:labels.cells", { count: counters.total })})</span>}
        extras={<RatCounterBadges counters={counters} />}
        actions={
          <>
            <AreaCodeField edit={edit} rat={rat} />
            {tools.length > 0 ? <ToolsMenu edit={edit} rat={rat} tools={tools} /> : null}
            {canEdit ? <BarButton label={t("stations:cells.addCell")} icon={Add01Icon} onClick={addCell} /> : null}
          </>
        }
        barFooter={shownRows.length > 0 ? <CellHeadRow columns={columns} texts={texts} /> : null}
        barClassName="h-12 py-0 pr-2.5"
      >
        <div ref={bodyRef} onKeyDownCapture={handleKeyDown}>
          {cardErrors.length > 0 ? <ErrorLine errors={cardErrors} className="border-b px-3 py-1.5" /> : null}
          {shownRows.map((row) => (
            <CellRow
              key={row.cell.key}
              cell={row.cell}
              state={row.state}
              errors={row.errors}
              dispatch={dispatch}
              columns={columns}
              band={row.cell.bandId === null ? undefined : lookups.bandsById.get(row.cell.bandId)}
              bands={lookups.planBands[rat]}
              sectors={session.draft.sectors}
              texts={texts}
              editKind={session.kind}
              canEdit={canEdit}
              canConfirm={canConfirm}
              onSectorAdded={revealSector}
            />
          ))}
          {rows.length === 0 ? <p className="px-4 py-5 text-center text-sm text-muted-foreground">{t("stations:cells.noCells")}</p> : null}
          {unchangedCount > 0 ? (
            <UnchangedToggle count={unchangedCount} isShown={showsUnchanged} onToggle={() => setShowsUnchanged((isShown) => !isShown)} />
          ) : null}
        </div>
      </EditCard>
    </div>
  );
}
