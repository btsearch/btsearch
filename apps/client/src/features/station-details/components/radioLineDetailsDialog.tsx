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
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { usePreferences } from "@/hooks/usePreferences";
import { isPermitExpired } from "@/lib/dateUtils";
import { formatCoordinates } from "@/lib/gpsUtils";
import { getOperatorColor, normalizeOperatorName, resolveOperatorMnc } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copyButton";
import { ShareButton } from "./shareButton";

type RadioLineDetailsDialogProps = {
  link: DuplexRadioLink;
  onClose: () => void;
};

function InfoRow({ icon, label, value, mono }: { icon?: typeof Cancel01Icon; label: string; value?: string | number | null; mono?: boolean }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-center gap-2">
      {icon && <HugeiconsIcon icon={icon} className="size-3.5 text-muted-foreground shrink-0" />}
      <span className="text-xs text-muted-foreground shrink-0">{label}:</span>
      <span className={cn("text-sm font-medium", mono && "font-mono")}>{value}</span>
    </div>
  );
}

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
    <div className="px-6 pt-4 flex items-center gap-3">
      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg overflow-x-auto max-w-full custom-scrollbar">
        {link.directions.map((dir, idx) => {
          const isForward = `${dir.tx.latitude},${dir.tx.longitude}` === aKey;
          const isLastInPair = link.linkType !== "XPIC" && link.directions.length > 1 && idx % 2 === 1;
          const isLastDirection = idx === link.directions.length - 1;
          return (
            <div key={dir.id} className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5",
                  selectedDirIndex === idx ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onSelectDir(idx)}
              >
                <span className="flex items-center gap-px text-[10px] font-bold text-muted-foreground">
                  {isForward ? "A" : "B"}
                  <HugeiconsIcon icon={ArrowRight02Icon} className="size-2.5" />
                  {isForward ? "B" : "A"}
                </span>
                <span className="font-mono">{formatFrequency(dir.link.freq)}</span>
                {dir.link.polarization && <span className="text-[10px] font-bold text-muted-foreground">{dir.link.polarization}</span>}
                <span className="text-[10px] text-muted-foreground">#{dir.id}</span>
              </button>
              {isLastInPair && !isLastDirection && <span className="w-px h-5 bg-border shrink-0" aria-hidden />}
            </div>
          );
        })}
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
        {selectedDirIndex + 1} / {link.directions.length}
      </span>
    </div>
  );
}

export function RadioLineDetailsDialog({ link, onClose }: RadioLineDetailsDialogProps) {
  const { t, i18n } = useTranslation(["main", "stationDetails", "common"]);
  const { preferences } = usePreferences();
  const [selectedDirIndex, setSelectedDirIndex] = useState(0);

  useEscapeKey(onClose, true);

  const radioLine = link.directions[selectedDirIndex] ?? link.directions[0];
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
        aria-label={t("common:actions.close")}
      />

      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-3xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="shrink-0 bg-background/95 backdrop-blur-sm border-b">
          <div className="h-1" style={{ backgroundColor: operatorColor }} />
          <div className="px-6 py-4 flex items-start">
            <div className="flex-1 min-w-0">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-lg font-bold tracking-tight truncate" style={{ color: operatorColor }}>
                    {operatorName}
                  </h2>
                  {linkTypeStyle ? <span className={cn("text-[10px] font-bold uppercase", linkTypeStyle.text)}>{link.linkType}</span> : null}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground/90">{formatDistance(distance)}</span>
                  <span>·</span>
                  <span className="font-medium text-foreground/90">{formatFrequency(radioLine.link.freq)}</span>
                  {(link.linkType === "FDD" || link.linkType === "2+0 FDD" || link.linkType === "XPIC" || link.linkType === "SD") &&
                    link.directions.length > 1 && <span className="text-xs">+{link.directions.length - 1}</span>}
                  {dlSpeed !== null || ulSpeed !== null ? (
                    <>
                      <span>·</span>
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
            <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2">
              <ShareButton
                title={`${operatorName} - ${formatFrequency(radioLine.link.freq)}`}
                text={`${operatorName} ${formatDistance(distance)} - ${formatFrequency(radioLine.link.freq)}`}
                url={buildRadiolineShareUrl(link)}
                size="md"
              />
              <button type="button" onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors">
                <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {link.directions.length > 1 && (
            <DirectionButtonsRow
              link={link}
              selectedDirIndex={selectedDirIndex}
              onSelectDir={setSelectedDirIndex}
              formatFrequency={formatFrequency}
            />
          )}

          <div className="px-6 pt-5 pb-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{t("radiolines.linkParams")}</h3>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <InfoRow
                  icon={Radio01Icon}
                  label={t("radiolines.frequency")}
                  value={`${radioLine.link.freq} MHz (${formatFrequency(radioLine.link.freq)})`}
                  mono
                />
                {radioLine.link.ch_num !== null && radioLine.link.ch_num !== undefined ? (
                  <InfoRow icon={HashtagIcon} label={t("radiolines.chNum")} value={String(radioLine.link.ch_num)} mono />
                ) : null}
                {radioLine.link.ch_width !== null && radioLine.link.ch_width !== undefined ? (
                  <InfoRow icon={HorizontalResizeIcon} label={t("radiolines.channelWidth")} value={`${radioLine.link.ch_width} MHz`} mono />
                ) : null}
                {radioLine.link.polarization ? (
                  <InfoRow icon={Rotate01Icon} label={t("radiolines.polarization")} value={radioLine.link.polarization} />
                ) : null}
                {radioLine.link.modulation_type ? (
                  <InfoRow icon={Activity01Icon} label={t("radiolines.modulation")} value={radioLine.link.modulation_type} />
                ) : null}
                {dirSpeed !== null && dirSpeed !== undefined ? (
                  <InfoRow icon={DashboardSpeed01Icon} label={t("radiolines.dataRate")} value={formatSpeed(dirSpeed)} mono />
                ) : radioLine.link.bandwidth !== null && radioLine.link.bandwidth !== undefined ? (
                  <InfoRow icon={DashboardSpeed01Icon} label={t("radiolines.bandwidth")} value={formatBandwidth(radioLine.link.bandwidth)} />
                ) : null}
              </div>
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{t("radiolines.txSide")}</h3>
                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={Location01Icon} className="size-4 text-muted-foreground shrink-0" />
                    <span className="font-mono text-sm font-medium">
                      {formatCoordinates(radioLine.tx.latitude, radioLine.tx.longitude, preferences.gpsFormat)}
                    </span>
                    <CopyButton text={`${radioLine.tx.latitude}, ${radioLine.tx.longitude}`} />
                  </div>
                  <div className="space-y-1.5">
                    <InfoRow icon={RulerIcon} label={t("radiolines.height")} value={`${radioLine.tx.height} m`} />
                    {radioLine.tx.antenna?.type?.name && (
                      <InfoRow icon={Satellite01Icon} label={t("radiolines.antennaType")} value={radioLine.tx.antenna.type.name} />
                    )}
                    {radioLine.tx.antenna?.gain && (
                      <InfoRow icon={SignalFull02Icon} label={t("radiolines.antennaGain")} value={`${radioLine.tx.antenna.gain} dBi`} mono />
                    )}
                    {radioLine.tx.antenna?.height && (
                      <InfoRow icon={RulerIcon} label={t("radiolines.antennaHeight")} value={`${radioLine.tx.antenna.height} m`} mono />
                    )}
                    {radioLine.tx.eirp && <InfoRow icon={FlashIcon} label={t("radiolines.eirp")} value={`${radioLine.tx.eirp} dBW`} mono />}
                    {radioLine.tx.transmitter?.type?.name && (
                      <InfoRow icon={Satellite01Icon} label={t("radiolines.transmitterType")} value={radioLine.tx.transmitter.type.name} />
                    )}
                    {radioLine.tx.transmitter?.type?.manufacturer?.name && (
                      <InfoRow icon={Building02Icon} label={t("radiolines.manufacturer")} value={radioLine.tx.transmitter.type.manufacturer.name} />
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{t("radiolines.rxSide")}</h3>
                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={Location01Icon} className="size-4 text-muted-foreground shrink-0" />
                    <span className="font-mono text-sm font-medium">
                      {formatCoordinates(radioLine.rx.latitude, radioLine.rx.longitude, preferences.gpsFormat)}
                    </span>
                    <CopyButton text={`${radioLine.rx.latitude}, ${radioLine.rx.longitude}`} />
                  </div>
                  <div className="space-y-1.5">
                    <InfoRow icon={RulerIcon} label={t("radiolines.height")} value={`${radioLine.rx.height} m`} />
                    {radioLine.rx.type?.name && (
                      <InfoRow icon={Satellite01Icon} label={t("radiolines.receiverType")} value={radioLine.rx.type.name} />
                    )}
                    {radioLine.rx.gain !== null && (
                      <InfoRow icon={SignalFull02Icon} label={t("radiolines.antennaGain")} value={`${radioLine.rx.gain} dBi`} mono />
                    )}
                    {radioLine.rx.height_antenna !== null && (
                      <InfoRow icon={RulerIcon} label={t("radiolines.antennaHeight")} value={`${radioLine.rx.height_antenna} m`} mono />
                    )}
                    {radioLine.rx.noise_figure !== null && (
                      <InfoRow icon={Activity01Icon} label={t("radiolines.noiseFigure")} value={`${radioLine.rx.noise_figure} dB`} mono />
                    )}
                    {radioLine.rx.type?.manufacturer?.name && (
                      <InfoRow icon={Building02Icon} label={t("radiolines.manufacturer")} value={radioLine.rx.type.manufacturer.name} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 pb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("stationDetails:permits.permit")}</h3>
              <Tooltip>
                <TooltipTrigger className="text-[10px] font-semibold text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-help tracking-widest uppercase">
                  UKE
                </TooltipTrigger>
                <TooltipContent>{t("stationDetails:permits.sourceUke")}</TooltipContent>
              </Tooltip>
            </div>
            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/10">
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {t("stationDetails:permits.decisionNumber")}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {t("stationDetails:permits.expiryDate")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {link.directions.map((dir) => {
                      const dirExpired = dir.permit.expiry_date ? isPermitExpired(dir.permit.expiry_date) : false;
                      return (
                        <tr key={dir.id} className="hover:bg-muted/20 transition-colors border-b last:border-b-0">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
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
                              <span className="text-[11px] text-muted-foreground font-mono">{formatFrequency(dir.link.freq)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            {dirExpired ? (
                              <div className="flex items-center gap-2">
                                <HugeiconsIcon icon={Calendar03Icon} className="size-3.5 text-destructive" />
                                <span className="text-destructive font-medium">
                                  {new Date(dir.permit.expiry_date).toLocaleDateString(i18n.language)}
                                </span>
                                <span className="text-destructive text-[11px] font-bold uppercase">{t("common:status.expired")}</span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
