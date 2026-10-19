import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

const RAN_SHARING_ARTICLE_URL = "https://biuroprasowe.orange.pl/blog/gdy-dwoch-operatorow-korzysta-z-jednej-anteny-i-nie-tylko/";
const MOCN_ARTICLE_URL = "https://www.vodafonethree.com/merger-sharing-mobile-networks-everything-you-need-to-know-mocn/";

type ArticleLinkProps = {
  href: string;
  children?: ReactNode;
};

type SharingLinkProps = Omit<ArticleLinkProps, "href">;

function ArticleLink({ href, children }: ArticleLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="group/article inline-flex items-center gap-0.5 font-medium text-popover-foreground underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:decoration-foreground"
    >
      {children}
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        className="size-3 shrink-0 -translate-x-1 opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover/article:translate-x-0 group-hover/article:opacity-100 group-focus-visible/article:translate-x-0 group-focus-visible/article:opacity-100 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </a>
  );
}

export function RanSharingLink({ children }: SharingLinkProps) {
  return <ArticleLink href={RAN_SHARING_ARTICLE_URL}>{children}</ArticleLink>;
}

export function MocnLink({ children }: SharingLinkProps) {
  return <ArticleLink href={MOCN_ARTICLE_URL}>{children}</ArticleLink>;
}
