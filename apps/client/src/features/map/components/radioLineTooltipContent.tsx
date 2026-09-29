import { memo } from "react";

import { type DuplexRadioLink, getRadioLineMnc } from "../utils";
import { PopupRow } from "./popupParts";
import { RadioLineDetails, RadioLineTitle } from "./radioLinePopupContent";

export const RadioLineTooltipContent = memo(function RadioLineTooltipContent({ links }: { links: DuplexRadioLink[] }) {
  return (
    <div className="w-72 text-sm">
      {links.map((link) => (
        <PopupRow key={link.groupId} mnc={getRadioLineMnc(link)} title={<RadioLineTitle link={link} />}>
          <RadioLineDetails link={link} />
        </PopupRow>
      ))}
    </div>
  );
});
