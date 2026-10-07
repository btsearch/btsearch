import { AirportTowerIcon, Building03Icon, Image01Icon, Link02Icon, Location01Icon, PencilEdit02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { SubmissionAction } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { ReviewNoteField } from "./reviewNoteField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { ReviewFacts, SharedPlaceField } from "@/features/admin/submissions/reviewNotices";

type ApproveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: SubmissionAction;
  stationLabel: string;
  placeLabel: string;
  partnerLabel: string | null;
  changeCount: number;
  correctionCount: number;
  uploadedPhotoCount: number;
  facts: ReviewFacts;
  note: string;
  onNoteChange: (note: string) => void;
  error: string | null;
  isBusy: boolean;
  onConfirm: () => void;
};

type EffectLineProps = {
  icon: IconSvgElement;
  children: string;
};

const PLACE_FIELD_KEYS: Record<SharedPlaceField["field"], string> = {
  regionId: "submissions:review.approve.placeFields.regionId",
  city: "submissions:review.approve.placeFields.city",
  address: "submissions:review.approve.placeFields.address",
  structureType: "submissions:review.approve.placeFields.structureType",
  structureOwner: "submissions:review.approve.placeFields.structureOwner",
  structureNote: "submissions:review.approve.placeFields.structureNote",
};
const PHRASE_SEPARATOR = ", ";

function EffectLine({ icon, children }: EffectLineProps) {
  return (
    <li className="flex items-start gap-2 text-[13px] leading-[18px]">
      <HugeiconsIcon icon={icon} aria-hidden="true" className="mt-px size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 wrap-anywhere">{children}</span>
    </li>
  );
}

export function ApproveDialog({
  open,
  onOpenChange,
  action,
  stationLabel,
  placeLabel,
  partnerLabel,
  changeCount,
  correctionCount,
  uploadedPhotoCount,
  facts,
  note,
  onNoteChange,
  error,
  isBusy,
  onConfirm,
}: ApproveDialogProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const { sharedPlace, proposedOwner } = facts;

  let stationLine = t("review.approve.stationChanges", { station: stationLabel, count: changeCount });
  if (action === "create") stationLine = t("review.approve.stationCreated", { station: stationLabel });
  if (action === "delete") stationLine = t("review.approve.stationDeleted", { station: stationLabel });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="pr-7">
          <DialogTitle>{t("review.approve.title")}</DialogTitle>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5">
          <EffectLine icon={AirportTowerIcon}>{stationLine}</EffectLine>
          {proposedOwner === null ? null : (
            <EffectLine icon={Building03Icon}>{t("review.approve.newOwner", { name: proposedOwner.name })}</EffectLine>
          )}
          {sharedPlace === null || sharedPlace.fields.length === 0 ? null : (
            <EffectLine icon={Location01Icon}>
              {t("review.approve.placeChanges", {
                place: placeLabel,
                changes: sharedPlace.fields.map(({ field }) => t(PLACE_FIELD_KEYS[field])).join(PHRASE_SEPARATOR),
                count: sharedPlace.stationCount,
              })}
            </EffectLine>
          )}
          {sharedPlace === null || !sharedPlace.movesWholePlace ? null : (
            <EffectLine icon={Location01Icon}>{t("review.approve.placeMoved", { place: placeLabel, count: sharedPlace.stationCount })}</EffectLine>
          )}
          {partnerLabel === null ? null : <EffectLine icon={Link02Icon}>{t("review.partnerAzimuths", { station: partnerLabel })}</EffectLine>}
          {uploadedPhotoCount === 0 ? null : <EffectLine icon={Image01Icon}>{t("review.approve.photos", { count: uploadedPhotoCount })}</EffectLine>}
        </ul>
        {correctionCount === 0 ? null : (
          <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-primary">
            <HugeiconsIcon icon={PencilEdit02Icon} aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{t("review.approve.corrections", { count: correctionCount })}</span>
          </p>
        )}
        <ReviewNoteField
          label={t("review.approve.noteLabel")}
          placeholder={t("review.approve.notePlaceholder")}
          value={note}
          onChange={onNoteChange}
          showsCount
        />
        {error === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="button" className="cursor-pointer" disabled={isBusy} onClick={onConfirm}>
            {isBusy ? <Spinner /> : <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" />}
            {t("common:actions.approve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
