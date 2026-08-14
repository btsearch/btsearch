import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const SI2PEM_LOGO_STYLE: CSSProperties = {
  aspectRatio: "2435/521",
  maskImage: "url(/si2pem.svg)",
  WebkitMaskImage: "url(/si2pem.svg)",
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
};

export function SI2PEMLogo({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      className={cn("block bg-[#2e2e5a] dark:bg-[#9898ce]", className)}
      style={SI2PEM_LOGO_STYLE}
    />
  );
}
