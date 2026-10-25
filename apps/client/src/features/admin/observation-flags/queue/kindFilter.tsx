import { ArrowDown01Icon, Flag02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservationFlagCounts, ObservationFlagKind } from "@openbts/shared/contract";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { FLAG_KIND_GROUPS, getKindLabel } from "../model/kinds";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type KindCounts = ObservationFlagCounts["kinds"] | undefined;

type KindFilterProps = {
  kinds: readonly ObservationFlagKind[];
  counts: KindCounts;
  isAdmin: boolean;
  onChange: (kinds: ObservationFlagKind[]) => void;
};

const ROW_CLASS = "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-muted";

function readCount(counts: KindCounts, kind: ObservationFlagKind): number | null {
  if (counts === undefined) return null;
  return counts[kind] ?? 0;
}

function describeKinds(kinds: readonly ObservationFlagKind[], t: TFunction): string {
  const [first] = kinds;
  if (first === undefined) return t("observationFlags.filters.allKinds");
  if (kinds.length === 1) return getKindLabel(first, t);
  return t("observationFlags.filters.kindsMore", { kind: getKindLabel(first, t), count: kinds.length - 1 });
}

function listShownGroups(counts: KindCounts, isAdmin: boolean) {
  return FLAG_KIND_GROUPS.filter((entry) => entry.group !== "admin" || isAdmin || entry.kinds.some((kind) => (readCount(counts, kind) ?? 0) > 0));
}

export function KindList({ kinds, counts, isAdmin, onChange }: KindFilterProps) {
  const { t, i18n } = useTranslation("admin");
  const picked = new Set(kinds);

  function toggle(kind: ObservationFlagKind, isPicked: boolean) {
    onChange(isPicked ? [...kinds, kind] : kinds.filter((other) => other !== kind));
  }

  return (
    <div className="flex flex-col">
      {listShownGroups(counts, isAdmin).map((entry) => (
        <div key={entry.group} role="group" aria-label={t(`observationFlags.groups.${entry.group}`)} className="flex flex-col">
          <span className="px-1.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">{t(`observationFlags.groups.${entry.group}`)}</span>
          {entry.kinds.map((kind) => {
            const count = readCount(counts, kind);
            return (
              <label key={kind} className={ROW_CLASS}>
                <Checkbox checked={picked.has(kind)} onCheckedChange={(isChecked) => toggle(kind, isChecked)} />
                <span className="min-w-0 flex-1 truncate">{getKindLabel(kind, t)}</span>
                {count === null ? null : (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count.toLocaleString(i18n.language)}</span>
                )}
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function KindFilter(props: KindFilterProps) {
  const { t } = useTranslation("admin");
  const { kinds } = props;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("observationFlags.filters.kind")}
        className={cn(
          "flex h-8 w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent pr-2 pl-2.5 text-sm transition-colors",
          "hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <HugeiconsIcon icon={Flag02Icon} aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", kinds.length === 0 ? "text-muted-foreground" : null)}>{describeKinds(kinds, t)}</span>
        </span>
        <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="custom-scrollbar max-h-[420px] w-[300px] overflow-y-auto p-1">
        <KindList {...props} />
      </PopoverContent>
    </Popover>
  );
}
