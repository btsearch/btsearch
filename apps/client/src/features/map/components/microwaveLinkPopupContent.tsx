import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MicrowaveLink } from "@openbts/shared/contract";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { useMapLookups } from "../data/mapLookups";
import type { DuplexMicrowaveLink, MicrowaveLinkLookups } from "../utils";
import {
  buildMicrowaveLinkShareUrl,
  calculateDistance,
  calculateLinkDirectionalSpeeds,
  calculateMicrowaveLinkSpeed,
  formatBandwidth,
  formatDistance,
  formatFrequency,
  formatSpeed,
  getLinkTypeStyle,
  getMicrowaveLinkLook,
} from "../utils";
import { DirectionalSpeedBadge } from "./directionalSpeedBadge";
import { PopupAddToListButton, PopupExpiredLabel, PopupOperatorName, PopupRow, PopupShareButton } from "./popupParts";
import { CloseButton } from "@/components/ui/close-button";
import { normalizeOperatorName } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

function pairDirections(link: DuplexMicrowaveLink): MicrowaveLink[][] {
  if (link.linkType === "XPIC" || link.directions.length <= 2) return [link.directions];
  const pairs: MicrowaveLink[][] = [];
  for (let index = 0; index < link.directions.length; index += 2) pairs.push(link.directions.slice(index, index + 2));
  return pairs;
}

function MicrowaveLinkTitle({ link }: { link: DuplexMicrowaveLink }) {
  const { t } = useTranslation("main");
  const first = link.directions[0];

  return (
    <>
      <PopupOperatorName name={normalizeOperatorName(first.licensee?.name ?? t("unknownOperator"))} />
      {first.permit.number ? <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{first.permit.number}</span> : null}
      {link.isExpired ? <PopupExpiredLabel /> : null}
    </>
  );
}

function DirectionSpeed({ direction }: { direction: MicrowaveLink }) {
  const speed =
    direction.channelWidthMhz && direction.modulation ? calculateMicrowaveLinkSpeed(direction.channelWidthMhz, direction.modulation) : null;
  if (speed !== null) return <span className="font-mono text-[10px] font-semibold text-emerald-600">{formatSpeed(speed)}</span>;
  if (direction.capacity) {
    return <span className="font-mono text-[10px] font-medium text-muted-foreground">{formatBandwidth(direction.capacity)}</span>;
  }
  return null;
}

export function MicrowaveLinkDetails({ link }: { link: DuplexMicrowaveLink }) {
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
                  <span className="font-mono text-[10px] font-semibold text-foreground/80">{formatFrequency(direction.frequencyMhz)}</span>
                  {direction.polarization ? <span className="text-[10px] font-bold text-muted-foreground">{direction.polarization}</span> : null}
                  <DirectionSpeed direction={direction} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

type MicrowaveLinkRowProps = Omit<ComponentProps<typeof PopupRow>, "brand" | "color" | "title"> & {
  link: DuplexMicrowaveLink;
  lookups: MicrowaveLinkLookups | undefined;
};

export function MicrowaveLinkRow({ link, lookups, ...rowProps }: MicrowaveLinkRowProps) {
  const { brand, color } = getMicrowaveLinkLook(link, lookups);

  return <PopupRow brand={brand} color={color} title={<MicrowaveLinkTitle link={link} />} {...rowProps} />;
}

type MicrowaveLinkPopupContentProps = {
  link: DuplexMicrowaveLink;
  showAddToList?: boolean;
  onOpenDetails: (link: DuplexMicrowaveLink) => void;
  onClose?: () => void;
};

export function MicrowaveLinkPopupContent({ link, showAddToList = false, onOpenDetails, onClose }: MicrowaveLinkPopupContentProps) {
  const { t } = useTranslation("main");
  const { lookups } = useMapLookups();
  const first = link.directions[0];
  const actionCount = (showAddToList ? 1 : 0) + 1 + (onClose ? 1 : 0);

  return (
    <MicrowaveLinkRow
      link={link}
      lookups={lookups}
      onOpen={() => onOpenDetails(link)}
      actionCount={actionCount}
      actions={
        <>
          {showAddToList ? <PopupAddToListButton microwaveLinkIds={link.directions.map((direction) => direction.id)} /> : null}
          <PopupShareButton
            url={buildMicrowaveLinkShareUrl(link)}
            title={`${first.licensee?.name ?? ""} - ${formatFrequency(first.frequencyMhz)}`}
            label={t("popup.shareRadioline")}
          />
          {onClose ? <CloseButton size="xs" onClick={onClose} /> : null}
        </>
      }
    >
      <MicrowaveLinkDetails link={link} />
    </MicrowaveLinkRow>
  );
}
