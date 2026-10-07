import { ArrowRight01Icon, LockIcon, Radio01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { bandPlanQueryOptions } from "../../api/bandPlan";
import { stationBreakdownQueryOptions } from "../../api/statistics";
import type { Band, Country } from "../../types";
import { type BandGroup, groupBands, sumCellsByBand } from "../../utils/bands";
import { CountBadge } from "../shared/cardParts";
import { CenteredCardState, ReferenceCard, ReferenceCardHeader, ReferenceCardNote, ReferenceRowError } from "../shared/referenceCards";
import { ReferenceSection } from "../shared/referenceSection";
import { BandPlanMark, BandPlanPill } from "./bandPlanPill";
import { COUNTRY_SECTION_IDS } from "./countrySections";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { bandsQueryOptions } from "@/features/shared/lookups";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

type BandPlanSectionProps = {
  country: Country;
  canEdit: boolean;
};

type BandPlanGroupRowProps = {
  countryCode: string;
  group: BandGroup;
  bands: Band[];
  planBandIds: ReadonlySet<number>;
  cellsByBand: ReadonlyMap<number, number>;
  canEdit: boolean;
};

type BandPlanBodyProps = {
  countryCode: string;
  bands: Band[] | undefined;
  planBandIds: ReadonlySet<number>;
  cellsByBand: ReadonlyMap<number, number>;
  canEdit: boolean;
  isLoading: boolean;
  hasLoadFailed: boolean;
  isRetrying: boolean;
  onRetry: () => void;
};

const NO_CELLS: ReadonlyMap<number, number> = new Map();
const GROUP_ROW_CLASS = "flex flex-col gap-2 border-t px-4 py-3.5 sm:px-5 md:flex-row md:items-start md:gap-4";
const GROUP_LABEL_CLASS = cn(
  "flex shrink-0 items-center justify-between gap-3",
  "md:w-33 md:flex-col md:items-start md:justify-start md:gap-0.5 md:pt-1.5",
);
const GROUP_BANDS_CLASS = "flex min-w-0 flex-1 flex-wrap gap-1.5";
const ALL_BANDS_LINK_CLASS = cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground");
const SKELETON_GROUPS = [
  ["w-18", "w-28", "w-24"],
  ["w-28", "w-20", "w-28", "w-20"],
  ["w-28", "w-24", "w-20", "w-28", "w-24", "w-28", "w-20"],
];

function BandPlanSkeleton() {
  return (
    <div aria-hidden="true">
      {SKELETON_GROUPS.map((pillWidths, groupIndex) => (
        <div key={groupIndex} className={GROUP_ROW_CLASS}>
          <div className={GROUP_LABEL_CLASS}>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-10" />
          </div>
          <div className={GROUP_BANDS_CLASS}>
            {pillWidths.map((width, pillIndex) => (
              <Skeleton key={pillIndex} className={cn("h-8 rounded-lg", width)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BandPlanGroupRow({ countryCode, group, bands, planBandIds, cellsByBand, canEdit }: BandPlanGroupRowProps) {
  const { t, i18n } = useTranslation("admin");
  const labelId = useId();

  const inPlanCount = bands.filter((band) => planBandIds.has(band.id)).length;

  return (
    <div className={GROUP_ROW_CLASS}>
      <div className={GROUP_LABEL_CLASS}>
        <span id={labelId} className="inline-flex items-center gap-1.5 text-sm leading-5 font-medium whitespace-nowrap">
          <RatGenerationLabel rat={group.generationRat} />
          {group.label}
        </span>
        <span className="text-xs leading-4 text-muted-foreground tabular-nums">
          {canEdit
            ? t("reference.country.bandPlan.planCount", {
                inPlan: inPlanCount.toLocaleString(i18n.language),
                total: bands.length.toLocaleString(i18n.language),
              })
            : t("common:labels.bands", { count: bands.length })}
        </span>
      </div>
      {canEdit ? (
        <div role="group" aria-labelledby={labelId} className={GROUP_BANDS_CLASS}>
          {bands.map((band) => (
            <BandPlanPill
              key={band.id}
              countryCode={countryCode}
              band={band}
              isInPlan={planBandIds.has(band.id)}
              cellCount={cellsByBand.get(band.id) ?? 0}
            />
          ))}
        </div>
      ) : (
        <ul aria-labelledby={labelId} className={GROUP_BANDS_CLASS}>
          {bands.map((band) => (
            <BandPlanMark key={band.id} band={band} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BandPlanBody({ countryCode, bands, planBandIds, cellsByBand, canEdit, isLoading, hasLoadFailed, isRetrying, onRetry }: BandPlanBodyProps) {
  const { t } = useTranslation("admin");

  if (hasLoadFailed) {
    return (
      <div className="border-t">
        <ReferenceRowError title={t("reference.country.bandPlan.loadFailed")} onRetry={onRetry} isRetrying={isRetrying} />
      </div>
    );
  }
  if (bands === undefined || isLoading) return <BandPlanSkeleton />;
  if (bands.length === 0) {
    return (
      <CenteredCardState
        icon={Radio01Icon}
        title={t("reference.country.bandPlan.noBands.title")}
        description={canEdit ? t("reference.country.bandPlan.noBands.description") : t("reference.country.bandPlan.noBands.readOnlyDescription")}
      />
    );
  }

  const shownBands = canEdit ? bands : bands.filter((band) => planBandIds.has(band.id));
  if (shownBands.length === 0) {
    return (
      <CenteredCardState
        icon={Radio01Icon}
        title={t("reference.country.bandPlan.empty.title")}
        description={t("reference.country.bandPlan.empty.description")}
      />
    );
  }

  return (
    <>
      {groupBands(shownBands).map(({ group, bands: bandsOfGroup }) => (
        <BandPlanGroupRow
          key={group.key}
          countryCode={countryCode}
          group={group}
          bands={bandsOfGroup}
          planBandIds={planBandIds}
          cellsByBand={cellsByBand}
          canEdit={canEdit}
        />
      ))}
    </>
  );
}

export function BandPlanSection({ country, canEdit }: BandPlanSectionProps) {
  const { t, i18n } = useTranslation("admin");
  const isMobile = useIsMobile();
  const { data: bands, isError: hasBandsError, isFetching: isFetchingBands, refetch: refetchBands } = useQuery(bandsQueryOptions());
  const { data: plan, isError: hasPlanError, isFetching: isFetchingPlan, refetch: refetchPlan } = useQuery(bandPlanQueryOptions(country.code));
  const { data: breakdownRows, isLoading: isLoadingCells } = useQuery({ ...stationBreakdownQueryOptions("band"), enabled: canEdit });

  const hasBandsLoadFailed = bands === undefined && hasBandsError;
  const hasPlanLoadFailed = plan === undefined && hasPlanError;
  const isLoading = bands === undefined || plan === undefined || isLoadingCells;
  const planBandIds = new Set(plan);
  const cellsByBand = breakdownRows === undefined ? NO_CELLS : sumCellsByBand(breakdownRows, country.code);
  const inPlanCount = bands === undefined ? 0 : bands.filter((band) => planBandIds.has(band.id)).length;

  let description = t("reference.country.bandPlan.descriptionReadOnly");
  if (canEdit) description = isMobile ? t("reference.country.bandPlan.descriptionTouch") : t("reference.country.bandPlan.description");

  function retryLoad() {
    if (hasBandsLoadFailed) void refetchBands();
    if (hasPlanLoadFailed) void refetchPlan();
  }

  return (
    <ReferenceSection id={COUNTRY_SECTION_IDS.bandPlan} title={t("reference.country.bandPlan.title")}>
      <ReferenceCard>
        <ReferenceCardHeader
          title={t("reference.country.bandPlan.title")}
          description={description}
          badge={
            bands === undefined || isLoading ? undefined : (
              <CountBadge>
                {canEdit
                  ? t("reference.country.bandPlan.planCount", {
                      inPlan: inPlanCount.toLocaleString(i18n.language),
                      total: bands.length.toLocaleString(i18n.language),
                    })
                  : inPlanCount.toLocaleString(i18n.language)}
              </CountBadge>
            )
          }
          action={
            canEdit && !isMobile ? (
              <Link to="/admin/bands" className={ALL_BANDS_LINK_CLASS}>
                {t("common:labels.allBands")}
                <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" aria-hidden="true" />
              </Link>
            ) : null
          }
        />
        <BandPlanBody
          countryCode={country.code}
          bands={bands}
          planBandIds={planBandIds}
          cellsByBand={cellsByBand}
          canEdit={canEdit}
          isLoading={isLoading}
          hasLoadFailed={hasBandsLoadFailed || hasPlanLoadFailed}
          isRetrying={isFetchingBands || isFetchingPlan}
          onRetry={retryLoad}
        />
        {canEdit ? <ReferenceCardNote icon={LockIcon}>{t("reference.country.bandPlan.note")}</ReferenceCardNote> : null}
      </ReferenceCard>
    </ReferenceSection>
  );
}
