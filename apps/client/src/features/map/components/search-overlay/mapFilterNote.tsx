import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

export function FilterNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
      <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
