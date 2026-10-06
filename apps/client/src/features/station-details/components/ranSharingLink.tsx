import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

const RAN_SHARING_ARTICLE_URL = "https://biuroprasowe.orange.pl/blog/gdy-dwoch-operatorow-korzysta-z-jednej-anteny-i-nie-tylko/";

type RanSharingLinkProps = {
  children?: ReactNode;
};

export function RanSharingLink({ children }: RanSharingLinkProps) {
  return (
    <a
      href={RAN_SHARING_ARTICLE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group/ran-sharing inline-flex items-center gap-0.5 font-medium text-popover-foreground underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:decoration-foreground"
    >
      {children}
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        className="size-3 shrink-0 -translate-x-1 opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover/ran-sharing:translate-x-0 group-hover/ran-sharing:opacity-100 group-focus-visible/ran-sharing:translate-x-0 group-focus-visible/ran-sharing:opacity-100 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </a>
  );
}
