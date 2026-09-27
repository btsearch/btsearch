import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { formatSpeedMbps, uplinkTypeKey } from "@/lib/format/uplink";
import type { UplinkType } from "@/types/station";

const FIBER_SPEED_SUGGESTIONS = [1250, 2500, 10000];

type UplinkFieldsProps = {
  uplinkType: UplinkType | null;
  onUplinkTypeChange: (value: UplinkType | null) => void;
  uplinkSpeed: number | null;
  onUplinkSpeedChange: (value: number | null) => void;
  uplinkModel: string;
  onUplinkModelChange: (value: string) => void;
  size?: "default" | "compact";
  readOnly?: boolean;
  typeMeta?: ReactNode;
  speedMeta?: ReactNode;
  modelMeta?: ReactNode;
};

export function UplinkFields({
  uplinkType,
  onUplinkTypeChange,
  uplinkSpeed,
  onUplinkSpeedChange,
  uplinkModel,
  onUplinkModelChange,
  size = "default",
  readOnly = false,
  typeMeta,
  speedMeta,
  modelMeta,
}: UplinkFieldsProps) {
  const { t } = useTranslation("common");
  const [speedFocused, setSpeedFocused] = useState(false);

  const isCompact = size === "compact";
  const triggerClass = isCompact ? "h-8 w-36 text-sm" : "h-8 w-36";
  const inputClass = isCompact ? "h-8 text-sm" : "";
  const labelClass = isCompact ? "text-xs" : "";
  const gapClass = isCompact ? "gap-3" : "gap-4";
  const typeLabel = uplinkType ? t(`labels.${uplinkTypeKey(uplinkType)}`) : t("labels.uplinkUnknown");

  return (
    <>
      <div className="flex items-center gap-2">
        <Label className={`shrink-0 ${labelClass}`}>{t("labels.uplink")}</Label>
        {readOnly ? (
          <span className="text-sm font-medium">{typeLabel}</span>
        ) : (
          <Select
            value={uplinkType ?? "none"}
            onValueChange={(value) => {
              const next = value === "none" ? null : (value as UplinkType);
              onUplinkTypeChange(next);
              if (!next) onUplinkSpeedChange(null);
              if (next !== "microwave") onUplinkModelChange("");
            }}
          >
            <SelectTrigger className={triggerClass}>
              <span className="truncate">{typeLabel}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("labels.uplinkUnknown")}</SelectItem>
              <SelectItem value="fiber">{t("labels.uplinkFiber")}</SelectItem>
              <SelectItem value="microwave">{t("labels.uplinkMicrowave")}</SelectItem>
            </SelectContent>
          </Select>
        )}
        {typeMeta}
      </div>
      {uplinkType ? (
        <div className={`grid grid-cols-1 ${uplinkType === "microwave" ? "sm:grid-cols-2" : ""} ${gapClass}`}>
          <div className="space-y-1.5">
            <Label className={labelClass}>{t("labels.uplinkSpeed")}</Label>
            {readOnly ? (
              <p className="text-sm font-medium">{uplinkSpeed !== null ? formatSpeedMbps(uplinkSpeed) : "-"}</p>
            ) : (
              <Input
                type="number"
                min={1}
                value={uplinkSpeed ?? ""}
                placeholder="Mbps"
                onChange={(e) => onUplinkSpeedChange(e.target.value ? Number(e.target.value) : null)}
                onFocus={() => setSpeedFocused(true)}
                onBlur={() => setSpeedFocused(false)}
                className={inputClass}
              />
            )}
            {!readOnly && speedFocused && uplinkType === "fiber" ? (
              <div className="flex flex-wrap gap-1 animate-in fade-in slide-in-from-top-1 duration-150">
                {FIBER_SPEED_SUGGESTIONS.map((v) => (
                  <Badge
                    key={v}
                    variant="outline"
                    render={<button type="button" />}
                    onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                    onClick={() => onUplinkSpeedChange(v)}
                    className="cursor-pointer hover:bg-muted"
                  >
                    {formatSpeedMbps(v)}
                  </Badge>
                ))}
              </div>
            ) : null}
            {speedMeta}
          </div>
          {uplinkType === "microwave" ? (
            <div className="space-y-1.5">
              <Label className={labelClass}>{t("labels.uplinkModel")}</Label>
              {readOnly ? (
                <p className="text-sm font-medium">{uplinkModel || "-"}</p>
              ) : (
                <Input
                  value={uplinkModel}
                  maxLength={100}
                  placeholder={t("placeholder.optional")}
                  onChange={(e) => onUplinkModelChange(e.target.value)}
                  className={inputClass}
                />
              )}
              {modelMeta}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
