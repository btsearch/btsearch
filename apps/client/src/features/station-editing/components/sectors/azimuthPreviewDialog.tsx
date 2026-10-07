import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AzimuthSource, FetchedAzimuths } from "../../data/azimuthSources";
import { useEditText } from "../../hooks/useStationDraft";
import { toDegreesPart } from "../../model/changes";
import type { StationSnapshot } from "../../model/types";
import { type PreviewLine, buildPreviewLines, listChangeIds } from "./azimuthPreview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type AzimuthPreview = {
  token: number;
  fetched: FetchedAzimuths;
  partnerName: string | null;
};

type AzimuthPreviewDialogProps = {
  preview: AzimuthPreview | null;
  draft: StationSnapshot;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onApply: (tickedIds: ReadonlySet<string>, lines: readonly PreviewLine[]) => void;
};

type PreviewBodyProps = {
  preview: AzimuthPreview;
  draft: StationSnapshot;
  onApply: (tickedIds: ReadonlySet<string>, lines: readonly PreviewLine[]) => void;
};

type PreviewLineRowProps = {
  line: PreviewLine;
  isTicked: boolean;
  onTickedChange: (isTicked: boolean) => void;
};

type EmfReportLineProps = {
  measuredOn: string | null;
  sectorAntennaCount: number;
};

const TONE_CLASSES: Record<PreviewLine["kind"], string> = {
  changed: "text-amber-600 dark:text-amber-400",
  unchanged: "text-muted-foreground",
  added: "text-emerald-600 dark:text-emerald-400",
};
const VALUE_CLASS = "min-w-[54px] shrink-0 font-mono";

function formatReportDay(day: string, language: string): string {
  return new Date(day).toLocaleDateString(language, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function EmfReportLine({ measuredOn, sectorAntennaCount }: EmfReportLineProps) {
  const { t, i18n } = useTranslation("stations");
  const report =
    measuredOn === null
      ? t("edit.azimuths.preview.latestReport")
      : t("edit.azimuths.preview.reportDate", { date: formatReportDay(measuredOn, i18n.language) });

  return (
    <DialogDescription>
      {report}, {t("edit.azimuths.preview.sectorAntennas", { count: sectorAntennaCount })}
    </DialogDescription>
  );
}

function PreviewLineRow({ line, isTicked, onTickedChange }: PreviewLineRowProps) {
  const { t } = useTranslation(["stations", "stationDetails"]);
  const text = useEditText();
  const tickId = useId();
  const isChange = line.kind !== "unchanged";
  const changedNote =
    line.cellCount > 0 ? t("edit.azimuths.preview.changedWithCells", { count: line.cellCount }) : t("edit.azimuths.preview.changed");
  const notes: Record<PreviewLine["kind"], string> = {
    changed: changedNote,
    unchanged: t("stationDetails:si2pemAntennaData.comparison.unchanged"),
    added: t("edit.azimuths.preview.added"),
  };

  return (
    <li className="border-t border-border/60">
      <label
        htmlFor={tickId}
        className={cn("flex min-h-9.5 items-center gap-2.5 px-1 py-1 text-[13px] leading-[18px]", isChange ? "cursor-pointer" : null)}
      >
        <Checkbox id={tickId} checked={isTicked} onCheckedChange={(checked) => onTickedChange(checked === true)} disabled={!isChange} />
        <span className={cn(VALUE_CLASS, "text-muted-foreground")}>{text.formatPart(toDegreesPart(line.current))}</span>
        <HugeiconsIcon icon={ArrowRight02Icon} aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className={cn(VALUE_CLASS, "font-semibold")}>{text.formatPart(toDegreesPart(line.next))}</span>
        <span className={cn("min-w-0 flex-1", TONE_CLASSES[line.kind])}>{notes[line.kind]}</span>
      </label>
    </li>
  );
}

function PreviewBody({ preview, draft, onApply }: PreviewBodyProps) {
  const { t } = useTranslation(["stations", "common"]);
  const { fetched, partnerName } = preview;
  const [lines] = useState(() => buildPreviewLines(draft, fetched.degrees));
  const [tickedIds, setTickedIds] = useState<ReadonlySet<string>>(() => new Set(listChangeIds(lines)));
  const titles: Record<AzimuthSource, string> = {
    emf: t("edit.azimuths.preview.emfTitle"),
    register: t("edit.azimuths.preview.registerTitle"),
    partner: t("edit.azimuths.preview.partnerTitle", { brand: partnerName ?? "" }),
  };

  function setLineTicked(lineId: string, isTicked: boolean) {
    setTickedIds((knownIds) => {
      const nextIds = new Set(knownIds);
      if (isTicked) nextIds.add(lineId);
      else nextIds.delete(lineId);
      return nextIds;
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{titles[fetched.source]}</DialogTitle>
        {fetched.source === "emf" ? <EmfReportLine measuredOn={fetched.measuredOn} sectorAntennaCount={fetched.sectorAntennaCount} /> : null}
      </DialogHeader>
      <ul className="custom-scrollbar -my-1 max-h-[min(50vh,24rem)] overflow-y-auto">
        {lines.map((line) => (
          <PreviewLineRow
            key={line.id}
            line={line}
            isTicked={tickedIds.has(line.id)}
            onTickedChange={(isTicked) => setLineTicked(line.id, isTicked)}
          />
        ))}
      </ul>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" className="cursor-pointer" />}>{t("common:actions.cancel")}</DialogClose>
        <Button type="button" className="cursor-pointer" disabled={tickedIds.size === 0} onClick={() => onApply(tickedIds, lines)}>
          {t("edit.azimuths.preview.apply", { count: tickedIds.size })}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AzimuthPreviewDialog({ preview, draft, isOpen, onOpenChange, onApply }: AzimuthPreviewDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        {preview === null ? null : <PreviewBody key={preview.token} preview={preview} draft={draft} onApply={onApply} />}
      </DialogContent>
    </Dialog>
  );
}
