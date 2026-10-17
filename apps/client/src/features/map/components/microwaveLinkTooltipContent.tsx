import type { DuplexMicrowaveLink, MicrowaveLinkLookups } from "../utils";
import { MicrowaveLinkDetails, MicrowaveLinkRow } from "./microwaveLinkPopupContent";

type MicrowaveLinkTooltipContentProps = {
  links: DuplexMicrowaveLink[];
  lookups: MicrowaveLinkLookups | undefined;
};

export function MicrowaveLinkTooltipContent({ links, lookups }: MicrowaveLinkTooltipContentProps) {
  return (
    <div className="w-72 text-sm">
      {links.map((link) => (
        <MicrowaveLinkRow key={link.groupId} link={link} lookups={lookups}>
          <MicrowaveLinkDetails link={link} />
        </MicrowaveLinkRow>
      ))}
    </div>
  );
}
