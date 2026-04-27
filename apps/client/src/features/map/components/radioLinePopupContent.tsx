import { ArrowRight02Icon, Share08Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Suspense, lazy, memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { usePreferences } from "@/hooks/usePreferences";
import { isPermitExpired } from "@/lib/dateUtils";
import { formatCoordinates } from "@/lib/gpsUtils";
import { getOperatorColor, normalizeOperatorName, resolveOperatorMnc } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";

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
    <div className="px-3 py-1.5 border-t border-border/50 flex items-center">
      <span className="text-[10px] text-muted-foreground font-mono">
        GPS: {formatCoordinates(coordinates[1], coordinates[0], preferences.gpsFormat)}
      </span>
    </div>
  );
}

type RadioLinePopupContentProps = {
  link: DuplexRadioLink;
  showAddToList?: boolean;
  onOpenDetails: (link: DuplexRadioLink) => void;
};

export const RadioLinePopupContent = memo(function RadioLinePopupContent({ link, showAddToList = false, onOpenDetails }: RadioLinePopupContentProps) {
  const { t } = useTranslation(["main", "common"]);

  const first = link.directions[0];
  const operatorName = first.operator?.name ?? t("unknownOperator");
  const mnc = resolveOperatorMnc(first.operator?.mnc, first.operator?.name);
  const color = mnc ? getOperatorColor(mnc) : "#3b82f6";
  const distance = calculateDistance(link.a.latitude, link.a.longitude, link.b.latitude, link.b.longitude);
  const permitNumber = first.permit.number;
  const linkTypeStyle = getLinkTypeStyle(link.linkType);
  const { dl: dlSpeed, ul: ulSpeed } = calculateLinkDirectionalSpeeds(link);

  return (
    <div className="w-72 text-sm relative">
      <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 cursor-pointer" onClick={() => onOpenDetails(link)}>
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="size-2 rounded-[2px] shrink-0" style={{ backgroundColor: color }} />
          <span className="font-medium text-xs truncate">{normalizeOperatorName(operatorName)}</span>
          {permitNumber && <span className="text-[9px] text-muted-foreground font-mono shrink-0">{permitNumber}</span>}
        </div>

        <div className="flex items-center gap-2 mt-1.5 pl-3.5">
          <div className="flex items-center text-[10px] font-mono whitespace-nowrap">
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
          {link.isExpired && <span className="text-[9px] font-bold uppercase text-destructive">{t("common:status.expired")}</span>}
        </div>

        <div className="mt-2 pl-3.5 space-y-1.5">
          {link.directions.map((dir) => {
            const dirExpired = isPermitExpired(dir.permit.expiry_date);
            const isForward = dir.tx.latitude === link.a.latitude && dir.tx.longitude === link.a.longitude;
            const dirCalcSpeed =
              dir.link.ch_width && dir.link.modulation_type ? calculateRadiolineSpeed(dir.link.ch_width, dir.link.modulation_type) : null;
            const dirSpeedBadge = (() => {
              if (dirCalcSpeed !== null && dirCalcSpeed !== undefined)
                return <span className="text-[9px] font-mono font-semibold text-emerald-600">{formatSpeed(dirCalcSpeed)}</span>;
              if (dir.link.bandwidth)
                return <span className="text-[9px] font-mono font-medium text-muted-foreground">{formatBandwidth(dir.link.bandwidth)}</span>;
              return null;
            })();
            return (
              <div key={dir.id} className="flex items-start gap-1.5">
                {link.directions.length > 1 && (
                  <span className="flex items-center gap-px text-[8px] font-bold text-muted-foreground shrink-0 leading-4.5">
                    {isForward ? "A" : "B"}
                    <HugeiconsIcon icon={ArrowRight02Icon} className="size-2.5" />
                    {isForward ? "B" : "A"}
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-[9px] font-mono font-semibold text-foreground/80">{formatFrequency(dir.link.freq)}</span>
                  {dir.link.polarization && <span className="text-[9px] font-bold text-muted-foreground">{dir.link.polarization}</span>}
                  {dirSpeedBadge}
                  {dirExpired && <span className="size-1.5 rounded-full bg-destructive shrink-0 mt-1" title={t("common:status.expired")} />}
                </div>
              </div>
            );
          })}
        </div>
      </button>

      <div className="absolute bottom-2 right-2 flex items-center gap-1">
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
