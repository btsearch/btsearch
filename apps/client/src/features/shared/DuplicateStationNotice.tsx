import { AlertCircleIcon, ArrowUpRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { type SearchStation, searchStations } from "@/features/submissions/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const EMPTY_RESULTS: SearchStation[] = [];
const FOCUS_RING_CLASS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const EDIT_LINK_CLASS = `mt-1 inline-flex items-center gap-0.5 rounded-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80 ${FOCUS_RING_CLASS}`;
const EDIT_LINK_ICON = <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3 shrink-0" aria-hidden />;

type DuplicateStationNoticeProps = {
  stationId: string;
  mnc: number | undefined;
  editTarget: "submission" | "admin";
  inputFocused?: boolean;
};

export function DuplicateStationNotice({ stationId, mnc, editTarget, inputFocused }: DuplicateStationNoticeProps) {
  const { t } = useTranslation("common");
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const trimmedId = stationId.trim();
  const debouncedId = useDebouncedValue(trimmedId, 400);

  const { data: results = EMPTY_RESULTS } = useQuery({
    queryKey: ["duplicate-station-check", debouncedId, mnc],
    queryFn: () => searchStations(`bts_id:"${debouncedId.replace(/"/g, "")}" mnc:${mnc}`),
    enabled: !inputFocused && debouncedId.length >= 2 && mnc !== undefined,
    staleTime: 1000 * 30,
  });

  const match =
    mnc === undefined ? undefined : results.find((s) => s.station_id.toLowerCase() === trimmedId.toLowerCase() && s.operator?.mnc === mnc);
  const visible = match !== undefined && dismissedId !== match.id;

  return (
    <div role="status" className="relative h-0">
      {visible ? (
        <div className="absolute inset-x-0 top-1 z-20 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none">
          <div className="absolute -top-1 left-4 size-2 rotate-45 border-l border-t border-(--chart-2)/40 bg-popover" />
          <div className="flex items-start gap-1.5 rounded-md border border-(--chart-2)/40 bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg">
            <HugeiconsIcon icon={AlertCircleIcon} className="mt-px size-3.5 shrink-0 text-chart-2" aria-hidden />
            <div className="min-w-0 flex-1">
              <p>
                <Trans
                  t={t}
                  i18nKey="duplicateStation.exists"
                  values={{ stationId: match.station_id }}
                  components={{ mono: <span className="font-mono" /> }}
                />
              </p>
              {editTarget === "admin" ? (
                <Link to="/admin/stations/$id" params={{ id: String(match.id) }} search={{ uke: undefined }} className={EDIT_LINK_CLASS}>
                  {t("duplicateStation.edit")}
                  {EDIT_LINK_ICON}
                </Link>
              ) : (
                <Link to="/submission" search={{ station: String(match.id) }} className={EDIT_LINK_CLASS}>
                  {t("duplicateStation.edit")}
                  {EDIT_LINK_ICON}
                </Link>
              )}
            </div>
            <button
              type="button"
              aria-label={t("actions.close")}
              onClick={() => setDismissedId(match.id)}
              className={`-mr-1 -mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground ${FOCUS_RING_CLASS}`}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
