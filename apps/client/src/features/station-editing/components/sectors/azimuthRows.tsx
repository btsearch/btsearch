import { Cancel01Icon, DragDropVerticalIcon, SignalFull02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Reorder, useDragControls } from "motion/react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { type StationDraftApi, useEditText } from "../../hooks/useStationDraft";
import { getSectorCellCounts, getSectorRowState, parseDigits, toDegreesPart } from "../../model/changes";
import type { DraftDispatch } from "../../model/draftReducer";
import { OMNIDIRECTIONAL_DEGREES, toAzimuth } from "../../model/ratFields";
import type { DraftKey, EditError, SectorDraft, SectorRowState } from "../../model/types";
import { NO_EDIT_ERRORS, groupErrorsByKey } from "../../model/validate";
import { editTargetProps } from "../frame/editTargets";
import { getFieldClass, getSectorLook } from "../frame/fieldLook";
import { FieldMarks } from "../frame/wasLine";
import { AzimuthCompass } from "@/components/cellular/azimuthCompass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type AzimuthRowsProps = {
  edit: StationDraftApi;
};

type AzimuthRowProps = {
  sector: SectorDraft;
  index: number;
  state: SectorRowState;
  errors: readonly EditError[];
  cellCount: number;
  isLocked: boolean;
  isReview: boolean;
  dispatch: DraftDispatch;
};

const MOST_DIGITS = 3;
const CELL_COUNT_CLASS = "inline-flex h-7 items-center gap-0.5 text-xs text-muted-foreground";
const HANDLE_CLASS = cn(
  "flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/50 outline-none",
  "hover:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
);

function getMoveOffset(key: string): number {
  if (key === "ArrowUp" || key === "ArrowLeft") return -1;
  if (key === "ArrowDown" || key === "ArrowRight") return 1;
  return 0;
}

function AzimuthRow({ sector, index, state, errors, cellCount, isLocked, isReview, dispatch }: AzimuthRowProps) {
  const { t } = useTranslation(["stations", "stationDetails", "common"]);
  const text = useEditText();
  const dragControls = useDragControls();
  const errorId = useId();
  const handleRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const name = `A${index + 1}`;
  const error = errors.at(0);
  const isUsed = cellCount > 0;
  const cellCountLabel = t("edit.azimuths.cellsOnAzimuth", { count: cellCount });
  const valueText = sector.degrees === null ? name : text.formatPart(toDegreesPart(sector.degrees));

  function moveByArrowKey(event: KeyboardEvent<HTMLButtonElement>) {
    const offset = getMoveOffset(event.key);
    if (offset === 0) return;

    event.preventDefault();
    dispatch({ type: "moveSector", key: sector.key, toIndex: index + offset });
    requestAnimationFrame(() => handleRef.current?.focus());
  }

  return (
    <Reorder.Item
      as="div"
      value={sector.key}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      className={cn("relative flex items-start gap-2 rounded-md py-1.5", isDragging ? "z-10 bg-muted shadow-sm" : null)}
    >
      {isLocked ? null : (
        <button
          ref={handleRef}
          type="button"
          aria-label={t("stationDetails:sectors.reorder", { label: name })}
          onPointerDown={(event) => dragControls.start(event)}
          onKeyDown={moveByArrowKey}
          className={HANDLE_CLASS}
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4" />
        </button>
      )}
      <span className="w-7 shrink-0 text-sm leading-7 font-medium tabular-nums">{name}</span>
      <div className="w-20 shrink-0">
        <Input
          type="text"
          inputMode="numeric"
          {...NO_AUTOFILL_PROPS}
          {...editTargetProps({ scope: "sector", key: sector.key, field: "degrees" })}
          aria-label={`${t("common:labels.azimuth")} ${name}`}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          title={error === undefined ? undefined : text.formatError(error)}
          maxLength={MOST_DIGITS}
          value={sector.degrees === null ? "" : String(sector.degrees)}
          onChange={(event) => dispatch({ type: "setSector", key: sector.key, degrees: parseDigits(event.target.value, MOST_DIGITS) })}
          disabled={isLocked}
          placeholder="0-360"
          className={cn("h-7 text-sm tabular-nums", getFieldClass(getSectorLook(state, isReview), error !== undefined, true))}
        />
        {error === undefined ? null : (
          <span id={errorId} className="sr-only">
            {text.formatError(error)}
          </span>
        )}
        {isReview ? <FieldMarks marks={state.field.marks} className="w-max whitespace-nowrap" /> : null}
      </div>
      <span className="text-xs leading-7 text-muted-foreground">°</span>
      <span role="img" aria-label={cellCountLabel} title={cellCountLabel} className={CELL_COUNT_CLASS}>
        <HugeiconsIcon icon={SignalFull02Icon} className="size-3" />
        <span className="tabular-nums">{cellCount}</span>
      </span>
      {isLocked ? null : (
        <Tooltip>
          <TooltipTrigger render={<span className="ml-auto inline-flex shrink-0" />}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("edit.azimuths.remove", { value: valueText })}
              className="size-7 cursor-pointer text-muted-foreground hover:text-destructive"
              onClick={() => dispatch({ type: "removeSector", key: sector.key })}
              disabled={isUsed}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </Button>
          </TooltipTrigger>
          {isUsed ? <TooltipContent>{t("edit.refusals.sectorHasCells")}</TooltipContent> : null}
        </Tooltip>
      )}
    </Reorder.Item>
  );
}

export function AzimuthRows({ edit }: AzimuthRowsProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const text = useEditText();
  const { session, dispatch, canEdit } = edit;
  const { sectors } = session.draft;

  if (sectors.length === 0) {
    return (
      <div className="px-4">
        <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          {t("sectors.empty")}
        </div>
      </div>
    );
  }

  const cellCounts = getSectorCellCounts(session.draft);
  const errorsByKey = groupErrorsByKey(edit.errors, "sector");
  const directions = sectors.flatMap((sector) => {
    const { degrees } = sector;
    if (degrees === null || degrees > OMNIDIRECTIONAL_DEGREES) return [];
    return [{ azimuth: toAzimuth(degrees), name: text.formatPart(toDegreesPart(degrees)) }];
  });

  function orderRows(keys: DraftKey[]) {
    dispatch({ type: "orderSectors", keys });
  }

  return (
    <div className="grid gap-4 px-4 @min-[424px]:grid-cols-[auto_minmax(0,1fr)]">
      <AzimuthCompass directions={directions} hideLabels className="mx-auto size-32 @min-[424px]:mx-0" />
      <div className="min-w-0">
        <div className="px-1 pb-1 text-xs text-muted-foreground">{t("common:labels.azimuth")}</div>
        <Reorder.Group
          as="div"
          axis="xy"
          values={sectors.map((sector) => sector.key)}
          onReorder={orderRows}
          className="grid grid-cols-[repeat(auto-fill,15.5rem)] gap-x-2"
        >
          {sectors.map((sector, index) => (
            <AzimuthRow
              key={sector.key}
              sector={sector}
              index={index}
              state={getSectorRowState(session, sector)}
              errors={errorsByKey.get(sector.key) ?? NO_EDIT_ERRORS}
              cellCount={cellCounts.get(sector.key) ?? 0}
              isLocked={!canEdit}
              isReview={session.kind === "review"}
              dispatch={dispatch}
            />
          ))}
        </Reorder.Group>
      </div>
    </div>
  );
}
