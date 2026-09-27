import type { ReactNode } from "react";

export function LightboxDetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-white/50">{label}</span>
      <span className="text-sm text-white/90">{children}</span>
    </div>
  );
}
