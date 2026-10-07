import OrangeIcon from "./logos/orange.svg?react";
import PlayIcon from "./logos/play-square.svg?react";
import PlusIcon from "./logos/plus.svg?react";
import TmobileIcon from "./logos/t-mobile.svg?react";
import { getMnoBrand, getOperatorColor } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

const MNO_LOGO: Partial<Record<string, typeof OrangeIcon>> = {
  OPL: OrangeIcon,
  TMPL: TmobileIcon,
  Plus: PlusIcon,
  Play: PlayIcon,
};

type RadioLineOperatorMarkProps = {
  mnc?: number | null;
  compact?: boolean;
};

export function RadioLineOperatorMark({ mnc, compact = false }: RadioLineOperatorMarkProps) {
  if (mnc === null || mnc === undefined) return null;
  const Logo = MNO_LOGO[getMnoBrand(mnc)];
  if (Logo) return <Logo className={cn("w-auto shrink-0 rounded-[2px]", compact ? "h-4" : "h-5")} aria-hidden />;
  return <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: getOperatorColor(mnc) }} aria-hidden />;
}
