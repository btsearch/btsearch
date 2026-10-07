import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { FULL_WIDTH_SEGMENTS_CLASS, SegmentedControl } from "../shared/referenceCards";
import { InlineError } from "@/components/ui/error-state";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { RegionCombobox } from "@/features/shared/filterPanel";
import { regionsQueryOptions } from "@/features/shared/lookups";

export type TeamScopeKind = "country" | "regions";

type TeamScopeFieldsProps = {
  countryCode: string;
  scope: TeamScopeKind;
  regionIds: number[];
  onScopeChange: (scope: TeamScopeKind) => void;
  onRegionIdsChange: (regionIds: number[]) => void;
};

export function TeamScopeFields({ countryCode, scope, regionIds, onScopeChange, onRegionIdsChange }: TeamScopeFieldsProps) {
  const { t } = useTranslation("admin");
  const scopeTitleId = useId();
  const { data: regions, isError, isFetching, refetch } = useQuery(regionsQueryOptions());

  const countryRegions = regions?.filter((region) => region.countryCode === countryCode);
  const hasNoRegions = countryRegions !== undefined && countryRegions.length === 0;
  const scopeOptions: { value: TeamScopeKind; label: string }[] = [
    { value: "country", label: t("users.shared.grantScope.wholeCountry") },
    { value: "regions", label: t("users.detail.grants.dialog.scopeRegions") },
  ];

  let regionPicker = <Skeleton className="h-8 w-full rounded-lg" />;
  if (countryRegions !== undefined) {
    regionPicker = (
      <div>
        <RegionCombobox
          regions={countryRegions}
          selectedRegions={regionIds}
          onChange={onRegionIdsChange}
          placeholder={t("users.detail.grants.dialog.regionsPlaceholder")}
        />
      </div>
    );
  } else if (isError) {
    regionPicker = (
      <InlineError size="sm" title={t("users.detail.grants.dialog.regionsLoadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
    );
  }

  return (
    <>
      <Field>
        <FieldTitle id={scopeTitleId}>{t("users.detail.grants.dialog.scope")}</FieldTitle>
        <SegmentedControl
          value={scope}
          options={scopeOptions}
          onValueChange={onScopeChange}
          ariaLabelledBy={scopeTitleId}
          disabled={hasNoRegions && scope === "country"}
          className={FULL_WIDTH_SEGMENTS_CLASS}
        />
        {hasNoRegions ? <FieldDescription>{t("reference.country.team.dialog.noRegions")}</FieldDescription> : null}
      </Field>
      {scope === "regions" ? (
        <Field>
          <FieldTitle>{t("users.detail.grants.dialog.regions")}</FieldTitle>
          {regionPicker}
          {countryRegions !== undefined && regionIds.length === 0 ? (
            <FieldDescription>{t("users.detail.grants.dialog.regionsHint")}</FieldDescription>
          ) : null}
        </Field>
      ) : null}
    </>
  );
}
