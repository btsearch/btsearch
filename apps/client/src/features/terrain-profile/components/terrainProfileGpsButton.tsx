import { Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { TerrainProfilePanelModel } from "../hooks/useTerrainProfileController";
import type { TerrainProfileGpsError } from "../types";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TerrainProfileGpsButtonProps = {
  panel: TerrainProfilePanelModel;
  isIconOnly?: boolean;
  className?: string;
};

type TerrainProfileGpsNoticeProps = {
  gpsError: TerrainProfileGpsError | null;
  isReceiverPlaced: boolean;
  className?: string;
};

const GPS_ERROR_TEXT_KEYS: Record<TerrainProfileGpsError, string> = {
  unsupported: "receiver.gpsErrors.unsupported",
  permissionDenied: "receiver.gpsErrors.permissionDenied",
  unavailable: "receiver.gpsErrors.unavailable",
  timeout: "receiver.gpsErrors.timeout",
  unknown: "receiver.gpsErrors.unknown",
};

const PLACING_GPS_ERROR_TEXT_KEYS: Record<TerrainProfileGpsError, string> = {
  unsupported: "placing.gpsErrors.unsupported",
  permissionDenied: "placing.gpsErrors.permissionDenied",
  unavailable: "placing.gpsErrors.unavailable",
  timeout: "placing.gpsErrors.timeout",
  unknown: "placing.gpsErrors.unknown",
};

export function TerrainProfileGpsButton({ panel, isIconOnly = false, className }: TerrainProfileGpsButtonProps) {
  const { t } = useTranslation("terrainProfile");
  const { isLocating, locateReceiver } = panel;
  const label = isLocating ? t("receiver.locating") : t("receiver.useGps");
  const icon = isLocating ? (
    <LoadingIcon data-icon="inline-start" className="size-3.5" />
  ) : (
    <HugeiconsIcon icon={Location01Icon} data-icon="inline-start" className="size-3.5" aria-hidden="true" />
  );

  if (!isIconOnly) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("cursor-pointer", className)}
        disabled={isLocating}
        aria-busy={isLocating}
        onClick={locateReceiver}
      >
        {icon}
        {label}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        aria-busy={isLocating}
        onClick={locateReceiver}
        render={<Button type="button" variant="outline" size="icon-sm" className={cn("cursor-pointer", className)} disabled={isLocating} />}
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TerrainProfileGpsNotice({ gpsError, isReceiverPlaced, className }: TerrainProfileGpsNoticeProps) {
  const { t } = useTranslation("terrainProfile");
  if (gpsError === null) return null;

  const textKeys = isReceiverPlaced ? GPS_ERROR_TEXT_KEYS : PLACING_GPS_ERROR_TEXT_KEYS;
  return <InlineError size="sm" className={className} title={t(textKeys[gpsError])} />;
}
