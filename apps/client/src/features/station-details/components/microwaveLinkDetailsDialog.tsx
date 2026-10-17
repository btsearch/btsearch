import {
  Activity01Icon,
  Alert02Icon,
  ArrowRight02Icon,
  Building02Icon,
  Calendar03Icon,
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

import { getPermitKindLook } from "../officialPermits";
import { CopyButton } from "./copyButton";
import { DialogOperatorName } from "./dialogOperatorName";
import { OfficialSourceCredit } from "./officialSourceCredit";
import { ShareButton } from "./shareButton";
import { StationDialogActionBar, stationDialogInlineActionClassName, stationDialogInlineActionLabelClassName } from "./stationDialogActionBar";
import { stationDialogHeaderIconActionClassName } from "./stationDialogHeaderStyles";
import { StationInfoItem } from "./stationInfoItem";
import { Badge } from "@/components/ui/badge";
import { CloseButton } from "@/components/ui/close-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FloatingDialogPanelFrameProps } from "@/features/floating-dialogs/types";
import { AddToListPopover } from "@/features/lists/components/addToListPopover";
import { DirectionalSpeedBadge } from "@/features/map/components/directionalSpeedBadge";
import { useMapLookups } from "@/features/map/data/mapLookups";
import type { DuplexMicrowaveLink } from "@/features/map/utils";
import {
  buildMicrowaveLinkShareUrl,
  calculateDistance,
  calculateLinkDirectionalSpeeds,
  calculateMicrowaveLinkSpeed,
  formatBandwidth,
  formatDistance,
  formatFrequency,
  formatSpeed,
  getLicenseeBrand,
  getLinkTypeStyle,
} from "@/features/map/utils";
import { useOfficialSource } from "@/features/official/queries";
import { getBrandColor } from "@/features/station-details/station/utils/brands";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";
import { getOperatorHeaderTintGradient, normalizeOperatorName } from "@/lib/cellular/operators";
import { isPermitExpired } from "@/lib/dateUtils";
import { formatCoordinates } from "@/lib/geo/coordinates";
import { cn } from "@/lib/utils";

type MicrowaveLinkDetailsDialogPanelProps = FloatingDialogPanelFrameProps & {
  link: DuplexMicrowaveLink;
};

function DirectionButtonsRow({
  link,
  selectedDirIndex,
  onSelectDir,
  formatFrequency,
}: {
  link: DuplexMicrowaveLink;
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
                <span className="font-mono">{formatFrequency(dir.frequencyMhz)}</span>
                {dir.polarization && <span className="text-[10px] font-bold text-muted-foreground">{dir.polarization}</span>}
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

const specsBadgeTriggerClassName = "rounded-4xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function SpecsStatusBadge({ specsAsOf, sourceName }: { specsAsOf: string | null; sourceName: string }) {
  const { t, i18n } = useTranslation("main");

  if (specsAsOf === null) {
    return (
      <Tooltip>
        <TooltipTrigger className={specsBadgeTriggerClassName}>
          <Badge variant="secondary" className="cursor-help bg-amber-500/10 text-[11px] text-amber-800 dark:text-amber-400">
            <HugeiconsIcon icon={Alert02Icon} />
            {t("radiolines.specsMissing")}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{t("radiolines.specsMissingTooltip", { source: sourceName })}</TooltipContent>
      </Tooltip>
    );
  }

  const date = new Date(specsAsOf).toLocaleDateString(i18n.language);
  return (
    <Tooltip>
      <TooltipTrigger className={specsBadgeTriggerClassName}>
        <Badge variant="outline" className="cursor-help text-[11px] text-muted-foreground">
          <HugeiconsIcon icon={Calendar03Icon} />
          {t("radiolines.specsAsOf", { date })}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t("radiolines.specsAsOfTooltip", { date, source: sourceName })}</TooltipContent>
    </Tooltip>
  );
}

export function MicrowaveLinkDetailsDialogPanel({
  link,
  onClose,
  className,
  contentClassName,
  contentRef,
  bodyRef,
  bodyContentRef,
  style,
  headerDragProps,
}: MicrowaveLinkDetailsDialogPanelProps) {
  const { t, i18n } = useTranslation(["main", "stationDetails", "common"]);
  const { preferences } = usePreferences();
  const { data: settings } = useSettings();
  const { data: session } = authClient.useSession();
  const { lookups } = useMapLookups();
  const [selectedDirIndex, setSelectedDirIndex] = useState(0);

  const effectiveDirIndex = Math.min(selectedDirIndex, Math.max(link.directions.length - 1, 0));
  const direction = link.directions[effectiveDirIndex] ?? link.directions[0];
  const source = useOfficialSource(direction.sourceKey);
  const sourceName = source?.shortName ?? t("common:labels.register");
  const operatorBrand = getLicenseeBrand(direction.licensee, lookups);
  const operatorColor = getBrandColor(operatorBrand);
  const operatorName = direction.licensee?.name ? normalizeOperatorName(direction.licensee.name) : t("unknownOperator");
  const linkTypeStyle = getLinkTypeStyle(link.linkType);

  const distance = calculateDistance(link.a.latitude, link.a.longitude, link.b.latitude, link.b.longitude);
  const { dl: dlSpeed, ul: ulSpeed } = calculateLinkDirectionalSpeeds(link);
  const dirSpeed =
    direction.channelWidthMhz && direction.modulation ? calculateMicrowaveLinkSpeed(direction.channelWidthMhz, direction.modulation) : null;
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
            className="relative flex items-start gap-3 px-4 py-3 sm:px-6 sm:py-3.5"
            style={{ backgroundImage: getOperatorHeaderTintGradient(operatorColor) }}
          >
            <div className="min-w-0 flex-1">
              <div className="min-w-0 space-y-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pr-20 sm:pr-0">
                  <DialogOperatorName name={operatorName} brand={operatorBrand} />
                  {linkTypeStyle ? <span className={cn("shrink-0 text-xs font-semibold", linkTypeStyle.text)}>{link.linkType}</span> : null}
                  {link.isExpired ? <HugeiconsIcon icon={Alert02Icon} className="size-3.5 shrink-0 text-destructive" /> : null}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{formatDistance(distance)}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="font-mono font-medium text-foreground">{formatFrequency(direction.frequencyMhz)}</span>
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
                {session?.user && settings?.features.lists ? (
                  <StationDialogActionBar>
                    <AddToListPopover
                      microwaveLinkIds={link.directions.map((direction) => direction.id)}
                      size="md"
                      className={stationDialogInlineActionClassName}
                      showLabel
                      labelClassName={stationDialogInlineActionLabelClassName}
                      showTooltip={false}
                    />
                  </StationDialogActionBar>
                ) : null}
              </div>
            </div>
            <div className="absolute top-2 right-2 flex shrink-0 items-center gap-0.5 sm:static sm:-mt-1 sm:-mr-2">
              <ShareButton
                title={`${operatorName} - ${formatDistance(distance)} - ${formatFrequency(direction.frequencyMhz)}`}
                text={`${operatorName} ${formatDistance(distance)} - ${formatFrequency(direction.frequencyMhz)}`}
                url={buildMicrowaveLinkShareUrl(link)}
                size="md"
                className={stationDialogHeaderIconActionClassName}
              />
              <CloseButton onClick={onClose} onPointerDown={(event) => event.stopPropagation()} />
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
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("radiolines.linkParams")}</h3>
                <SpecsStatusBadge specsAsOf={direction.specsAsOf} sourceName={sourceName} />
              </div>
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <StationInfoItem icon={<HugeiconsIcon icon={Radio01Icon} className="size-4" />} label={t("radiolines.frequency")}>
                  <span className="min-w-0 wrap-break-word font-mono">
                    {`${direction.frequencyMhz} MHz (${formatFrequency(direction.frequencyMhz)})`}
                  </span>
                </StationInfoItem>
                {direction.channelNumber !== null ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={HashtagIcon} className="size-4" />} label={t("radiolines.chNum")}>
                    <span className="min-w-0 wrap-break-word font-mono">{direction.channelNumber}</span>
                  </StationInfoItem>
                ) : null}
                {direction.channelWidthMhz !== null ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={HorizontalResizeIcon} className="size-4" />} label={t("radiolines.channelWidth")}>
                    <span className="min-w-0 wrap-break-word font-mono">{`${direction.channelWidthMhz} MHz`}</span>
                  </StationInfoItem>
                ) : null}
                {direction.polarization ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={Rotate01Icon} className="size-4" />} label={t("radiolines.polarization")}>
                    <span className="min-w-0 wrap-break-word">{direction.polarization}</span>
                  </StationInfoItem>
                ) : null}
                {direction.modulation ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={Activity01Icon} className="size-4" />} label={t("radiolines.modulation")}>
                    <span className="min-w-0 wrap-break-word">{direction.modulation}</span>
                  </StationInfoItem>
                ) : null}
                {dirSpeed !== null ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={DashboardSpeed01Icon} className="size-4" />} label={t("radiolines.dataRate")}>
                    <span className="min-w-0 wrap-break-word font-mono">{formatSpeed(dirSpeed)}</span>
                  </StationInfoItem>
                ) : direction.capacity !== null ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={DashboardSpeed01Icon} className="size-4" />} label={t("radiolines.bandwidth")}>
                    <span className="min-w-0 wrap-break-word">{formatBandwidth(direction.capacity)}</span>
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
                        {formatCoordinates(direction.tx.latitude, direction.tx.longitude, preferences.gpsFormat)}
                      </span>
                      <CopyButton text={`${direction.tx.latitude}, ${direction.tx.longitude}`} />
                    </StationInfoItem>
                    {direction.tx.groundHeightMeters !== null ? (
                      <StationInfoItem icon={<HugeiconsIcon icon={RulerIcon} className="size-4" />} label={t("common:labels.height")}>
                        <span className="min-w-0 wrap-break-word">{`${direction.tx.groundHeightMeters} m`}</span>
                      </StationInfoItem>
                    ) : null}
                    {direction.tx.antenna?.name && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Satellite01Icon} className="size-4" />} label={t("radiolines.antennaType")}>
                        <span className="min-w-0 wrap-break-word">{direction.tx.antenna.name}</span>
                      </StationInfoItem>
                    )}
                    {direction.tx.antennaGainDbi !== null ? (
                      <StationInfoItem icon={<HugeiconsIcon icon={SignalFull02Icon} className="size-4" />} label={t("radiolines.antennaGain")}>
                        <span className="min-w-0 wrap-break-word font-mono">{`${direction.tx.antennaGainDbi} dBi`}</span>
                      </StationInfoItem>
                    ) : null}
                    {direction.tx.antennaHeightMeters !== null ? (
                      <StationInfoItem icon={<HugeiconsIcon icon={RulerIcon} className="size-4" />} label={t("common:labels.antennaHeight")}>
                        <span className="min-w-0 wrap-break-word font-mono">{`${direction.tx.antennaHeightMeters} m`}</span>
                      </StationInfoItem>
                    ) : null}
                    {direction.tx.eirpDbm !== null ? (
                      <StationInfoItem icon={<HugeiconsIcon icon={FlashIcon} className="size-4" />} label="EIRP">
                        <span className="min-w-0 wrap-break-word font-mono">{`${direction.tx.eirpDbm} dBm`}</span>
                      </StationInfoItem>
                    ) : null}
                    {direction.tx.transmitter?.name && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Satellite01Icon} className="size-4" />} label={t("radiolines.transmitterType")}>
                        <span className="min-w-0 wrap-break-word">{direction.tx.transmitter.name}</span>
                      </StationInfoItem>
                    )}
                    {direction.tx.transmitter?.manufacturer?.name && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Building02Icon} className="size-4" />} label={t("radiolines.manufacturer")}>
                        <span className="min-w-0 wrap-break-word">{direction.tx.transmitter.manufacturer.name}</span>
                      </StationInfoItem>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/60 pt-4 sm:border-t-0 sm:pt-0 sm:pl-6">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">{t("radiolines.rxSide")}</h3>
                  <div className="grid gap-y-3">
                    <StationInfoItem icon={<HugeiconsIcon icon={Location01Icon} className="size-4" />} label={t("common:labels.coordinates")}>
                      <span className="break-all font-mono">
                        {formatCoordinates(direction.rx.latitude, direction.rx.longitude, preferences.gpsFormat)}
                      </span>
                      <CopyButton text={`${direction.rx.latitude}, ${direction.rx.longitude}`} />
                    </StationInfoItem>
                    {direction.rx.groundHeightMeters !== null ? (
                      <StationInfoItem icon={<HugeiconsIcon icon={RulerIcon} className="size-4" />} label={t("common:labels.height")}>
                        <span className="min-w-0 wrap-break-word">{`${direction.rx.groundHeightMeters} m`}</span>
                      </StationInfoItem>
                    ) : null}
                    {direction.rx.antenna?.name && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Satellite01Icon} className="size-4" />} label={t("radiolines.receiverType")}>
                        <span className="min-w-0 wrap-break-word">{direction.rx.antenna.name}</span>
                      </StationInfoItem>
                    )}
                    {direction.rx.antennaGainDbi !== null ? (
                      <StationInfoItem icon={<HugeiconsIcon icon={SignalFull02Icon} className="size-4" />} label={t("radiolines.antennaGain")}>
                        <span className="min-w-0 wrap-break-word font-mono">{`${direction.rx.antennaGainDbi} dBi`}</span>
                      </StationInfoItem>
                    ) : null}
                    {direction.rx.antennaHeightMeters !== null ? (
                      <StationInfoItem icon={<HugeiconsIcon icon={RulerIcon} className="size-4" />} label={t("common:labels.antennaHeight")}>
                        <span className="min-w-0 wrap-break-word font-mono">{`${direction.rx.antennaHeightMeters} m`}</span>
                      </StationInfoItem>
                    ) : null}
                    {direction.rx.noiseFigureDb !== null ? (
                      <StationInfoItem icon={<HugeiconsIcon icon={Activity01Icon} className="size-4" />} label={t("radiolines.noiseFigure")}>
                        <span className="min-w-0 wrap-break-word font-mono">{`${direction.rx.noiseFigureDb} dB`}</span>
                      </StationInfoItem>
                    ) : null}
                    {direction.rx.antenna?.manufacturer?.name && (
                      <StationInfoItem icon={<HugeiconsIcon icon={Building02Icon} className="size-4" />} label={t("radiolines.manufacturer")}>
                        <span className="min-w-0 wrap-break-word">{direction.rx.antenna.manufacturer.name}</span>
                      </StationInfoItem>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-8 border-t border-border/60 pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("stationDetails:permits.permit")}</h3>
                <OfficialSourceCredit sourceKey={direction.sourceKey} source={source} />
              </div>
              <div className="overflow-hidden rounded-xl border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-lg text-sm sm:min-w-0">
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
                        const expiresOn = dir.permit.expiresOn;
                        const dirExpired = expiresOn !== null && isPermitExpired(expiresOn);
                        const kind = getPermitKindLook(dir.permit.kind);
                        return (
                          <tr key={dir.id} className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-2.5 sm:px-4">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <span className="font-mono text-xs">{dir.permit.number || "-"}</span>
                                {kind && (
                                  <Tooltip>
                                    <TooltipTrigger className="font-mono text-[10px] text-muted-foreground cursor-help">[{kind.code}]</TooltipTrigger>
                                    <TooltipContent>{t(kind.labelKey)}</TooltipContent>
                                  </Tooltip>
                                )}
                                <span className="font-mono text-[11px] text-muted-foreground">{formatFrequency(dir.frequencyMhz)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 sm:px-4">
                              {dirExpired ? (
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <HugeiconsIcon icon={Calendar03Icon} className="size-3.5 text-destructive" />
                                  <span className="text-destructive font-medium">{new Date(expiresOn).toLocaleDateString(i18n.language)}</span>
                                  <span className="text-[11px] font-bold uppercase text-destructive">{t("common:status.expired")}</span>
                                </div>
                              ) : (
                                <span>
                                  {expiresOn === null
                                    ? t("stationDetails:permits.neverExpires")
                                    : new Date(expiresOn).toLocaleDateString(i18n.language)}
                                </span>
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
