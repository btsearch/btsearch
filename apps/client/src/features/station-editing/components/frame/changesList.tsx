import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { useEditText } from "../../hooks/useStationDraft";
import { getGroupLabel } from "../../model/changes";
import type { ChangeItem } from "../../model/types";
import { toEditTargetId } from "./editTargets";

type ChangesListProps = {
  changes: readonly ChangeItem[];
  marksCorrections?: boolean;
  ariaLabel?: string;
  className?: string;
};

const GROUP_CLASS = "w-[78px] shrink-0 text-xs leading-[18px] text-muted-foreground";
const CORRECTION_MARK_CLASS = "mr-1.5 inline-block size-2.5 rounded-[3px] border border-primary bg-primary/10 align-[-1px]";

export function ChangesList({ changes, marksCorrections = false, ariaLabel, className }: ChangesListProps) {
  const { t } = useTranslation("stations");
  const text = useEditText();
  const correctionTitle = t("edit.frame.ownCorrection");

  return (
    <ul aria-label={ariaLabel} className={className}>
      {changes.map((change, position) => (
        <li
          key={`${change.group}:${toEditTargetId(change.target)}:${change.kind}:${position}`}
          className="flex gap-2.5 border-t border-border/60 px-2 py-1.5"
        >
          <span className={GROUP_CLASS}>{text.formatPart(getGroupLabel(change.group))}</span>
          <span className="min-w-0 flex-1 text-[13px] leading-[18px] wrap-anywhere">
            {marksCorrections && change.isCorrection ? (
              <span role="img" aria-label={correctionTitle} title={correctionTitle} className={CORRECTION_MARK_CLASS} />
            ) : null}
            {text.formatParts(change.label)}
            {change.pair === null ? null : (
              <span className="font-mono text-[12.5px]">
                {" "}
                <del className="text-muted-foreground">{text.formatPart(change.pair.before)}</del>
                <HugeiconsIcon icon={ArrowRight02Icon} aria-hidden="true" className="mx-1 inline-block size-3 align-[-2px] text-muted-foreground" />
                <ins className="text-amber-600 no-underline dark:text-amber-400">{text.formatPart(change.pair.after)}</ins>
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
