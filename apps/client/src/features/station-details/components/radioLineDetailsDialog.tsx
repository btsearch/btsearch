import {
  Activity01Icon,
  ArrowRight02Icon,
  Building02Icon,
  Calendar03Icon,
  Cancel01Icon,
  DashboardSpeed01Icon,
  FlashIcon,
  HashtagIcon,
  HorizontalResizeIcon,
  Location01Icon,
  Radio01Icon,
  Rotate01Icon,
  RulerIcon,
  Satellite01Icon,
  SignalFull02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AddToListPopover } from "@/features/lists/components/addToListPopover";
import { DirectionalSpeedBadge } from "@/features/map/components/directionalSpeedBadge";
import type { DuplexRadioLink } from "@/features/map/utils";
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
} from "@/features/map/utils";
import { usePreferences } from "@/hooks/usePreferences";
import { isPermitExpired } from "@/lib/dateUtils";
import { formatCoordinates } from "@/lib/gpsUtils";
import { getOperatorColor, normalizeOperatorName, resolveOperatorMnc } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copyButton";
import type { FloatingDialogPanelFrameProps } from "./floatingDialogStackTypes";
import { ShareButton } from "./shareButton";
import { stationDialogHeaderIconActionClassName } from "./stationDialogHeaderStyles";
import { StationInfoItem } from "./stationInfoItem";

type RadioLineDetailsDialogPanelProps = FloatingDialogPanelFrameProps & {
  link: DuplexRadioLink;
};

function DirectionButtonsRow({
  link,
  selectedDirIndex,
  onSelectDir,
  formatFrequency,
}: {
  link: DuplexRadioLink;
  selectedDirIndex: number;
  onSelectDir: (idx: number) => void;
  formatFrequency: (freq: number) => string;
}) {
  const aKey = `${link.a.latitude},${link.a.longitude}`;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex max-w-full min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-muted/60 p-1 ring-1 ring-inset ring-border/50 custom-scrollbar">
        {link.directions.map((dir, idx) => {
          const isForward = `${dir.tx.latitude},${dir.tx.longitude}` === aKey;
          const isLastInPair = link.linkType !== "XPIC" && link.directions.length > 1 && idx % 2 === 1;
          const isLastDirection = idx === link.directions.length - 1;
          return (
            <div key={dir.id} className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                  selectedDirIndex === idx
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
                )}
                onClick={() => onSelectDir(idx)}
              >
                <span className="flex translate-y-px items-center gap-px text-[10px] font-bold text-muted-foreground">
                  {isForward ? "A" : "B"}
                  <HugeiconsIcon icon={ArrowRight02Icon} className="size-2.5 -translate-y-px" />
                  {isForward ? "B" : "A"}
                </span>
                <span className="font-mono">{formatFrequency(dir.link.freq)}</span>
                {dir.link.polarization && <span className="text-[10px] font-bold text-muted-foreground">{dir.link.polarization}</span>}
                <span className="text-[10px] text-muted-foreground">#{dir.id}</span>
              </button>
              {isLastInPair && !isLastDirection && <span className="h-4 w-px shrink-0 bg-border" aria-hidden />}
            </div>
          );
        })}
      </div>
      <span className="shrink-0 whitespace-nowrap text-[10px] font-medium tabular-nums text-muted-foreground">
        {selectedDirIndex + 1} / {link.directions.length}
      </span>
    </div>
  );
}

export function RadioLineDetailsDialogPanel({
  link,
  onClose,
  className,
  contentClassName,
  contentRef,
  bodyRef,
  bodyContentRef,
  style,
  headerDragProps,
}: RadioLineDetailsDialogPanelProps) {
  const { t, i18n } = useTranslation(["main", "stationDetails", "common"]);
  const { preferences } = usePreferences();
  const [selectedDirIndex, setSelectedDirIndex] = useState(0);

  const effectiveDirIndex = Math.min(selectedDirIndex, Math.max(link.directions.length - 1, 0));
  const radioLine = link.directions[effectiveDirIndex] ?? link.directions[0];
  const mnc = resolveOperatorMnc(radioLine.operator?.mnc, radioLine.operator?.name);
  const operatorColor = mnc ? getOperatorColor(mnc) : "#3b82f6";
  const operatorName = radioLine.operator?.name ? normalizeOperatorName(radioLine.operator.name) : t("unknownOperator");
  const linkTypeStyle = getLinkTypeStyle(link.linkType);

  const distance = calculateDistance(link.a.latitude, link.a.longitude, link.b.latitude, link.b.longitude);
  const { dl: dlSpeed, ul: ulSpeed } = calculateLinkDirectionalSpeeds(link);
  const dirSpeed =
    radioLine.link.ch_width && radioLine.link.modulation_type
      ? calculateRadiolineSpeed(radioLine.link.ch_width, radioLine.link.modulation_type)
      : null;
  const headerDragClassName = headerDragProps?.className;

  return (
    <div className={cn("relative", className)} style={style}>
      <div
        ref={contentRef}
        className={cn(
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl bg-background shadow-2xl",
          contentClassName,
        )}
      >
        <div {...headerDragProps} className={cn("shrink-0 bg-background/95 backdrop-blur-sm border-b", headerDragClassName)}>
          <div
            className="flex items-start gap-3 px-4 py-3 sm:px-6 sm:py-3.5"
            style={{ backgroundImage: `linear-gradient(115deg, ${operatorColor}24 0%, ${operatorColor}0f 34%, transparent 70%)` }}
          >
            <div className="min-w-0 flex-1">
              <div className="min-w-0 space-y-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <h2 className="min-w-0 truncate text-base font-semibold leading-5 tracking-tight" style={{ color: operatorColor }}>
                    {operatorName}
                  </h2>
                  {linkTypeStyle ? <span className={cn("shrink-0 text-xs font-semibold", linkTypeStyle.text)}>{link.linkType}</span> : null}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{formatDistance(distance)}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="font-mono font-medium text-foreground">{formatFrequency(radioLine.link.freq)}</span>
                  {(link.linkType === "FDD" || link.linkType === "2+0 FDD" || link.linkType === "XPIC" || link.linkType === "SD") &&
                    link.directions.length > 1 && <span>+{link.directions.length - 1}</span>}
                  {dlSpeed !== null || ulSpeed !== null ? (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <DirectionalSpeedBadge
                        dl={dlSpeed !== null ? formatSpeed(dlSpeed) : null}
                        ul={ulSpeed !== null ? formatSpeed(ulSpeed) : null}
                        iconSize="size-3"
                      />
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="-mt-1 -mr-2 flex shrink-0 items-center gap-0.5">
              <AddToListPopover
                radiolineIds={link.directions.map((direction) => direction.id)}
                size="md"
                className={stationDialogHeaderIconActionClassName}
              />
              <ShareButton
                title={`${operatorName} - ${formatFrequency(radioLine.link.freq)}`}
                text={`${operatorName} ${formatDistance(distance)} - ${formatFrequency(radioLine.link.freq)}`}
                url={buildRadiolineShareUrl(link)}
                size="md"
                className={stationDialogHeaderIconActionClassName}
              />
              <button
                type="button"
                onClick={onClose}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:pointer-events-none"
                aria-label={t("common:actions.close")}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-5 shrink-0" />
              </button>
            </div>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto custom-scrollbar scrollbar-gutter-stable">
          <div ref={bodyContentRef} className="px-3 py-4 sm:px-6 sm:py-5">
            {link.directions.length > 1 && (
              <DirectionButtonsRow
                link={link}
                selectedDirIndex={effectiveDirIndex}
                onSelectDir={setSelectedDirIndex}
                formatFrequency={formatFrequency}
              />
            )}

            <section className={cn(link.directions.length > 1 && "mt-7")}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("radiolines.linkParams")}</h3>
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <StationInfoItem icon={<HugeiconsIcon icon={Radio01Icon} className="size-4" />} label={t("radiolines.frequency")}>
                  <span className="min-w-0 break-words font-mono">{`${radioLine.link.freq} MHz (${formatFrequency(radioLine.link.freq)})`}</span>
                </StationInfoItem>
                {radioLine.link.ch_num !== null && radioLine.link.ch_num !== undefined ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={HashtagIcon} className="size-4" />} label={t("radiolines.chNum")}>
                    <span className="min-w-0 break-words font-mono">{radioLine.link.ch_num}</span>
                  </StationInfoItem>
                ) : null}
                {radioLine.link.ch_width !== null && radioLine.link.ch_width !== undefined ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={HorizontalResizeIcon} className="size-4" />} label={t("radiolines.channelWidth")}>
                    <span className="min-w-0 break-words font-mono">{`${radioLine.link.ch_width} MHz`}</span>
                  </StationInfoItem>
                ) : null}
                {radioLine.link.polarization ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={Rotate01Icon} className="size-4" />} label={t("radiolines.polarization")}>
                    <span className="min-w-0 break-words">{radioLine.link.polarization}</span>
                  </StationInfoItem>
                ) : null}
                {radioLine.link.modulation_type ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={Activity01Icon} className="size-4" />} label={t("radiolines.modulation")}>
                    <span className="min-w-0 break-words">{radioLine.link.modulation_type}</span>
                  </StationInfoItem>
                ) : null}
                {dirSpeed !== null && dirSpeed !== undefined ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={DashboardSpeed01Icon} className="size-4" />} label={t("radiolines.dataRate")}>
                    <span className="min-w-0 break-words font-mono">{formatSpeed(dirSpeed)}</span>
                  </StationInfoItem>
                ) : radioLine.link.bandwidth !== null && radioLine.link.bandwidth !== undefined ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={DashboardSpeed01Icon} className="size-4" />} label={t("radiolines.bandwidth")}>
                    <span className="min-w-0 break-words">{formatBandwidth(radioLine.link.bandwidth)}</span>
                  </StationInfoItem>
                ) : null}
              </div>
            </section>

            <section className="mt-8 border-t border-border/60 pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-border/60">
                <div className="pb-4 sm:pb-0 sm:pr-6">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">{t("radiolines.txSide")}</h3>
                  <div className="grid gap-y-3">
                    <StationInfoItem icon={<HugeiconsIcon icon={Location01Icon} className="size-4" />} label={t("common:labels.coordinates")}>
                      <span className="break-all font-mono">
                        {formatCoordinates(radioLine.tx.latitude, radioLine.tx.longitude, preferences.gpsFormat)}
                      </span>
                      <CopyButton text={`${radioLine.tx.latitude}, ${radioLine.tx.longitude}`} />
                    </StationInfoItem>
                    <StationInfoItem icon={<HugeiconsIcon icon={RulerIcon} className="size-4" />} label={t("radiolines.height")}>
                      <span className="min-w-0 break-words">{`${radioLine.tx.height} m`}</span>
                    </StationInfoItem>
                    {radioLine.tx.antenna?.type?.name && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Satellite01Icon} className="size-4" />} label={t("radiolines.antennaType")}>
                        <span className="min-w-0 break-words">{radioLine.tx.antenna.type.name}</span>
                      </StationInfoItem>
                    )}
                    {radioLine.tx.antenna?.gain && (
                      <StationInfoItem icon={<HugeiconsIcon icon={SignalFull02Icon} className="size-4" />} label={t("radiolines.antennaGain")}>
                        <span className="min-w-0 break-words font-mono">{`${radioLine.tx.antenna.gain} dBi`}</span>
                      </StationInfoItem>
                    )}
                    {radioLine.tx.antenna?.height && (
                      <StationInfoItem icon={<HugeiconsIcon icon={RulerIcon} className="size-4" />} label={t("radiolines.antennaHeight")}>
                        <span className="min-w-0 break-words font-mono">{`${radioLine.tx.antenna.height} m`}</span>
                      </StationInfoItem>
                    )}
                    {radioLine.tx.eirp && (
                      <StationInfoItem icon={<HugeiconsIcon icon={FlashIcon} className="size-4" />} label={t("radiolines.eirp")}>
                        <span className="min-w-0 break-words font-mono">{`${radioLine.tx.eirp} dBW`}</span>
                      </StationInfoItem>
                    )}
                    {radioLine.tx.transmitter?.type?.name && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Satellite01Icon} className="size-4" />} label={t("radiolines.transmitterType")}>
                        <span className="min-w-0 break-words">{radioLine.tx.transmitter.type.name}</span>
                      </StationInfoItem>
                    )}
                    {radioLine.tx.transmitter?.type?.manufacturer?.name && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Building02Icon} className="size-4" />} label={t("radiolines.manufacturer")}>
                        <span className="min-w-0 break-words">{radioLine.tx.transmitter.type.manufacturer.name}</span>
                      </StationInfoItem>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/60 pt-4 sm:border-t-0 sm:pt-0 sm:pl-6">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">{t("radiolines.rxSide")}</h3>
                  <div className="grid gap-y-3">
                    <StationInfoItem icon={<HugeiconsIcon icon={Location01Icon} className="size-4" />} label={t("common:labels.coordinates")}>
                      <span className="break-all font-mono">
                        {formatCoordinates(radioLine.rx.latitude, radioLine.rx.longitude, preferences.gpsFormat)}
                      </span>
                      <CopyButton text={`${radioLine.rx.latitude}, ${radioLine.rx.longitude}`} />
                    </StationInfoItem>
                    <StationInfoItem icon={<HugeiconsIcon icon={RulerIcon} className="size-4" />} label={t("radiolines.height")}>
                      <span className="min-w-0 break-words">{`${radioLine.rx.height} m`}</span>
                    </StationInfoItem>
                    {radioLine.rx.type?.name && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Satellite01Icon} className="size-4" />} label={t("radiolines.receiverType")}>
                        <span className="min-w-0 break-words">{radioLine.rx.type.name}</span>
                      </StationInfoItem>
                    )}
                    {radioLine.rx.gain !== null && (
                      <StationInfoItem icon={<HugeiconsIcon icon={SignalFull02Icon} className="size-4" />} label={t("radiolines.antennaGain")}>
                        <span className="min-w-0 break-words font-mono">{`${radioLine.rx.gain} dBi`}</span>
                      </StationInfoItem>
                    )}
                    {radioLine.rx.height_antenna !== null && (
                      <StationInfoItem icon={<HugeiconsIcon icon={RulerIcon} className="size-4" />} label={t("radiolines.antennaHeight")}>
                        <span className="min-w-0 break-words font-mono">{`${radioLine.rx.height_antenna} m`}</span>
                      </StationInfoItem>
                    )}
                    {radioLine.rx.noise_figure !== null && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Activity01Icon} className="size-4" />} label={t("radiolines.noiseFigure")}>
                        <span className="min-w-0 break-words font-mono">{`${radioLine.rx.noise_figure} dB`}</span>
                      </StationInfoItem>
                    )}
                    {radioLine.rx.type?.manufacturer?.name && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Building02Icon} className="size-4" />} label={t("radiolines.manufacturer")}>
                        <span className="min-w-0 break-words">{radioLine.rx.type.manufacturer.name}</span>
                      </StationInfoItem>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-8 border-t border-border/60 pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("stationDetails:permits.permit")}</h3>
                <Tooltip>
                  <TooltipTrigger className="cursor-help text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 transition-colors hover:text-muted-foreground">
                    UKE
                  </TooltipTrigger>
                  <TooltipContent>{t("stationDetails:permits.sourceUke")}</TooltipContent>
                </Tooltip>
              </div>
              <div className="overflow-hidden rounded-xl border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-sm sm:min-w-0">
                    <thead>
                      <tr className="border-b border-border/70 bg-muted/20">
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4">
                          {t("stationDetails:permits.decisionNumber")}
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4">
                          {t("stationDetails:permits.expiryDate")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {link.directions.map((dir) => {
                        const dirExpired = dir.permit.expiry_date ? isPermitExpired(dir.permit.expiry_date) : false;
                        return (
                          <tr key={dir.id} className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-2.5 sm:px-4">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <span className="font-mono text-xs">{dir.permit.number || "-"}</span>
                                {dir.permit.decision_type && (
                                  <Tooltip>
                                    <TooltipTrigger className="font-mono text-[10px] text-muted-foreground cursor-help">
                                      [{dir.permit.decision_type}]
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {dir.permit.decision_type === "zmP"
                                        ? t("stationDetails:permits.decisionTypeZmP")
                                        : t("stationDetails:permits.decisionTypeP")}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                <span className="font-mono text-[11px] text-muted-foreground">{formatFrequency(dir.link.freq)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 sm:px-4">
                              {dirExpired ? (
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <HugeiconsIcon icon={Calendar03Icon} className="size-3.5 text-destructive" />
                                  <span className="text-destructive font-medium">
                                    {new Date(dir.permit.expiry_date).toLocaleDateString(i18n.language)}
                                  </span>
                                  <span className="text-[11px] font-bold uppercase text-destructive">{t("common:status.expired")}</span>
                                </div>
                              ) : (
                                <span>{new Date(dir.permit.expiry_date).toLocaleDateString(i18n.language)}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
