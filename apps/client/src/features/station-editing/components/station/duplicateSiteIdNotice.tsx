import { AlertCircleIcon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { type DuplicateStation, duplicateSiteIdQueryOptions } from "../../data/duplicateSiteId";
import { CloseButton } from "@/components/ui/close-button";
import { EDITOR_STATION_SEARCH } from "@/features/admin/stations/editorStationSearch";
import { useCalmTransition } from "@/features/map/components/search-overlay/mapFilterMotion";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

type DuplicateSiteIdNoticeProps = {
  siteId: string;
  operatorId: number | null;
  editKind: "editor" | "form";
  isFieldFocused: boolean;
};

type NoticeBoxProps = {
  station: DuplicateStation;
  editKind: "editor" | "form";
  onDismiss: () => void;
};

const CHECK_DELAY = 400;
const HIDDEN = { opacity: 0, y: -4 } as const;
const SHOWN = { opacity: 1, y: 0 } as const;
const BOX_CLASS = cn(
  "flex items-start gap-1.5 rounded-md border border-(--chart-2)/40 bg-popover px-2.5 py-1.5",
  "text-xs text-popover-foreground shadow-lg",
);
const EDIT_LINK_CLASS = cn(
  "mt-1 inline-flex items-center gap-0.5 rounded-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none",
);

function NoticeBox({ station, editKind, onDismiss }: NoticeBoxProps) {
  const { t } = useTranslation("common");
  const transition = useCalmTransition();
  const linkContent = (
    <>
      {t("duplicateStation.edit")}
      <HugeiconsIcon icon={ArrowUpRight01Icon} aria-hidden="true" className="size-3 shrink-0" />
    </>
  );

  return (
    <motion.div initial={HIDDEN} animate={SHOWN} exit={HIDDEN} transition={transition} className="absolute inset-x-0 top-1 z-20">
      <div className="absolute -top-1 left-4 size-2 rotate-45 border-t border-l border-(--chart-2)/40 bg-popover" />
      <div className={BOX_CLASS}>
        <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="mt-px size-3.5 shrink-0 text-chart-2" />
        <div className="min-w-0 flex-1">
          <p>
            <Trans
              t={t}
              i18nKey="duplicateStation.exists"
              values={{ stationId: station.siteId }}
              components={{ mono: <span className="font-mono" /> }}
            />
          </p>
          {editKind === "editor" ? (
            <Link to="/admin/stations/$id" params={{ id: String(station.stationId) }} search={EDITOR_STATION_SEARCH} className={EDIT_LINK_CLASS}>
              {linkContent}
            </Link>
          ) : (
            <Link to="/submission" search={{ station: String(station.stationId) }} className={EDIT_LINK_CLASS}>
              {linkContent}
            </Link>
          )}
        </div>
        <CloseButton size="xs" onClick={onDismiss} className="-mt-0.5 -mr-1 shrink-0" />
      </div>
    </motion.div>
  );
}

export function DuplicateSiteIdNotice({ siteId, operatorId, editKind, isFieldFocused }: DuplicateSiteIdNoticeProps) {
  const [dismissedStationId, setDismissedStationId] = useState<number | null>(null);
  const typedSiteId = siteId.trim();
  const checkedSiteId = useDebouncedValue(typedSiteId, CHECK_DELAY);
  const { data: duplicate = null } = useQuery({ ...duplicateSiteIdQueryOptions(checkedSiteId, operatorId), enabled: !isFieldFocused });
  const isSameSiteId = duplicate !== null && duplicate.siteId.trim().toLowerCase() === typedSiteId.toLowerCase();
  const shownStation = duplicate !== null && isSameSiteId && duplicate.stationId !== dismissedStationId ? duplicate : null;

  return (
    <div role="status" className="relative h-0">
      <AnimatePresence initial={false}>
        {shownStation === null ? null : (
          <NoticeBox
            key={shownStation.stationId}
            station={shownStation}
            editKind={editKind}
            onDismiss={() => setDismissedStationId(shownStation.stationId)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
