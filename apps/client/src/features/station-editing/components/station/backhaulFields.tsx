import { HugeiconsIcon } from "@hugeicons/react";
import type { BackhaulMedium } from "@openbts/shared/contract";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { StationDraftApi } from "../../hooks/useStationDraft";
import { BACKHAUL_MEDIUM_KEYS, parseDigits } from "../../model/changes";
import { EDIT_LIMITS } from "../../model/validate";
import { FieldGroup, getControlProps, getFieldColumnsClass, getStationFieldView } from "./stationFields";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Reveal } from "@/features/map/components/search-overlay/mapFilterMotion";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { UPLINK_APPEARANCE, formatSpeedMbps } from "@/lib/format/uplink";
import { cn } from "@/lib/utils";

type BackhaulFieldsProps = {
  edit: StationDraftApi;
  idPrefix: string;
};

type MediumLabelProps = {
  medium: BackhaulMedium | null;
  isInList?: boolean;
};

const NO_MEDIUM = "none";
const MEDIUMS: readonly BackhaulMedium[] = ["fiber", "microwave", "satellite"];
const FIBER_SPEED_SUGGESTIONS = [1250, 2500, 10_000];
const MOST_SPEED_DIGITS = 10;

function MediumLabel({ medium, isInList = false }: MediumLabelProps) {
  const { t } = useTranslation("common");

  if (medium === null) {
    return (
      <>
        {isInList ? <span aria-hidden="true" className="size-3.5 shrink-0" /> : null}
        <span>{t("labels.unknown")}</span>
      </>
    );
  }

  const { icon, iconClassName } = UPLINK_APPEARANCE[medium];
  return (
    <>
      <HugeiconsIcon icon={icon} aria-hidden="true" className={cn("size-3.5 shrink-0", iconClassName)} />
      <span>{t(BACKHAUL_MEDIUM_KEYS[medium])}</span>
    </>
  );
}

export function BackhaulMediumField({ edit, idPrefix }: BackhaulFieldsProps) {
  const { medium } = edit.session.draft.station.backhaul;
  const view = getStationFieldView(edit, "backhaulMedium", idPrefix);

  function changeMedium(value: string | null) {
    const nextMedium = MEDIUMS.find((option) => option === value) ?? null;
    edit.dispatch({ type: "setBackhaul", patch: nextMedium === "microwave" ? { medium: nextMedium } : { medium: nextMedium, model: "" } });
  }

  return (
    <FieldGroup view={view} label="Uplink" isLabelLinked={false}>
      <Select value={medium ?? NO_MEDIUM} onValueChange={changeMedium} disabled={!edit.canEdit}>
        <SelectTrigger {...getControlProps(view)} aria-labelledby={view.labelId} className={cn("w-36 cursor-pointer", view.className)}>
          <SelectValue>
            <MediumLabel medium={medium} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_MEDIUM} className="cursor-pointer">
            <MediumLabel medium={null} isInList />
          </SelectItem>
          {MEDIUMS.map((option) => (
            <SelectItem key={option} value={option} className="cursor-pointer">
              <MediumLabel medium={option} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldGroup>
  );
}

export function BackhaulDetailFields({ edit, idPrefix }: BackhaulFieldsProps) {
  const { t } = useTranslation("common");
  const [isSpeedFocused, setIsSpeedFocused] = useState(false);
  const { medium, speedMbps, model } = edit.session.draft.station.backhaul;
  const speedView = getStationFieldView(edit, "backhaulSpeedMbps", idPrefix);
  const modelView = getStationFieldView(edit, "backhaulModel", idPrefix);
  const isForm = edit.session.kind === "form";
  const isLocked = !edit.canEdit;

  if (medium === null) return null;

  return (
    <div className={cn("grid", getFieldColumnsClass(isForm))}>
      <FieldGroup view={speedView} label={t("labels.uplinkSpeed")} className="gap-1.5">
        <Input
          type="text"
          inputMode="numeric"
          {...NO_AUTOFILL_PROPS}
          {...getControlProps(speedView)}
          maxLength={MOST_SPEED_DIGITS}
          value={speedMbps === null ? "" : String(speedMbps)}
          placeholder="Mbps"
          onChange={(event) => edit.dispatch({ type: "setBackhaul", patch: { speedMbps: parseDigits(event.target.value) } })}
          onFocus={() => setIsSpeedFocused(true)}
          onBlur={() => setIsSpeedFocused(false)}
          disabled={isLocked}
          className={speedView.className}
        />
        <Reveal shown={isSpeedFocused && medium === "fiber" && !isLocked}>
          <div className="flex flex-wrap gap-1">
            {FIBER_SPEED_SUGGESTIONS.map((speed) => (
              <Badge
                key={speed}
                variant="outline"
                render={<button type="button" tabIndex={-1} />}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => edit.dispatch({ type: "setBackhaul", patch: { speedMbps: speed } })}
                className="cursor-pointer hover:bg-muted"
              >
                {formatSpeedMbps(speed)}
              </Badge>
            ))}
          </div>
        </Reveal>
      </FieldGroup>
      {medium === "microwave" ? (
        <FieldGroup view={modelView} label={t("labels.uplinkModel")} className="gap-1.5">
          <Input
            {...NO_AUTOFILL_PROPS}
            {...getControlProps(modelView)}
            value={model}
            maxLength={EDIT_LIMITS.backhaulModel}
            placeholder={t("placeholder.optional")}
            onChange={(event) => edit.dispatch({ type: "setBackhaul", patch: { model: event.target.value } })}
            disabled={isLocked}
            className={modelView.className}
          />
        </FieldGroup>
      ) : null}
    </div>
  );
}
