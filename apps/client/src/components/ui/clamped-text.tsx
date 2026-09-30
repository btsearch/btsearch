import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

const LINE_CLAMP = {
  2: "line-clamp-2",
  3: "line-clamp-3",
} as const;

type ClampedTextProps = {
  text: string;
  lines: keyof typeof LINE_CLAMP;
  className?: string;
  toggleClassName?: string;
  onExpand?: () => void;
};

export function ClampedText({ text, lines, className, toggleClassName, onExpand }: ClampedTextProps) {
  const { t } = useTranslation("common");
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (element === null || expanded) return;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, text]);

  const toggle = () => {
    if (!expanded) onExpand?.();
    setExpanded(!expanded);
  };

  return (
    <>
      <p ref={textRef} className={cn("whitespace-pre-line wrap-break-word", !expanded && LINE_CLAMP[lines], className)}>
        {text}
      </p>
      {overflowing ? (
        <button
          type="button"
          aria-expanded={expanded}
          className={cn(
            "cursor-pointer rounded-sm font-semibold text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
            toggleClassName,
          )}
          onClick={toggle}
        >
          {expanded ? t("actions.showLess") : t("actions.showMore")}
        </button>
      ) : null}
    </>
  );
}
