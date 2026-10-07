import { useTranslation } from "react-i18next";

import type { Loadable } from "./loadable";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type CountValueProps = {
  count: Loadable<number>;
  skeletonClassName?: string;
};

type CreatedDateProps = {
  createdAt: string;
  className?: string;
};

export const EMPTY_VALUE = "-";
export const MONO_TEXT_CLASS = "font-mono text-[0.8125rem] tabular-nums";
export const MONO_INPUT_CLASS = "font-mono md:text-[0.8125rem]";

export function CountValue({ count, skeletonClassName }: CountValueProps) {
  const { i18n } = useTranslation();

  if (count.state === "loading") return <Skeleton aria-hidden="true" className={cn("inline-block h-3.5 w-8 align-middle", skeletonClassName)} />;
  if (count.state === "failed") return <EmptyValue />;
  return count.value.toLocaleString(i18n.language);
}

export function CreatedDate({ createdAt, className }: CreatedDateProps) {
  const { i18n } = useTranslation();

  return (
    <time dateTime={createdAt} className={cn("text-xs tabular-nums text-muted-foreground", className)}>
      {formatShortDate(createdAt, i18n.language)}
    </time>
  );
}
