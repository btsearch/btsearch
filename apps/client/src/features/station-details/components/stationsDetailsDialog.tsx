import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { OfficialSite, OfficialSitePermit } from "@openbts/shared/contract";
import { OFFICIAL_SITE_INCLUDES } from "@openbts/shared/contract/constants";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { stationPermitsQueryOptions } from "../queries";
import { stationRecordQueryOptions } from "../station/api";
import { StationPanel } from "../station/components/stationPanel";
import { OfficialSourceCredit } from "./officialSourceCredit";
import { PermitsList } from "./permitsList";
import { ShareButton } from "./shareButton";
import { StationDetailsError } from "./stationDetailsError";
import { stationDialogHeaderIconActionClassName, stationDialogPrimaryActionClassName } from "./stationDialogHeaderStyles";
import {
  StationDialogActions,
  StationDialogHeading,
  StationDialogHeadingSkeleton,
  StationDialogShell,
  StationDialogToolbarSkeleton,
  StationSourceSwitch,
} from "./stationDialogShell";
import { StationInfoCard } from "./stationInfoCard";
import { InlineError, StaleDataNotice } from "@/components/ui/error-state";
import type { FloatingDialogPanelFrameProps, StationDialogTarget } from "@/features/floating-dialogs/types";
import { hasCountryCapability } from "@/features/map/data/mapFilters";
import { getOfficialSiteMapHash } from "@/features/map/mapLinks";
import { officialSiteQueryOptions, useOfficialSource } from "@/features/official/queries";
import { brandsQueryOptions, countriesQueryOptions, findOperator, operatorsQueryOptions } from "@/features/shared/lookups";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { toV1OperatorMnc } from "@/features/station-details/station/utils/stations";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";
import type { StationSource } from "@/types/station";

type StationDialogPanelProps = FloatingDialogPanelFrameProps & {
  stationId: number;
  switchedFrom?: StationDialogTarget;
  onSwitchStation?: (target: StationDialogTarget) => void;
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
};

type StationDetailsDialogPanelProps = StationDialogPanelProps & {
  source: StationSource;
  officialSite?: OfficialSite;
  locationId?: number;
  showPhotoPanel?: boolean;
  onContentLayoutChange?: () => void;
};

const NO_PERMITS: OfficialSitePermit[] = [];

export function StationDetailsDialogPanel({
  source,
  officialSite,
  locationId,
  showPhotoPanel,
  onContentLayoutChange,
  ...panelProps
}: StationDetailsDialogPanelProps) {
  if (source === "official") return <OfficialSiteDialogPanel placeholder={officialSite} {...panelProps} />;
  return <StationPanel locationId={locationId} showPhotoPanel={showPhotoPanel} onContentLayoutChange={onContentLayoutChange} {...panelProps} />;
}

type OfficialSiteDialogPanelProps = StationDialogPanelProps & {
  placeholder?: OfficialSite;
};

function OfficialSiteDialogPanel({
  stationId,
  placeholder,
  switchedFrom,
  onClose,
  onSwitchStation,
  onStartTerrainProfile,
  ...frameProps
}: OfficialSiteDialogPanelProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const { data: session } = authClient.useSession();
  const userRole = session?.user?.role as string | undefined;
  const isAdmin = userRole === "admin" || userRole === "editor";
  const isLoggedIn = !!session?.user;

  const { data, isLoading, isFetching, error, errorUpdateCount, refetch } = useQuery(officialSiteQueryOptions(stationId, OFFICIAL_SITE_INCLUDES));
  const { data: operators, isLoading: isOperatorsLoading } = useQuery(operatorsQueryOptions());
  const { data: brands } = useQuery(brandsQueryOptions());
  const { data: countries } = useQuery(countriesQueryOptions());

  const site = data ?? placeholder;
  const officialSource = useOfficialSource(site?.sourceKey);
  const operatorId = site?.operatorId ?? null;
  const operator = findOperator(operators, operatorId);
  const operatorBrand = getOperatorBrand(operator, brands);
  const operatorName = operator?.name ?? t("main:unknownOperator");
  const isOperatorLoading = operatorId !== null && isOperatorsLoading;
  const showDetailsError = !data && (error !== null || (isFetching && errorUpdateCount > 0));
  const siteId = site?.siteId ?? "";
  const location = site?.location;
  const shareSourcePrefix = officialSource ? `${officialSource.shortName}: ` : "";
  const sharePlace = location ? [location.city || t("common:labels.unknownLocation"), location.address].filter(Boolean).join(" ") : "";
  const internalStationId = data?.stationIds.at(0);
  const registerSiteId = data !== undefined && internalStationId === undefined ? data.siteId : null;
  const internalTarget: StationDialogTarget | undefined =
    internalStationId === undefined ? switchedFrom : { source: "internal", id: internalStationId };
  const sourceSwitch =
    onSwitchStation && internalTarget && site && officialSource ? (
      <StationSourceSwitch
        source="official"
        officialLabel={officialSource.shortName}
        onSwitch={() => onSwitchStation({ ...internalTarget, switchedFrom: { source: "official", id: site.id, officialSite: site } })}
        onPrefetch={() => {
          void queryClient.prefetchQuery(stationRecordQueryOptions(internalTarget.id));
          void queryClient.prefetchQuery(stationPermitsQueryOptions(internalTarget.id));
        }}
      />
    ) : null;

  return (
    <StationDialogShell
      {...frameProps}
      onClose={onClose}
      operatorBrand={operatorBrand}
      sourceSwitch={sourceSwitch}
      enterFrom={switchedFrom ? "right" : undefined}
      heading={
        site && !isOperatorLoading ? (
          <StationDialogHeading
            operatorName={operatorName}
            operatorBrand={operatorBrand}
            stationCode={siteId}
            location={location}
            createdAt={site.createdAt}
            updatedAt={site.updatedAt}
          />
        ) : isLoading || isOperatorLoading ? (
          <StationDialogHeadingSkeleton />
        ) : null
      }
      toolbar={
        site ? (
          location && (isLoggedIn || onStartTerrainProfile) ? (
            <StationDialogActions
              source="official"
              id={site.id}
              stationCode={siteId}
              operatorId={operatorId}
              operatorName={operatorName}
              countryCode={location.countryCode}
              location={location}
              onStartTerrainProfile={onStartTerrainProfile}
              onClose={onClose}
            />
          ) : null
        ) : isLoading ? (
          <StationDialogToolbarSkeleton />
        ) : null
      }
      actions={
        site ? (
          <>
            {location ? (
              <ShareButton
                title={`${siteId} (${operatorName})`}
                text={`${shareSourcePrefix}${siteId} (${operatorName}) - ${sharePlace}`}
                url={`${window.location.origin}/#${getOfficialSiteMapHash(site.id, location)}`}
                size="md"
                className={stationDialogHeaderIconActionClassName}
              />
            ) : null}
            {registerSiteId !== null && isAdmin ? (
              <Link
                to="/admin/stations/$id"
                params={{ id: "new" }}
                search={{ officialSite: registerSiteId }}
                className={stationDialogPrimaryActionClassName}
                onClick={onClose}
              >
                <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                <span className="hidden sm:inline">{t("common:actions.createStation")}</span>
              </Link>
            ) : registerSiteId !== null && isLoggedIn && settings?.features.submissions ? (
              <Link to="/submission" search={{ officialSite: registerSiteId }} className={stationDialogPrimaryActionClassName} onClick={onClose}>
                <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                <span className="hidden sm:inline">{t("common:actions.createStation")}</span>
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      {site ? (
        <div className="px-3 py-4 space-y-6 sm:p-6 sm:space-y-8">
          {showDetailsError ? (
            <InlineError
              title={t("dialog.detailsLoadErrorTitle")}
              description={t("dialog.detailsLoadErrorDescription")}
              onRetry={() => refetch()}
              isRetrying={isFetching}
            />
          ) : null}
          {error && data ? (
            <div className="mb-3 flex justify-center">
              <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} />
            </div>
          ) : null}
          <StationInfoCard
            source="official"
            stationCode={siteId}
            operator={{ name: operatorName, mnc: toV1OperatorMnc(operator) }}
            location={location}
            emfSite={location && hasCountryCapability(countries, location.countryCode, "emf") ? { officialSiteId: site.id } : undefined}
            onClose={onClose}
          />
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {officialSource ? t("tabs.permits", { source: officialSource.shortName }) : t("tabs.registerPermits")}
              </h3>
              {officialSource ? <OfficialSourceCredit sourceKey={officialSource.key} source={officialSource} /> : null}
            </div>
            <PermitsList
              permits={site.permits ?? NO_PERMITS}
              sourceName={officialSource?.shortName ?? null}
              isExternalLoading={site.permits === undefined}
            />
          </section>
        </div>
      ) : isLoading ? (
        <div className="px-3 py-4 sm:p-6">
          <PermitsList permits={NO_PERMITS} sourceName={null} isExternalLoading />
        </div>
      ) : error ? (
        <StationDetailsError error={error} onRetry={() => refetch()} isRetrying={isFetching} onClose={onClose} />
      ) : null}
    </StationDialogShell>
  );
}
