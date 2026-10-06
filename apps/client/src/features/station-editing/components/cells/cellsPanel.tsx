import type { StationDraftApi } from "../../hooks/useStationDraft";
import { RAT_ORDER } from "../../model/ratFields";
import { newDraftKey } from "../../model/snapshots";
import type { Rat } from "../../model/types";
import { groupErrorsByKey } from "../../model/validate";
import { useEditPage } from "../frame/editPage";
import { ErrorLine } from "./cellFields";
import { getFullCardWidth } from "./cellGrid";
import { type CellErrorIndex, canEditCells, getFirstBandId, listPanelErrors, listRatColumns } from "./cellRules";
import { CellsToolbar } from "./cellsToolbar";
import { type CellTexts, useCellTexts } from "./cellTexts";
import { AddTechnologyRow, EmptyCells } from "./emptyCells";
import { PhoneCellList } from "./phoneCellList";
import { RatCard } from "./ratCard";
import { useIsMobile } from "@/hooks/useMobile";

type CellsPanelProps = {
  edit: StationDraftApi;
  canConfirm: boolean;
  isNewCellConfirmed: boolean;
};

type CardColumnsProps = CellsPanelProps & {
  rats: readonly Rat[];
  errorsByKey: CellErrorIndex;
  texts: CellTexts;
};

const FIRST_COLUMN_RATS: ReadonlySet<Rat> = new Set<Rat>(["nr", "lte"]);
const SPLIT_WIDTH = 1540;
const SPLIT_GAP = 12;
const SPLIT_CLASS = "grid items-start gap-x-3 gap-y-2";

function getSplitTemplate(edit: StationDraftApi, rats: readonly Rat[]): string {
  const widestCardWidth = Math.max(...rats.map((rat) => getFullCardWidth(listRatColumns(edit, rat))));
  const columnWidth = Math.max((SPLIT_WIDTH - SPLIT_GAP) / 2, widestCardWidth);
  return `repeat(auto-fit, minmax(min(100%, ${columnWidth}px), 1fr))`;
}

function CardColumns({ edit, rats, errorsByKey, texts, canConfirm, isNewCellConfirmed }: CardColumnsProps) {
  const groups = [
    { id: "first", rats: rats.filter((rat) => FIRST_COLUMN_RATS.has(rat)) },
    { id: "second", rats: rats.filter((rat) => !FIRST_COLUMN_RATS.has(rat)) },
  ];
  const filledGroups = groups.filter((group) => group.rats.length > 0);

  return (
    <div style={{ gridTemplateColumns: getSplitTemplate(edit, rats) }} className={SPLIT_CLASS}>
      {filledGroups.map((group) => (
        <div key={group.id} className="flex min-w-0 flex-col gap-2">
          {group.rats.map((rat) => (
            <RatCard
              key={rat}
              edit={edit}
              rat={rat}
              errorsByKey={errorsByKey}
              texts={texts}
              canConfirm={canConfirm}
              isNewCellConfirmed={isNewCellConfirmed}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CellsPanel({ edit, canConfirm, isNewCellConfirmed }: CellsPanelProps) {
  const isPhone = useIsMobile();
  const texts = useCellTexts(edit.session.kind);
  const { reveal } = useEditPage();

  const { session, dispatch } = edit;
  const canEdit = canEditCells(edit);
  const errorsByKey = groupErrorsByKey(edit.errors, "cell");
  const panelErrors = listPanelErrors(edit.errors);
  const shownRats = RAT_ORDER.filter((rat) => session.enabledRats.includes(rat));
  const missingRats = RAT_ORDER.filter((rat) => !session.enabledRats.includes(rat));
  const hasCards = shownRats.length > 0;
  const offersTechnologies = hasCards && canEdit && session.kind !== "form" && missingRats.length > 0;

  function addFirstCell(rat: Rat) {
    const newKey = newDraftKey();
    dispatch({ type: "addCell", rat, isConfirmed: isNewCellConfirmed, bandId: getFirstBandId(edit, rat), newKey });
    if (!isPhone) reveal({ scope: "cell", key: newKey, rat });
  }

  return (
    <div className="@container/panel flex w-full min-w-0 flex-col gap-2">
      {isPhone ? null : <CellsToolbar editKind={session.kind} />}
      {panelErrors.length > 0 ? <ErrorLine errors={panelErrors} className="px-1" /> : null}
      {hasCards ? null : <EmptyCells canEdit={canEdit} onAdd={addFirstCell} />}
      {hasCards && isPhone ? (
        <div className="overflow-hidden rounded-xl border">
          <PhoneCellList
            edit={edit}
            rats={shownRats}
            errorsByKey={errorsByKey}
            texts={texts}
            canConfirm={canConfirm}
            isNewCellConfirmed={isNewCellConfirmed}
          />
        </div>
      ) : null}
      {hasCards && !isPhone ? (
        <CardColumns
          edit={edit}
          rats={shownRats}
          errorsByKey={errorsByKey}
          texts={texts}
          canConfirm={canConfirm}
          isNewCellConfirmed={isNewCellConfirmed}
        />
      ) : null}
      {offersTechnologies ? <AddTechnologyRow rats={missingRats} onAdd={addFirstCell} /> : null}
    </div>
  );
}
