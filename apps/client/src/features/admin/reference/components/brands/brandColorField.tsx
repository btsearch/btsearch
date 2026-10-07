import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { BRAND_COLOR_PRESETS, BRAND_COLOR_TEXT_LENGTH, isUnfinishedBrandColor, parseBrandColor } from "./brandDraft";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type BrandColorFieldProps = {
  color: string;
  colorText: string;
  isDisabled: boolean;
  onColorTextChange: (text: string) => void;
  onColorPick: (color: string) => void;
};

type PresetColorButtonProps = {
  preset: string;
  isPressed: boolean;
  isDisabled: boolean;
  onPick: (color: string) => void;
};

const PRESSED_PRESET_CLASS = "ring-2 ring-foreground ring-offset-2 ring-offset-background";
const NATIVE_PICKER_CLASS = "pointer-events-none absolute bottom-0 left-0 size-px opacity-0";

function PresetColorButton({ preset, isPressed, isDisabled, onPick }: PresetColorButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label={preset}
            aria-pressed={isPressed}
            disabled={isDisabled}
            style={{ backgroundColor: preset }}
            className={cn("cursor-pointer", isPressed && PRESSED_PRESET_CLASS)}
            onClick={() => onPick(preset)}
          />
        }
      />
      <TooltipContent>{preset}</TooltipContent>
    </Tooltip>
  );
}

export function BrandColorField({ color, colorText, isDisabled, onColorTextChange, onColorPick }: BrandColorFieldProps) {
  const { t } = useTranslation("admin");
  const textInputId = useId();
  const nativePickerRef = useRef<HTMLInputElement>(null);
  const [isTextFocused, setIsTextFocused] = useState(false);

  const isStillTyping = isTextFocused && isUnfinishedBrandColor(colorText);
  const isMarkedInvalid = parseBrandColor(colorText) === null && !isStillTyping;
  const pickColorLabel = t("reference.brands.dialog.pickColor");

  return (
    <Field data-invalid={isMarkedInvalid || undefined}>
      <FieldLabel htmlFor={textInputId}>{t("reference.brands.fields.color")}</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={pickColorLabel}
                  disabled={isDisabled}
                  style={{ backgroundColor: color }}
                  className="cursor-pointer"
                  onClick={() => nativePickerRef.current?.click()}
                />
              }
            />
            <TooltipContent>{pickColorLabel}</TooltipContent>
          </Tooltip>
          <input
            ref={nativePickerRef}
            type="color"
            value={color.toLowerCase()}
            onChange={(event) => onColorPick(event.target.value.toUpperCase())}
            disabled={isDisabled}
            tabIndex={-1}
            aria-hidden="true"
            aria-label={pickColorLabel}
            className={NATIVE_PICKER_CLASS}
          />
        </div>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={textInputId}
          value={colorText}
          onChange={(event) => onColorTextChange(event.target.value)}
          onFocus={() => setIsTextFocused(true)}
          onBlur={() => setIsTextFocused(false)}
          aria-label={t("reference.brands.dialog.colorValue")}
          aria-invalid={isMarkedInvalid || undefined}
          maxLength={BRAND_COLOR_TEXT_LENGTH}
          spellCheck={false}
          disabled={isDisabled}
          className="w-29 font-mono uppercase"
        />
        <div role="group" aria-label={t("reference.brands.dialog.presetColors")} className="flex flex-wrap gap-1.5 sm:ml-2">
          {BRAND_COLOR_PRESETS.map((preset) => (
            <PresetColorButton key={preset} preset={preset} isPressed={preset === color} isDisabled={isDisabled} onPick={onColorPick} />
          ))}
        </div>
      </div>
      {isMarkedInvalid ? (
        <FieldError>{t("reference.errors.brand.colorFormat")}</FieldError>
      ) : (
        <FieldDescription>{t("reference.brands.dialog.colorHint")}</FieldDescription>
      )}
    </Field>
  );
}
