import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { formatTextPart } from "../../model/changes";
import type { FieldMark } from "../../model/types";
import { cn } from "@/lib/utils";

type MarkTone = FieldMark["tone"];

type WasLineProps = {
  tone?: MarkTone;
  className?: string;
  children: ReactNode;
};

type FieldMarksProps = {
  marks: readonly FieldMark[] | undefined;
  variant?: "line" | "struck";
  className?: string;
};

const DOT_CLASSES: Record<MarkTone, string> = { database: "bg-amber-500", submitted: "bg-primary" };
const TEXT_CLASSES: Record<MarkTone, string> = { database: "text-amber-600 dark:text-amber-400", submitted: "text-primary" };

export function WasLine({ tone = "database", className, children }: WasLineProps) {
  const { t } = useTranslation();
  const label = tone === "database" ? t("submissions:diff.was") : t("stations:edit.marks.submitted");

  return (
    <div className={cn("flex items-start gap-1.5 mt-1 text-xs", className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full shrink-0 mt-1.25", DOT_CLASSES[tone])} />
      <span className={cn("font-medium whitespace-nowrap shrink-0", TEXT_CLASSES[tone])}>{label}:</span>
      <span className="font-mono text-foreground min-w-0 wrap-break-word">{children}</span>
    </div>
  );
}

export function FieldMarks({ marks, variant = "line", className }: FieldMarksProps) {
  const { t } = useTranslation();
  if (marks === undefined || marks.length === 0) return null;

  const texts = marks.map((mark) => ({ tone: mark.tone, text: formatTextPart(mark.value, (key, values) => t(key, values)) }));
  if (variant === "line") {
    return (
      <>
        {texts.map((mark) => (
          <WasLine key={mark.tone} tone={mark.tone} className={className}>
            {mark.text}
          </WasLine>
        ))}
      </>
    );
  }

  const databaseTitle = t("stations:edit.marks.databaseValue");
  const submittedTitle = t("stations:edit.marks.submittedValue");
  return (
    <div className={cn("mt-0.5 flex gap-1.5 overflow-hidden whitespace-nowrap pl-2 font-mono text-[11px] leading-[14px]", className)}>
      {texts.map((mark) => {
        const title = mark.tone === "database" ? databaseTitle : submittedTitle;
        return (
          <s key={mark.tone} title={title} className={TEXT_CLASSES[mark.tone]}>
            <span className="sr-only">{title}: </span>
            {mark.text}
          </s>
        );
      })}
    </div>
  );
}
