import type { FieldState, SectorRowState } from "../../model/types";
import { cn } from "@/lib/utils";

export type FieldLook = "plain" | "changed" | "corrected" | "added";

const BORDER_CLASSES: Record<FieldLook, string> = {
  plain: "",
  changed: "border-amber-500/55 dark:border-amber-500/55",
  corrected: "border-primary dark:border-primary",
  added: "border-emerald-500/60 dark:border-emerald-500/60",
};
const FILL_CLASSES: Record<FieldLook, string> = {
  plain: "",
  changed: "bg-amber-500/8 dark:bg-amber-500/8",
  corrected: "bg-primary/10 dark:bg-primary/10",
  added: "bg-emerald-500/6 dark:bg-emerald-500/6",
};
const INVALID_CLASS = "aria-invalid:ring-0 aria-invalid:focus-visible:ring-3";
const INVALID_FILL_CLASS = "bg-destructive/5 dark:bg-destructive/5";

export function getFieldLook(state: FieldState, showsCorrections: boolean): FieldLook {
  if (showsCorrections && state.isCorrected) return "corrected";
  return state.isChanged ? "changed" : "plain";
}

export function getSectorLook(state: SectorRowState, showsCorrections: boolean): FieldLook {
  const look = getFieldLook(state.field, showsCorrections);
  return look === "plain" && state.kind === "new" ? "added" : look;
}

export function getFieldClass(look: FieldLook, isInvalid: boolean, isFilled = false): string {
  if (isInvalid) return cn(INVALID_CLASS, isFilled && INVALID_FILL_CLASS);
  return cn(BORDER_CLASSES[look], isFilled && FILL_CLASSES[look]);
}
