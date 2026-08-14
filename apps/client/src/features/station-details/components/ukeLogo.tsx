import { cn } from "@/lib/utils";

import UkeIcon from "./logos/uke.svg?react";

export function UKELogo({ className }: { className?: string }) {
  return <UkeIcon aria-hidden="true" className={cn("w-auto dark:[&>path:first-of-type]:fill-[#8a9be0]", className)} />;
}
