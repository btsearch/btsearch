import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { OfficialSource } from "@openbts/shared/contract";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { type AzimuthSource, type FetchedAzimuths, fetchEmfAzimuths, fetchPartnerAzimuths, fetchRegisterAzimuths } from "../../data/azimuthSources";
import { findPartnerOperator } from "../../data/partner";
import type { StationDraftApi } from "../../hooks/useStationDraft";
import { normalizeText } from "../../model/changes";
import { findDraftOperator } from "../../model/snapshots";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSiteSources } from "@/features/official/queries";
import { OfficialSourceLogo } from "@/features/station-details/components/officialSourceLogo";
import { SI2PEMLogo } from "@/features/station-details/components/si2pemLogo";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { getOperatorShortLabel } from "@/features/station-details/station/utils/stations";

type FetchAzimuthsMenuProps = {
  edit: StationDraftApi;
  stationId: number | null;
  onFetched: (fetched: FetchedAzimuths, partnerName: string | null) => void;
};

type SourceItemProps = {
  lead: ReactNode;
  title: string;
  hint: string;
  onPick: () => void;
};

type SourceRequest = {
  source: AzimuthSource;
  official: OfficialSource | null;
  siteId: string;
  latitude: number | null;
  longitude: number | null;
  operatorId: number | null;
  stationId: number | null;
};

const NO_SOURCES: readonly OfficialSource[] = [];
const NOT_FOUND_KEYS: Record<AzimuthSource, string> = {
  emf: "submissions:azimuthFetch.si2pem.notFound",
  register: "submissions:azimuthFetch.register.notFound",
  partner: "submissions:siblingSectors.notFound",
};
const FAILED_KEYS: Record<AzimuthSource, string> = {
  emf: "submissions:azimuthFetch.si2pem.fetchFailed",
  register: "submissions:azimuthFetch.register.fetchFailed",
  partner: "submissions:siblingSectors.fetchFailed",
};

function fetchAzimuths({ source, official, siteId, latitude, longitude, operatorId, stationId }: SourceRequest): Promise<FetchedAzimuths | null> {
  if (source === "emf" && latitude !== null && longitude !== null) return fetchEmfAzimuths({ siteId, latitude, longitude });
  if (source === "register" && official !== null && operatorId !== null) return fetchRegisterAzimuths({ siteId, operatorId, source: official });
  if (source === "partner" && stationId !== null) return fetchPartnerAzimuths(stationId);
  return Promise.resolve(null);
}

function SourceItem({ lead, title, hint, onPick }: SourceItemProps) {
  return (
    <DropdownMenuItem onClick={onPick} className="cursor-pointer items-start gap-2 py-1.5">
      <span className="mt-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center text-muted-foreground">{lead}</span>
      <span className="min-w-0 flex-1">
        {title}
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </DropdownMenuItem>
  );
}

export function FetchAzimuthsMenu({ edit, stationId, onFetched }: FetchAzimuthsMenuProps) {
  const { t } = useTranslation(["stations", "submissions"]);
  const [isFetching, setIsFetching] = useState(false);
  const { session, lookups } = edit;
  const { countryCode } = lookups;
  const siteSources = useSiteSources(countryCode);
  const { station, place } = session.draft;
  const siteId = normalizeText(station.siteId);
  const latitude = place?.latitude ?? null;
  const longitude = place?.longitude ?? null;
  const operator = findDraftOperator(session.draft, lookups.operatorsById);
  const operatorId = operator?.id ?? null;
  const isOfficialCountry = countryCode !== null && lookups.countriesByCode.get(countryCode)?.capabilities.official === true;
  const registerSources = siteId !== "" && operatorId !== null && isOfficialCountry ? siteSources : NO_SOURCES;
  const partner = findPartnerOperator(operator, lookups.operators);
  const partnerName = getOperatorShortLabel(partner);
  const isNewInEditor = session.kind === "editor" && session.live === null;
  const hasEmf = siteId !== "" && latitude !== null && longitude !== null && !isNewInEditor;
  const hasPartner = stationId !== null && partner !== null;

  function fetchFrom(source: AzimuthSource, official: OfficialSource | null = null) {
    const texts = { source: official?.shortName };
    setIsFetching(true);
    void fetchAzimuths({ source, official, siteId, latitude, longitude, operatorId, stationId })
      .then((fetched) => {
        if (fetched === null || fetched.degrees.length === 0) toast.info(t(NOT_FOUND_KEYS[source], texts));
        else onFetched(fetched, partnerName);
      })
      .catch(() => toast.error(t(FAILED_KEYS[source], texts)))
      .finally(() => setIsFetching(false));
  }

  if (!hasEmf && registerSources.length === 0 && !hasPartner) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetching}
            focusableWhenDisabled
            className="h-7 cursor-pointer gap-1.5 text-xs data-disabled:pointer-events-none data-disabled:opacity-50"
          />
        }
      >
        {isFetching ? t("submissions:sibling.fetching") : t("submissions:azimuthFetch.fetch")}
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {hasEmf ? (
          <SourceItem
            lead={<SI2PEMLogo className="h-3" />}
            title="SI2PEM"
            hint={t("edit.azimuths.sources.emfHint")}
            onPick={() => fetchFrom("emf")}
          />
        ) : null}
        {registerSources.map((registerSource) => (
          <SourceItem
            key={registerSource.key}
            lead={<OfficialSourceLogo source={registerSource} className="size-auto h-3.5 w-7" />}
            title={registerSource.shortName}
            hint={t("edit.azimuths.sources.registerHint")}
            onPick={() => fetchFrom("register", registerSource)}
          />
        ))}
        {hasPartner ? (
          <SourceItem
            lead={<BrandMark brand={getOperatorBrand(partner, lookups.brands)} size={16} />}
            title={t("edit.azimuths.sources.partner", { brand: partnerName })}
            hint={t("edit.azimuths.sources.partnerHint")}
            onPick={() => fetchFrom("partner")}
          />
        ) : null}
        <p className="px-1.5 pt-1.5 pb-1 text-xs text-muted-foreground">{t("edit.azimuths.sources.note")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
