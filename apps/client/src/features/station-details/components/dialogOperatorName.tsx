import { getMnoBrand, getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";

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
  compact?: boolean;
};

export function DialogOperatorName({ name, mnc, compact = false }: DialogOperatorNameProps) {
  const Logo = mnc ? MNO_LOGO[getMnoBrand(mnc)] : undefined;
  return (
    <div className={cn("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}>
      {Logo ? (
        <Logo className={cn("w-auto shrink-0 rounded-[2px]", compact ? "h-4" : "h-5")} aria-hidden />
      ) : mnc ? (
        <div className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: getOperatorColor(mnc) }} aria-hidden />
      ) : null}
      {compact ? (
        <span className="min-w-0 truncate text-xs font-medium text-foreground">{name}</span>
      ) : (
        <h2 className="min-w-0 truncate text-base font-semibold leading-5 tracking-tight text-foreground">{name}</h2>
      )}
    </div>
  );
}
