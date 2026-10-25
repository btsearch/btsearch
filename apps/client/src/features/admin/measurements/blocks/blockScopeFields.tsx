import { CELL_RATS, READING_BLOCK_FIELDS, READING_BLOCK_ROLES } from "@openbts/shared/contract";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import { type BlockDraft, canCorroborate, toggleValue } from "./blockDraft";
import { getRatLabel } from "./blockText";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { PRESSED_TOGGLE_CLASS } from "@/features/admin/reference/components/shared/facetToggles";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type ScopeDraft = Pick<BlockDraft, "fields" | "mode" | "technologies" | "roles">;

type BlockScopeFieldsProps = {
  draft: ScopeDraft;
  disabled: boolean;
  onChange: (change: Partial<ScopeDraft>) => void;
};

type ToggleProps = {
  isPressed: boolean;
  isSmall?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
};

type ToggleGroupProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

function Toggle({ isPressed, isSmall = false, disabled, onClick, children }: ToggleProps) {
  return (
    <Button
      type="button"
      variant={isPressed ? "ghost" : "outline"}
      size={isSmall ? "sm" : "default"}
      aria-pressed={isPressed}
      disabled={disabled}
      className={cn("cursor-pointer", isPressed && PRESSED_TOGGLE_CLASS)}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ToggleGroup({ title, description, children }: ToggleGroupProps) {
  const titleId = useId();

  return (
    <Field>
      <FieldTitle id={titleId}>{title}</FieldTitle>
      <div role="group" aria-labelledby={titleId} className="flex flex-wrap gap-1">
        {children}
      </div>
      {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}

export function BlockScopeFields({ draft, disabled, onChange }: BlockScopeFieldsProps) {
  const { t } = useTranslation("admin");
  const modeTitleId = useId();
  const isWhole = draft.fields.length === 0;
  const isCorroborateAllowed = canCorroborate(draft.fields);
  const modeOptions = [
    { value: "corroborate" as const, label: t("measurements.blocks.modes.corroborate") },
    { value: "drop" as const, label: t("measurements.blocks.modes.drop") },
  ];

  function changeFields(fields: BlockDraft["fields"]) {
    onChange({ fields, mode: canCorroborate(fields) ? draft.mode : "drop" });
  }

  return (
    <>
      <ToggleGroup
        title={t("measurements.blocks.dialog.values")}
        description={isWhole ? t("measurements.blocks.dialog.wholeNote") : t("measurements.blocks.dialog.fieldsNote")}
      >
        <Toggle isPressed={isWhole} disabled={disabled} onClick={() => changeFields([])}>
          {t("measurements.blocks.dialog.fieldLabels.whole")}
        </Toggle>
        {READING_BLOCK_FIELDS.map((field) => (
          <Toggle
            key={field}
            isPressed={draft.fields.includes(field)}
            disabled={disabled}
            onClick={() => changeFields(toggleValue(draft.fields, field))}
          >
            {t(`measurements.blocks.dialog.fieldLabels.${field}`)}
          </Toggle>
        ))}
      </ToggleGroup>
      <Field>
        <FieldTitle id={modeTitleId}>{t("measurements.blocks.dialog.mode")}</FieldTitle>
        <SegmentedControl
          value={draft.mode}
          options={modeOptions}
          ariaLabelledBy={modeTitleId}
          disabled={disabled || !isCorroborateAllowed}
          onValueChange={(mode) => onChange({ mode })}
          className="flex w-full *:flex-auto"
        />
        <FieldDescription>
          {draft.mode === "corroborate" ? t("measurements.blocks.dialog.corroborateNote") : t("measurements.blocks.dialog.dropNote")}
        </FieldDescription>
      </Field>
      {isWhole ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleGroup title={t("measurements.blocks.dialog.technologies")}>
            {CELL_RATS.map((rat) => (
              <Toggle
                key={rat}
                isPressed={draft.technologies.includes(rat)}
                isSmall
                disabled={disabled}
                onClick={() => onChange({ technologies: toggleValue(draft.technologies, rat) })}
              >
                {getRatLabel(rat)}
              </Toggle>
            ))}
          </ToggleGroup>
          <ToggleGroup title={t("measurements.blocks.dialog.roles")}>
            {READING_BLOCK_ROLES.map((role) => (
              <Toggle
                key={role}
                isPressed={draft.roles.includes(role)}
                isSmall
                disabled={disabled}
                onClick={() => onChange({ roles: toggleValue(draft.roles, role) })}
              >
                {t(`measurements.blocks.dialog.roleLabels.${role}`)}
              </Toggle>
            ))}
          </ToggleGroup>
          <FieldDescription className="sm:col-span-2">{t("measurements.blocks.dialog.scopeNote")}</FieldDescription>
        </div>
      )}
    </>
  );
}
