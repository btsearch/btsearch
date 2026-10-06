import type { DuplexRadioLink } from "../utils";
import { RadioLineDetails, RadioLineRow } from "./radioLinePopupContent";

export function RadioLineTooltipContent({ links }: { links: DuplexRadioLink[] }) {
  return (
    <div className="w-72 text-sm">
      {links.map((link) => (
        <RadioLineRow key={link.groupId} link={link}>
          <RadioLineDetails link={link} />
        </RadioLineRow>
      ))}
    </div>
  );
}
