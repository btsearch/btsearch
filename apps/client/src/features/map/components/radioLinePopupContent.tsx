import { Alert02Icon, ArrowRight02Icon, Share08Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Suspense, lazy, memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DuplexRadioLink } from "../utils";
import {
  buildRadiolineShareUrl,
  calculateDistance,
  calculateLinkDirectionalSpeeds,
  calculateRadiolineSpeed,
  formatBandwidth,
  formatDistance,
  formatFrequency,
  formatSpeed,
  getLinkTypeStyle,
} from "../utils";
import { DirectionalSpeedBadge } from "./directionalSpeedBadge";
import { CopyButton } from "@/features/station-details/components/copyButton";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { usePreferences } from "@/hooks/usePreferences";
import { getOperatorColor, normalizeOperatorName, resolveOperatorMnc } from "@/lib/cellular/operators";
import { formatCoordinates } from "@/lib/geo/coordinates";
import { cn } from "@/lib/utils";

const AddToListPopover = lazy(() => import("@/features/lists/components/addToListPopover").then((m) => ({ default: m.AddToListPopover })));

function PopupShareButton({ link }: { link: DuplexRadioLink }) {
  const { t } = useTranslation(["common"]);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(() => {
    const shareUrl = buildRadiolineShareUrl(link);
    if (navigator.share) {
      const operatorName = link.directions[0].operator?.name ?? "";
      void navigator
        .share({
          title: `${operatorName} - ${formatFrequency(link.directions[0].link.freq)}`,
          url: shareUrl,
        })
        .then(() => {})
        .catch((error: unknown) => {
          if ((error as Error).name === "AbortError") return;
        });
      return;
    }

    void navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((error) => {
        console.error("Failed to copy:", error);
      });
  }, [link]);

  return (
    <button
      type="button"
      onClick={handleShare}
      className="p-0.5 hover:bg-muted rounded transition-colors cursor-pointer shrink-0"
      aria-label={t("common:actions.share")}
    >
      {copied ? (
        <HugeiconsIcon icon={Tick02Icon} className="size-3 text-emerald-500" />
      ) : (
        <HugeiconsIcon icon={Share08Icon} className="size-3 text-muted-foreground" />
      )}
    </button>
  );
}

export function RadioLineFooter({ coordinates }: { coordinates: [number, number] }) {
  const { preferences } = usePreferences();
  return (
    <div className="group/copy flex h-7 items-center gap-1.5 border-t border-border/50 px-3">
      <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
        GPS: {formatCoordinates(coordinates[1], coordinates[0], preferences.gpsFormat)}
      </span>
      <CopyButton text={`${coordinates[1]}, ${coordinates[0]}`} compact />
    </div>
  );
}

type RadioLinePopupContentProps = {
  link: DuplexRadioLink;
  isFirst?: boolean;
  showAddToList?: boolean;
  onOpenDetails: (link: DuplexRadioLink) => void;
};

export const RadioLinePopupContent = memo(function RadioLinePopupContent({
  link,
  isFirst = false,
  showAddToList = false,
  onOpenDetails,
}: RadioLinePopupContentProps) {
  const { t } = useTranslation(["main", "common"]);

  const first = link.directions[0];
  const operatorName = first.operator?.name ?? t("unknownOperator");
  const mnc = resolveOperatorMnc(first.operator?.mnc, first.operator?.name);
  const hasMnc = mnc !== null && mnc !== undefined;
  const color = hasMnc ? getOperatorColor(mnc) : "#3b82f6";
  const distance = calculateDistance(link.a.latitude, link.a.longitude, link.b.latitude, link.b.longitude);
  const permitNumber = first.permit.number;
  const linkTypeStyle = getLinkTypeStyle(link.linkType);
  const { dl: dlSpeed, ul: ulSpeed } = calculateLinkDirectionalSpeeds(link);
  const headerPadding = showAddToList ? (isFirst ? "pr-20" : "pr-14") : isFirst ? "pr-12" : "pr-8";

  return (
    <div className="relative border-b border-border/30 last:border-0">
      <button
        type="button"
        className="w-full cursor-pointer px-3 py-2 text-left transition-colors hover:bg-muted/50"
        onClick={() => onOpenDetails(link)}
        style={{ backgroundImage: `linear-gradient(115deg, ${color}18 0%, ${color}08 38%, transparent 72%)` }}
      >
        <div className={cn("flex min-w-0 items-center gap-1.5", headerPadding)}>
          {!hasMnc ? <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden /> : null}
          <DialogOperatorName compact name={normalizeOperatorName(operatorName)} mnc={mnc} />
          {permitNumber && <span className="text-[10px] text-muted-foreground font-mono shrink-0">{permitNumber}</span>}
        </div>

        <div className="mt-1.5 flex items-start gap-2 pl-3.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-[11px]">
            <span className="text-muted-foreground">{formatDistance(distance)}</span>
            {linkTypeStyle ? (
              <>
                <span className="text-muted-foreground/40">/</span>
                <span className={cn("font-bold uppercase", linkTypeStyle.text)}>{link.linkType}</span>
              </>
            ) : null}
            {dlSpeed !== null || ulSpeed !== null ? (
              <>
                <span className="text-muted-foreground/40">/</span>
                <DirectionalSpeedBadge dl={dlSpeed !== null ? formatSpeed(dlSpeed) : null} ul={ulSpeed !== null ? formatSpeed(ulSpeed) : null} />
              </>
            ) : null}
          </div>
          {link.isExpired && (
            <span title={t("common:status.expired")} className="shrink-0">
              <HugeiconsIcon icon={Alert02Icon} className="size-3.5 text-destructive" />
            </span>
          )}
        </div>

        <div className="mt-2 pl-3.5 space-y-1.5">
          {link.directions.map((dir) => {
            const isForward = dir.tx.latitude === link.a.latitude && dir.tx.longitude === link.a.longitude;
            const dirCalcSpeed =
              dir.link.ch_width && dir.link.modulation_type ? calculateRadiolineSpeed(dir.link.ch_width, dir.link.modulation_type) : null;
            const dirSpeedBadge = (() => {
              if (dirCalcSpeed !== null && dirCalcSpeed !== undefined)
                return <span className="text-[10px] font-mono font-semibold text-emerald-600">{formatSpeed(dirCalcSpeed)}</span>;
              if (dir.link.bandwidth)
                return <span className="text-[10px] font-mono font-medium text-muted-foreground">{formatBandwidth(dir.link.bandwidth)}</span>;
              return null;
            })();
            return (
              <div key={dir.id} className="flex items-start gap-1.5">
                {link.directions.length > 1 && (
                  <span className="flex -translate-y-0.5 items-center gap-px text-[9px] font-bold text-muted-foreground shrink-0 leading-4.5">
                    {isForward ? "A" : "B"}
                    <HugeiconsIcon icon={ArrowRight02Icon} className="size-2.5 -translate-y-px" />
                    {isForward ? "B" : "A"}
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-[10px] font-mono font-semibold text-foreground/80">{formatFrequency(dir.link.freq)}</span>
                  {dir.link.polarization && <span className="text-[10px] font-bold text-muted-foreground">{dir.link.polarization}</span>}
                  {dirSpeedBadge}
                </div>
              </div>
            );
          })}
        </div>
      </button>

      <div className={cn("absolute top-2 flex items-center gap-1", isFirst ? "right-8" : "right-2")}>
        {showAddToList && (
          <Suspense>
            <AddToListPopover radiolineIds={link.directions.map((d) => d.id)} />
          </Suspense>
        )}
        <PopupShareButton link={link} />
      </div>
    </div>
  );
});
