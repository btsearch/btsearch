import { type ReactNode, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { useNavActionTarget } from "@/contexts/navActions";
import { MobileFilterRailFloating, MobileFilterRailInline } from "@/features/shared/filterPanel";
import { ListTablePager, type ListTablePagerProps } from "@/features/stations/list/components/table/listTablePager";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

type ReferenceListPageProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  toolbar?: ReactNode;
  mobileToolbar?: ReactNode;
  pager?: ListTablePagerProps;
  notice?: ReactNode;
  isBusy?: boolean;
  children: ReactNode;
};

export const REFERENCE_LIST_TABLE_CLASS = "block overflow-visible rounded-none border-0 bg-transparent";
export const REFERENCE_LIST_STATE_ROWS = 5;

export function ReferenceListPage({
  title,
  description,
  action,
  toolbar,
  mobileToolbar,
  pager,
  notice,
  isBusy = false,
  children,
}: ReferenceListPageProps) {
  const { t } = useTranslation("common");
  const isMobile = useIsMobile();
  const navActionTarget = useNavActionTarget();
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const page = pager?.page;

  useLayoutEffect(() => {
    if (scrollBoxRef.current !== null) scrollBoxRef.current.scrollTop = 0;
  }, [page]);

  const hasMobileToolbar = isMobile && Boolean(mobileToolbar);
  const hasFloatingMobileToolbar = hasMobileToolbar && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const mobileRail = hasMobileToolbar ? (
    <div role="group" aria-label={t("labels.filters")} className="flex items-center gap-1.5">
      {mobileToolbar}
    </div>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 md:items-end">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground max-md:hidden">{description}</p> : null}
        </div>
        {action}
      </header>

      {toolbar && !hasMobileToolbar ? <div className="flex shrink-0 flex-wrap items-end gap-x-4 gap-y-2">{toolbar}</div> : null}
      {hasMobileToolbar && !hasFloatingMobileToolbar ? <MobileFilterRailInline>{mobileRail}</MobileFilterRailInline> : null}

      <div
        ref={pager?.paging.containerRef}
        className={cn("relative flex min-h-0 flex-1 flex-col", hasFloatingMobileToolbar && "max-md:mb-10")}
        aria-busy={isBusy}
      >
        {notice}
        <div
          ref={scrollBoxRef}
          className={cn(
            "custom-scrollbar min-h-0 overflow-auto overscroll-contain rounded-t-lg border bg-card",
            pager ? "flex-1 border-b-0" : "rounded-b-lg",
          )}
        >
          {children}
        </div>
        {pager ? <ListTablePager {...pager} /> : null}
      </div>

      {hasFloatingMobileToolbar && navActionTarget ? (
        <MobileFilterRailFloating target={navActionTarget}>{mobileRail}</MobileFilterRailFloating>
      ) : null}
    </div>
  );
}
