import { ArrowUpRight01Icon, Flag02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { buttonVariants } from "@/components/ui/button";
import { stationFlagCountsQueryOptions } from "@/features/admin/observation-flags/api/flags";
import { FLAG_KINDS, getKindLabel } from "@/features/admin/observation-flags/model/kinds";
import { useCrowdAccess } from "@/features/map/crowd/access/useCrowdAccess";
import { cn } from "@/lib/utils";

type StationFlagsStripProps = {
  stationId: number;
  canReview: boolean;
  onClose: () => void;
};

function lowerFirst(text: string, language: string): string {
  const second = text.charAt(1);
  if (second !== second.toLocaleLowerCase(language)) return text;
  return text.charAt(0).toLocaleLowerCase(language) + text.slice(1);
}

export function StationFlagsStrip({ stationId, canReview, onClose }: StationFlagsStripProps) {
  const { t, i18n } = useTranslation(["stationDetails", "admin"]);
  const access = useCrowdAccess();
  const isShown = canReview && access.isAvailable;
  const { data: counts } = useQuery({ ...stationFlagCountsQueryOptions(stationId), enabled: isShown });
  const openCount = counts?.statuses.open;

  if (!isShown || counts === undefined || counts === null || openCount === undefined) return null;
  const kinds = FLAG_KINDS.filter((kind) => counts.kinds[kind] !== undefined).map((kind) => lowerFirst(getKindLabel(kind, t), i18n.language));

  return (
    <div className="flex items-start gap-2 border-t px-4 py-2 text-xs leading-4 sm:px-6">
      <HugeiconsIcon icon={Flag02Icon} aria-hidden="true" className="mt-px size-3.5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{t("dialog.openFlags", { count: openCount })}</span>
        <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">
          {" · "}
        </span>
        <span className="block text-muted-foreground sm:inline">{kinds.join(", ")}</span>
      </p>
      <Link
        to="/admin/observation-flags"
        search={{ stations: String(stationId) }}
        onClick={onClose}
        className={cn(buttonVariants({ variant: "ghost", size: "xs" }), "-my-1 -mr-2 shrink-0 cursor-pointer")}
      >
        {t("dialog.openInQueue")}
        <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" aria-hidden="true" className="text-muted-foreground" />
      </Link>
    </div>
  );
}
