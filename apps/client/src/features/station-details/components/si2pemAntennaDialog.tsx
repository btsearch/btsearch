import { useQuery } from "@tanstack/react-query";
import { type ReactNode, type Ref, useId, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AntennaReportBar } from "../station/emf/antennas/antennaReportBar";
import { AntennaReportContent } from "../station/emf/antennas/antennaReportContent";
import { AntennaComparisonNotice, AntennaEmpty, AntennaFailure, AntennaLoading } from "../station/emf/antennas/antennaStates";
import { useAntennaReportChoice } from "../station/emf/antennas/useAntennaReportChoice";
import { emfAntennasQueryOptions } from "../station/emf/api";
import { getOperatorBrand } from "../station/utils/brands";
import { getLocationLabel } from "../station/utils/stations";
import { DialogOperatorName } from "./dialogOperatorName";
import { SI2PEMLogo } from "./si2pemLogo";
import type { BrandLook } from "@/components/cellular/brandMark";
import { CloseButton } from "@/components/ui/close-button";
import { useFloatingDialogFocus } from "@/features/floating-dialogs/hooks/useFloatingDialogFocus";
import type { FloatingDialogPanelFrameProps, SI2PEMReportDialogPayload } from "@/features/floating-dialogs/types";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { findOperatorForPlmn } from "@/features/shared/operatorBrands";
import { useIsMobile } from "@/hooks/useMobile";
import { useSettledSession } from "@/hooks/useSettledSession";
import { getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

type SI2PEMAntennaDialogPanelProps = FloatingDialogPanelFrameProps & SI2PEMReportDialogPayload;

type AntennaDialogHeaderProps = Pick<SI2PEMReportDialogPayload, "siteId" | "operatorName" | "place"> &
  Pick<FloatingDialogPanelFrameProps, "onClose" | "headerDragProps"> & {
    titleId: string;
    brand: BrandLook | null;
    closeButtonRef: Ref<HTMLButtonElement>;
  };

function AntennaDialogHeader({ siteId, operatorName, place, titleId, brand, closeButtonRef, headerDragProps, onClose }: AntennaDialogHeaderProps) {
  const { t } = useTranslation("stationDetails");
  const placeLabel = place === undefined ? null : getLocationLabel(place);

  return (
    <div {...headerDragProps} className={cn("shrink-0 border-b bg-background/95 backdrop-blur-sm", headerDragProps?.className)}>
      <div
        className="flex items-start gap-3 px-4 py-3 sm:px-6 sm:py-3.5"
        style={{ backgroundImage: brand === null ? undefined : getOperatorHeaderTintGradient(brand.color) }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <SI2PEMLogo className="h-3.5 shrink-0" />
            <h2 id={titleId} className="min-w-0 truncate text-base font-semibold leading-5 tracking-tight text-foreground">
              {t("si2pemAntennaData.title")}
            </h2>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <DialogOperatorName name={operatorName} brand={brand} compact />
            <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground">{siteId}</span>
            {placeLabel === null ? null : <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{placeLabel}</p>}
          </div>
        </div>
        <div className="-mt-1 -mr-2 flex shrink-0 items-center gap-1">
          <CloseButton ref={closeButtonRef} onClick={onClose} onPointerDown={(event) => event.stopPropagation()} />
        </div>
      </div>
    </div>
  );
}

export function SI2PEMAntennaDialogPanel({
  site,
  siteId,
  report,
  operatorName,
  operatorMnc,
  place,
  onClose,
  className,
  contentClassName,
  contentRef,
  bodyRef,
  bodyContentRef,
  style,
  headerDragProps,
}: SI2PEMAntennaDialogPanelProps) {
  const titleId = useId();
  const isPhone = useIsMobile();
  const { data: session, isPending: isSessionPending, error: sessionError } = useSettledSession();
  const viewerReady = !isSessionPending && !sessionError;
  const windowRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [isComparisonRequested, setIsComparisonRequested] = useState(false);
  const reportChoice = useAntennaReportChoice(site, report);
  const { shownReport, olderReport, alternativeReport } = reportChoice;
  const antennasQuery = useQuery(emfAntennasQueryOptions(site, shownReport.url));
  const { data: operators } = useQuery({ ...operatorsQueryOptions({ viewerId: session?.user.id ?? null }), enabled: viewerReady });
  const { data: brands } = useQuery(brandsQueryOptions());
  const antennas = antennasQuery.data?.antennas;
  const hasAntennas = antennas !== undefined && antennas.length > 0;
  const isComparing = isComparisonRequested && olderReport !== null;
  const needsOlderAntennas = isComparing && hasAntennas;
  const comparedReport = olderReport ?? shownReport;
  const olderAntennasQuery = useQuery({ ...emfAntennasQueryOptions(site, comparedReport.url), enabled: needsOlderAntennas });
  useImperativeHandle(bodyRef, () => scrollerRef.current!);
  useFloatingDialogFocus(windowRef, closeButtonRef);

  const plmn = operatorMnc === undefined || operatorMnc === null ? null : String(operatorMnc);
  const brand = getOperatorBrand(findOperatorForPlmn(viewerReady ? operators : undefined, plmn), brands);
  const fillsBody = !antennasQuery.isPending && !hasAntennas;
  const olderAntennaReport = needsOlderAntennas ? olderAntennasQuery.data : undefined;
  const hasOlderReadFailed = needsOlderAntennas && olderAntennaReport === undefined && olderAntennasQuery.isError;
  const isOlderTableMissing = olderAntennaReport !== undefined && olderAntennaReport.antennas.length === 0;
  const hasComparisonFailed = hasOlderReadFailed || isOlderTableMissing;
  const olderAntennas = olderAntennaReport === undefined || isOlderTableMissing ? undefined : olderAntennaReport.antennas;
  const isComparisonPressed = isComparing && !fillsBody;
  const isComparisonBusy = isComparisonPressed && olderAntennaReport === undefined && !hasOlderReadFailed;

  function keepFocusInWindow() {
    if (scrollerRef.current?.contains(document.activeElement)) windowRef.current?.focus({ preventScroll: true });
  }

  function showReport(reportUrl: string) {
    keepFocusInWindow();
    reportChoice.showReport(reportUrl);
    setSelectedGroupKey(null);
    setIsComparisonRequested(false);
    scrollerRef.current?.scrollTo({ top: 0 });
  }

  function retryAntennas() {
    keepFocusInWindow();
    void antennasQuery.refetch();
  }

  function retryComparison() {
    keepFocusInWindow();
    void olderAntennasQuery.refetch();
  }

  function toggleComparison() {
    setIsComparisonRequested((isRequested) => !isRequested);
  }

  let body: ReactNode;
  if (antennasQuery.isPending) {
    body = <AntennaLoading isPhone={isPhone} />;
  } else if (antennas === undefined) {
    body = <AntennaFailure error={antennasQuery.error} reportUrl={shownReport.url} onRetry={retryAntennas} />;
  } else if (antennas.length === 0) {
    body = <AntennaEmpty reportUrl={shownReport.url} alternativeReport={alternativeReport} onShowReport={showReport} />;
  } else {
    body = (
      <AntennaReportContent
        antennas={antennas}
        olderAntennas={olderAntennas}
        comparisonNotice={
          hasComparisonFailed ? (
            <AntennaComparisonNotice error={olderAntennasQuery.error} onRetry={hasOlderReadFailed ? retryComparison : undefined} />
          ) : null
        }
        color={brand?.color ?? null}
        selectedGroupKey={selectedGroupKey}
        onSelectedGroupKeyChange={setSelectedGroupKey}
        isPhone={isPhone}
      />
    );
  }

  return (
    <div ref={windowRef} tabIndex={-1} className={cn("relative outline-none", className)} style={style} role="dialog" aria-labelledby={titleId}>
      <div
        ref={contentRef}
        className={cn(
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl bg-background shadow-2xl",
          contentClassName,
        )}
      >
        <AntennaDialogHeader
          siteId={siteId}
          operatorName={operatorName}
          place={place}
          titleId={titleId}
          brand={brand}
          closeButtonRef={closeButtonRef}
          headerDragProps={headerDragProps}
          onClose={onClose}
        />
        <AntennaReportBar
          reportChoice={reportChoice}
          onShowReport={showReport}
          isComparisonPressed={isComparisonPressed}
          isComparisonBusy={isComparisonBusy}
          isComparisonDisabled={fillsBody}
          onToggleComparison={toggleComparison}
          isPhone={isPhone}
        />
        <div ref={scrollerRef} className="flex-1 overflow-y-auto custom-scrollbar scrollbar-gutter-stable" aria-busy={antennasQuery.isPending}>
          <div ref={bodyContentRef} className={cn("@container", fillsBody ? "flex min-h-full flex-col px-3 py-2 sm:px-4 sm:py-2.5" : null)}>
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
