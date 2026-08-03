import { getMnoBrand, getOperatorColor } from "@/lib/operatorUtils";

import OrangeIcon from "./logos/orange.svg?react";
import PlayIcon from "./logos/play-square.svg?react";
import PlusIcon from "./logos/plus.svg?react";
import TmobileIcon from "./logos/t-mobile.svg?react";

const MNO_LOGO: Partial<Record<string, typeof OrangeIcon>> = {
  OPL: OrangeIcon,
  TMPL: TmobileIcon,
  Plus: PlusIcon,
  Play: PlayIcon,
};

type DialogOperatorNameProps = {
  name: string;
  mnc?: number | null;
};

export function DialogOperatorName({ name, mnc }: DialogOperatorNameProps) {
  const Logo = mnc ? MNO_LOGO[getMnoBrand(mnc)] : undefined;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {Logo ? (
        <Logo className="h-5 w-auto shrink-0 rounded-[2px]" aria-hidden />
      ) : mnc ? (
        <div className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: getOperatorColor(mnc) }} aria-hidden />
      ) : null}
      <h2 className="min-w-0 truncate text-base font-semibold leading-5 tracking-tight text-foreground">{name}</h2>
    </div>
  );
}
