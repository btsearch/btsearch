import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { StationDraftApi } from "../../hooks/useStationDraft";
import { patchCell } from "../../model/draftReducer";
import { RAT_FIELDS } from "../../model/ratFields";
import type { CellDraft, Rat } from "../../model/types";
import { getBandMark } from "./cellFields";
import { getNetworkChoice } from "./cellRules";
import { FIELD_NETWORKS_CLASS, NetworkPicker } from "./networksField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getBandLabel } from "@/features/station-details/station/utils/bands";

type SharedNetworksDialogProps = {
  edit: StationDraftApi;
  rat: Rat;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type BandCell = CellDraft & { bandId: number };

type DialogBodyProps = {
  edit: StationDraftApi;
  rat: Rat;
  onDone: () => void;
};

type BandRowProps = {
  label: string;
  mark: string | null;
  cellCount: number;
  isPicked: boolean;
  onPickedChange: (isPicked: boolean) => void;
};

function findCommonExtraPlmns(cells: readonly BandCell[]): string[] {
  const [first, ...rest] = cells.map((cell) => [...cell.extraPlmns].sort());
  if (first === undefined) return [];

  const key = first.join();
  return rest.every((codes) => codes.join() === key) ? first : [];
}

function BandRow({ label, mark, cellCount, isPicked, onPickedChange }: BandRowProps) {
  const { t } = useTranslation();
  const tickId = useId();

  return (
    <li className="border-t border-border/60">
      <label htmlFor={tickId} className="flex min-h-9.5 cursor-pointer items-center gap-2.5 px-1 py-1 text-[13px] leading-4.5">
        <Checkbox id={tickId} checked={isPicked} onCheckedChange={(checked) => onPickedChange(checked === true)} />
        <span className="font-semibold">{label}</span>
        {mark === null ? null : <span className="text-muted-foreground">{mark}</span>}
        <span className="ml-auto text-muted-foreground">{t("common:labels.cells", { count: cellCount })}</span>
      </label>
    </li>
  );
}

function DialogBody({ edit, rat, onDone }: DialogBodyProps) {
  const { t, i18n } = useTranslation();
  const { session, lookups, dispatch } = edit;
  const cells = session.draft.cells.filter((cell): cell is BandCell => cell.rat === rat && !cell.isDeleted && cell.bandId !== null);
  const bandIds = [...new Set(cells.map((cell) => cell.bandId))];
  const [pickedBandIds, setPickedBandIds] = useState<ReadonlySet<number>>(() => new Set(bandIds));
  const [extraPlmns, setExtraPlmns] = useState(() => findCommonExtraPlmns(cells));
  const targetKeys = new Set(cells.filter((cell) => pickedBandIds.has(cell.bandId)).map((cell) => cell.key));
  const networksLabel = t("stations:edit.cells.sharedNetworks.networks");
  const bandsLabelId = useId();

  function setBandPicked(bandId: number, isPicked: boolean) {
    setPickedBandIds((known) => {
      const next = new Set(known);
      if (isPicked) next.add(bandId);
      else next.delete(bandId);
      return next;
    });
  }

  function apply() {
    const nextCells = session.draft.cells.map((cell) => (targetKeys.has(cell.key) ? patchCell(cell, { extraPlmns }) : cell));
    dispatch({ type: "applyCells", cells: nextCells });
    onDone();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("stations:edit.cells.sharedNetworks.title", { rat: RAT_FIELDS[rat].name })}</DialogTitle>
      </DialogHeader>
      <div className="min-w-0">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">{networksLabel}</span>
        <NetworkPicker
          choice={getNetworkChoice(edit)}
          rat={rat}
          extraPlmns={extraPlmns}
          label={networksLabel}
          className={FIELD_NETWORKS_CLASS}
          isInvalid={false}
          isLocked={false}
          isNavigable={false}
          onChange={setExtraPlmns}
        />
      </div>
      <div className="min-w-0">
        <span id={bandsLabelId} className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("stations:edit.cells.sharedNetworks.bands")}
        </span>
        <ul aria-labelledby={bandsLabelId} className="custom-scrollbar max-h-[min(40vh,18rem)] overflow-y-auto">
          {bandIds.map((bandId) => {
            const band = lookups.bandsById.get(bandId);
            return (
              <BandRow
                key={bandId}
                label={band === undefined ? t("stations:cells.unknownBand") : (getBandLabel(band, i18n.language) ?? band.name)}
                mark={band === undefined ? null : getBandMark(band)}
                cellCount={cells.filter((cell) => cell.bandId === bandId).length}
                isPicked={pickedBandIds.has(bandId)}
                onPickedChange={(isPicked) => setBandPicked(bandId, isPicked)}
              />
            );
          })}
        </ul>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" className="cursor-pointer" />}>{t("common:actions.cancel")}</DialogClose>
        <Button type="button" className="cursor-pointer" disabled={targetKeys.size === 0} onClick={apply}>
          {t("stations:edit.cells.sharedNetworks.apply", { count: targetKeys.size })}
        </Button>
      </DialogFooter>
    </>
  );
}

export function SharedNetworksDialog({ edit, rat, isOpen, onOpenChange }: SharedNetworksDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-110">
        <DialogBody edit={edit} rat={rat} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
