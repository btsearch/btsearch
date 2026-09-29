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

type OperatorMarkProps = {
  mnc?: number | null;
  compact?: boolean;
};

export function OperatorMark({ mnc, compact = false }: OperatorMarkProps) {
  if (mnc === null || mnc === undefined) return null;
  const Logo = MNO_LOGO[getMnoBrand(mnc)];
  if (Logo) return <Logo className={cn("w-auto shrink-0 rounded-[2px]", compact ? "h-4" : "h-5")} aria-hidden />;
  return <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: getOperatorColor(mnc) }} aria-hidden />;
}

type DialogOperatorNameProps = {
  name: string;
  mnc?: number | null;
  compact?: boolean;
  labelClassName?: string;
};

export function DialogOperatorName({ name, mnc, compact = false, labelClassName }: DialogOperatorNameProps) {
  const Root = compact ? "span" : "div";

  return (
    <Root className={cn("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}>
      <OperatorMark mnc={mnc} compact={compact} />
      {compact ? (
        <span className={cn("min-w-0 truncate text-xs font-medium text-foreground", labelClassName)}>{name}</span>
      ) : (
        <h2 className={cn("min-w-0 truncate text-base font-semibold leading-5 tracking-tight text-foreground", labelClassName)}>{name}</h2>
      )}
    </Root>
  );
}
