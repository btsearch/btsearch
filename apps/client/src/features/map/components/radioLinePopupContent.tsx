import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
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
  getRadioLineMnc,
} from "../utils";
import { DirectionalSpeedBadge } from "./directionalSpeedBadge";
import { PopupAddToListButton, PopupBrandMark, PopupExpiredLabel, PopupOperatorName, PopupRowFrame, PopupShareButton } from "./popupParts";
import { CloseButton } from "@/components/ui/close-button";
import { RadioLineOperatorMark } from "@/features/station-details/components/radioLineOperatorMark";
import { FALLBACK_BRAND_COLOR } from "@/features/station-details/station/utils/brands";
import { getOperatorColor, normalizeOperatorName } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";
import type { RadioLine } from "@/types/station";

function pairDirections(link: DuplexRadioLink): RadioLine[][] {
  if (link.linkType === "XPIC" || link.directions.length <= 2) return [link.directions];
  const pairs: RadioLine[][] = [];
  for (let index = 0; index < link.directions.length; index += 2) pairs.push(link.directions.slice(index, index + 2));
  return pairs;
}

function RadioLineTitle({ link }: { link: DuplexRadioLink }) {
  const { t } = useTranslation("main");
  const first = link.directions[0];

  return (
    <>
      <PopupOperatorName name={normalizeOperatorName(first.operator?.name ?? t("unknownOperator"))} />
      {first.permit.number ? <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{first.permit.number}</span> : null}
      {link.isExpired ? <PopupExpiredLabel /> : null}
    </>
  );
}

function DirectionSpeed({ link }: { link: RadioLine["link"] }) {
  const speed = link.ch_width && link.modulation_type ? calculateRadiolineSpeed(link.ch_width, link.modulation_type) : null;
  if (speed !== null) return <span className="font-mono text-[10px] font-semibold text-emerald-600">{formatSpeed(speed)}</span>;
  if (link.bandwidth) return <span className="font-mono text-[10px] font-medium text-muted-foreground">{formatBandwidth(link.bandwidth)}</span>;
  return null;
}

export function RadioLineDetails({ link }: { link: DuplexRadioLink }) {
  const distance = calculateDistance(link.a.latitude, link.a.longitude, link.b.latitude, link.b.longitude);
  const linkTypeStyle = getLinkTypeStyle(link.linkType);
  const { dl, ul } = calculateLinkDirectionalSpeeds(link);

  return (
    <>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-[11px]">
        <span className="text-muted-foreground">{formatDistance(distance)}</span>
        {linkTypeStyle ? (
          <>
            <span className="text-muted-foreground/40">/</span>
            <span className={cn("font-bold uppercase", linkTypeStyle.text)}>{link.linkType}</span>
          </>
        ) : null}
        {dl !== null || ul !== null ? (
          <>
            <span className="text-muted-foreground/40">/</span>
            <DirectionalSpeedBadge dl={dl !== null ? formatSpeed(dl) : null} ul={ul !== null ? formatSpeed(ul) : null} />
          </>
        ) : null}
      </div>

      <div className="mt-2 divide-y divide-border/30">
        {pairDirections(link).map((pair) => (
          <div key={pair[0].id} className="space-y-1.5 py-1.5 first:pt-0 last:pb-0">
            {pair.map((direction) => {
              const isForward = direction.tx.latitude === link.a.latitude && direction.tx.longitude === link.a.longitude;

              return (
                <div key={direction.id} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  {link.directions.length > 1 ? (
                    <span className="flex shrink-0 items-center gap-px text-[9px] font-bold text-muted-foreground">
                      {isForward ? "A" : "B"}
                      <HugeiconsIcon icon={ArrowRight02Icon} className="size-2.5" aria-hidden="true" />
                      {isForward ? "B" : "A"}
                    </span>
                  ) : null}
                  <span className="font-mono text-[10px] font-semibold text-foreground/80">{formatFrequency(direction.link.freq)}</span>
                  {direction.link.polarization ? (
                    <span className="text-[10px] font-bold text-muted-foreground">{direction.link.polarization}</span>
                  ) : null}
                  <DirectionSpeed link={direction.link} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

type RadioLineRowProps = Omit<ComponentProps<typeof PopupRowFrame>, "mark" | "color" | "title"> & {
  link: DuplexRadioLink;
};

export function RadioLineRow({ link, ...frameProps }: RadioLineRowProps) {
  const mnc = getRadioLineMnc(link);
  const color = mnc === null ? FALLBACK_BRAND_COLOR : getOperatorColor(mnc);
  const mark = mnc === null ? <PopupBrandMark brand={null} color={color} /> : <RadioLineOperatorMark mnc={mnc} compact />;

  return <PopupRowFrame mark={mark} color={color} title={<RadioLineTitle link={link} />} {...frameProps} />;
}

type RadioLinePopupContentProps = {
  link: DuplexRadioLink;
  showAddToList?: boolean;
  onOpenDetails: (link: DuplexRadioLink) => void;
  onClose?: () => void;
};

export function RadioLinePopupContent({ link, showAddToList = false, onOpenDetails, onClose }: RadioLinePopupContentProps) {
  const { t } = useTranslation("main");
  const first = link.directions[0];
  const actionCount = (showAddToList ? 1 : 0) + 1 + (onClose ? 1 : 0);

  return (
    <RadioLineRow
      link={link}
      onOpen={() => onOpenDetails(link)}
      actionCount={actionCount}
      actions={
        <>
          {showAddToList ? <PopupAddToListButton radiolineIds={link.directions.map((direction) => direction.id)} /> : null}
          <PopupShareButton
            url={buildRadiolineShareUrl(link)}
            title={`${first.operator?.name ?? ""} - ${formatFrequency(first.link.freq)}`}
            label={t("popup.shareRadioline")}
          />
          {onClose ? <CloseButton size="xs" onClick={onClose} /> : null}
        </>
      }
    >
      <RadioLineDetails link={link} />
    </RadioLineRow>
  );
}
