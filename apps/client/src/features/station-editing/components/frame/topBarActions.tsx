import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { useNavActionTarget } from "@/contexts/navActions";

export type TopBarPlacement = "header" | "floating" | "inline";

type TopBarActionsProps = {
  children: ReactNode;
};

export const FLOATING_SURFACE_CLASS = "max-md:bg-background max-md:dark:bg-background";
export const FLOATING_PRIMARY_CLASS = "max-md:bg-primary max-md:disabled:opacity-100 max-md:disabled:text-primary-foreground/50";

export function useTopBarPlacement(): TopBarPlacement {
  const target = useNavActionTarget();
  if (target === null) return "inline";
  return target.id === FLOATING_NAV_ACTION_TARGET_ID ? "floating" : "header";
}

export function TopBarActions({ children }: TopBarActionsProps) {
  const target = useNavActionTarget();
  const bar = <div className="flex items-center gap-1">{children}</div>;

  return target === null ? bar : createPortal(bar, target);
}
