import type { IconSvgElement } from "@hugeicons/react";
import { type ReactNode, useId } from "react";

import { Switch } from "@/components/ui/switch";
import { SettingsRow } from "@/features/settings/components/settingsPrimitives";

type FeatureSwitchRowProps = {
  icon?: IconSvgElement;
  title: string;
  description: ReactNode;
  isEnabled: boolean;
  isNested?: boolean;
  onEnabledChange: (isEnabled: boolean) => void;
};

const NESTED_ROW_MARK = (
  <span aria-hidden="true" className="flex w-8 shrink-0 justify-center">
    <span className="-mt-2.5 size-3 rounded-bl-[5px] border-b-[1.5px] border-l-[1.5px] border-foreground/20" />
  </span>
);

export function FeatureSwitchRow({ icon, title, description, isEnabled, isNested = false, onEnabledChange }: FeatureSwitchRowProps) {
  const titleId = useId();

  return (
    <SettingsRow
      icon={icon}
      media={isNested ? NESTED_ROW_MARK : undefined}
      title={title}
      titleId={titleId}
      description={description}
      className={isNested ? "border-t-0 pt-0" : undefined}
    >
      <Switch checked={isEnabled} onCheckedChange={onEnabledChange} aria-labelledby={titleId} className="cursor-pointer" />
    </SettingsRow>
  );
}
