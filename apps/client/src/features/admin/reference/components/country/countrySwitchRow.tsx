import type { IconSvgElement } from "@hugeicons/react";
import { useId } from "react";

import { ReferenceRow } from "../shared/referenceCards";
import { Switch } from "@/components/ui/switch";

type CountrySwitchRowProps = {
  icon?: IconSvgElement;
  title: string;
  description: string;
  isEnabled: boolean;
  disabled: boolean;
  onEnabledChange: (isEnabled: boolean) => void;
};

export function CountrySwitchRow({ icon, title, description, isEnabled, disabled, onEnabledChange }: CountrySwitchRowProps) {
  const titleId = useId();

  return (
    <ReferenceRow icon={icon} title={title} titleId={titleId} description={description}>
      <Switch checked={isEnabled} disabled={disabled} onCheckedChange={onEnabledChange} aria-labelledby={titleId} className="cursor-pointer" />
    </ReferenceRow>
  );
}
