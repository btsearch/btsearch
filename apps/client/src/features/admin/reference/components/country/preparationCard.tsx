import { Alert02Icon, MapsIcon, Tick02Icon, UserShield01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { bandPlanQueryOptions } from "../../api/bandPlan";
import { teamGrantsQueryOptions } from "../../api/team";
import type { Country, TeamGrant } from "../../types";
import {
  ReferenceCard,
  ReferenceIconTile,
  ReferenceRow,
  ReferenceRowError,
  ReferenceRowSkeleton,
  TINTED_BUTTON_CLASS,
  scrollToReferenceSection,
} from "../shared/referenceCards";
import { COUNTRY_DEFAULT_VIEW_CARD_ID, COUNTRY_SECTION_IDS } from "./countrySections";
import { useCountryAvailability } from "./useCountryAvailability";
import { Button } from "@/components/ui/button";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Spinner } from "@/components/ui/spinner";
import { resolveDisplayName } from "@/features/admin/users/utils/identity";
import { operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { cn } from "@/lib/utils";

type PreparationTileProps = {
  isDone: boolean;
  optionalStepIcon?: IconSvgElement;
};

type PreparationRowProps = PreparationTileProps & {
  title: string;
  doneText: string;
  missingText: string;
  missingAction: ReactNode;
};

type PendingRowProps = {
  hasLoadFailed: boolean;
  isRetrying: boolean;
  onRetry: () => void;
};

type JumpButtonProps = {
  targetId: string;
  isTinted?: boolean;
  children: ReactNode;
};

const DONE_TILE_CLASS = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
const WARNING_TILE_CLASS = "bg-amber-500/10 text-amber-600 dark:text-amber-400";

function listMaintainerNames(maintainers: readonly TeamGrant[], language: string): string | null {
  const names = maintainers.map((grant) => (grant.user === null ? "" : resolveDisplayName(grant.user)));
  if (names.includes("")) return null;
  return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(names);
}

function PreparationTile({ isDone, optionalStepIcon }: PreparationTileProps) {
  if (isDone) return <ReferenceIconTile icon={Tick02Icon} className={DONE_TILE_CLASS} />;
  if (optionalStepIcon === undefined) return <ReferenceIconTile icon={Alert02Icon} className={WARNING_TILE_CLASS} />;
  return <ReferenceIconTile icon={optionalStepIcon} />;
}

function PreparationRow({ isDone, optionalStepIcon, title, doneText, missingText, missingAction }: PreparationRowProps) {
  return (
    <ReferenceRow
      media={<PreparationTile isDone={isDone} optionalStepIcon={optionalStepIcon} />}
      title={title}
      description={isDone ? doneText : missingText}
      wrap
    >
      {isDone ? null : missingAction}
    </ReferenceRow>
  );
}

function PendingRow({ hasLoadFailed, isRetrying, onRetry }: PendingRowProps) {
  const { t } = useTranslation("admin");

  if (!hasLoadFailed) return <ReferenceRowSkeleton />;
  return <ReferenceRowError title={t("reference.country.general.preparation.loadFailed")} onRetry={onRetry} isRetrying={isRetrying} />;
}

function JumpButton({ targetId, isTinted = false, children }: JumpButtonProps) {
  return (
    <Button
      type="button"
      variant={isTinted ? "ghost" : "outline"}
      size="sm"
      className={cn("cursor-pointer", isTinted && TINTED_BUTTON_CLASS)}
      onClick={() => scrollToReferenceSection(targetId)}
    >
      {children}
    </Button>
  );
}

export function PreparationCard({ country }: { country: Country }) {
  const { t, i18n } = useTranslation("admin");
  const regionsQuery = useQuery(regionsQueryOptions());
  const operatorsQuery = useQuery(operatorsQueryOptions());
  const bandPlanQuery = useQuery(bandPlanQueryOptions(country.code));
  const teamQuery = useQuery({ ...teamGrantsQueryOptions([country.code]), refetchOnMount: false });
  const availability = useCountryAvailability(country.code);

  const regionCount = regionsQuery.data?.filter((region) => region.countryCode === country.code).length;
  const operatorCount = operatorsQuery.data?.filter((operator) => operator.countryCode === country.code).length;
  const planSize = bandPlanQuery.data?.length;
  const maintainers = teamQuery.data?.filter((grant) => grant.role === "maintainer");

  return (
    <ReferenceCard>
      <ReferenceRow
        media={<CountryCodeTile code={country.code} size="md" />}
        title={t("reference.country.general.preparation.title")}
        description={t("reference.country.general.preparation.description")}
        wrap
      >
        <Button
          type="button"
          size="sm"
          className="cursor-pointer"
          disabled={availability.isPending}
          onClick={() => availability.mutate({ isVisible: true })}
        >
          {availability.isPending ? <Spinner /> : <HugeiconsIcon icon={ViewIcon} data-icon="inline-start" aria-hidden="true" />}
          {t("reference.country.general.preparation.show")}
        </Button>
      </ReferenceRow>
      {regionCount === undefined ? (
        <PendingRow hasLoadFailed={regionsQuery.isError} isRetrying={regionsQuery.isFetching} onRetry={() => void regionsQuery.refetch()} />
      ) : (
        <PreparationRow
          isDone={regionCount > 0}
          title={t("reference.country.regions.title")}
          doneText={`${regionCount.toLocaleString(i18n.language)} ${t("reference.country.hero.stats.regions", { count: regionCount })}`}
          missingText={t("reference.countries.none")}
          missingAction={
            <JumpButton targetId={COUNTRY_SECTION_IDS.regions} isTinted>
              {t("reference.country.regions.add")}
            </JumpButton>
          }
        />
      )}
      {operatorCount === undefined ? (
        <PendingRow hasLoadFailed={operatorsQuery.isError} isRetrying={operatorsQuery.isFetching} onRetry={() => void operatorsQuery.refetch()} />
      ) : (
        <PreparationRow
          isDone={operatorCount > 0}
          title={t("nav:items.operators")}
          doneText={`${operatorCount.toLocaleString(i18n.language)} ${t("reference.country.hero.stats.operators", { count: operatorCount })}`}
          missingText={t("reference.countries.none")}
          missingAction={
            <JumpButton targetId={COUNTRY_SECTION_IDS.networks} isTinted>
              {t("reference.country.networks.operators.add")}
            </JumpButton>
          }
        />
      )}
      {planSize === undefined ? (
        <PendingRow hasLoadFailed={bandPlanQuery.isError} isRetrying={bandPlanQuery.isFetching} onRetry={() => void bandPlanQuery.refetch()} />
      ) : (
        <PreparationRow
          isDone={planSize > 0}
          title={t("reference.country.bandPlan.title")}
          doneText={t("admin:auditLogs.counts.bands", { count: planSize })}
          missingText={t("reference.country.general.preparation.planEmpty")}
          missingAction={
            <JumpButton targetId={COUNTRY_SECTION_IDS.bandPlan} isTinted>
              {t("reference.country.general.preparation.addBands")}
            </JumpButton>
          }
        />
      )}
      <PreparationRow
        isDone={country.defaultView !== null}
        optionalStepIcon={MapsIcon}
        title={t("reference.country.general.defaultView.title")}
        doneText={t("reference.country.general.preparation.viewSet")}
        missingText={t("reference.country.general.defaultView.notSet")}
        missingAction={<JumpButton targetId={COUNTRY_DEFAULT_VIEW_CARD_ID}>{t("reference.country.general.preparation.setView")}</JumpButton>}
      />
      {maintainers === undefined ? (
        <PendingRow hasLoadFailed={teamQuery.isError} isRetrying={teamQuery.isFetching} onRetry={() => void teamQuery.refetch()} />
      ) : (
        <PreparationRow
          isDone={maintainers.length > 0}
          optionalStepIcon={UserShield01Icon}
          title={t("admin:users.shared.grantRoles.maintainer")}
          doneText={listMaintainerNames(maintainers, i18n.language) ?? t("reference.countries.team.maintainers", { count: maintainers.length })}
          missingText={t("reference.country.general.preparation.noMaintainer")}
          missingAction={<JumpButton targetId={COUNTRY_SECTION_IDS.team}>{t("admin:users.detail.grants.add")}</JumpButton>}
        />
      )}
    </ReferenceCard>
  );
}
