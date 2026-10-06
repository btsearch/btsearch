import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { MISSING_VALUE } from "./fieldChanges";
import type { HistoryLine } from "./types";

type HistoryChangeValueProps = { from: ReactNode; to: ReactNode };
type HistoryChangeLinesProps = { lines: readonly HistoryLine[] };

export function HistoryChangeValue({ from, to }: HistoryChangeValueProps) {
  const { t } = useTranslation("stationDetails");

  if (from === null) {
    return (
      <span className="font-medium text-emerald-700 dark:text-emerald-300">
        <span className="sr-only">{t("history.values.current")}: </span>
        {to ?? MISSING_VALUE}
      </span>
    );
  }

  if (to === null) {
    return (
      <span className="font-medium text-rose-700 dark:text-rose-300">
        <span className="sr-only">{t("history.values.previous")}: </span>
        {from}
      </span>
    );
  }

  return (
    <>
      <span className="rounded-sm bg-red-500/10 px-1 py-px text-red-700 dark:text-red-300">
        <span className="sr-only">{t("history.values.previous")}: </span>
        {from}
      </span>
      <span aria-hidden className="mx-1 text-muted-foreground/50">
        <HugeiconsIcon icon={ArrowRight01Icon} className="inline size-3 align-[-2px]" />
      </span>
      <span className="rounded-sm bg-emerald-500/10 px-1 py-px font-medium text-emerald-700 dark:text-emerald-300">
        <span className="sr-only">{t("history.values.current")}: </span>
        {to}
      </span>
    </>
  );
}

export function HistoryChangeLines({ lines }: HistoryChangeLinesProps) {
  return (
    <div className="text-xs leading-6 text-muted-foreground wrap-break-word">
      {lines.map((line) => (
        <p key={line.key}>
          {line.label}
          {line.from !== null && line.to !== null ? " " : ": "}
          <HistoryChangeValue from={line.from} to={line.to} />
        </p>
      ))}
    </div>
  );
}
