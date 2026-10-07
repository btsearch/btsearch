import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { fetchPartnerIdentifiers, findPartnerOperator, resolveOwnNameFromPartner } from "../../data/partner";
import type { StationDraftApi } from "../../hooks/useStationDraft";
import { keepDigits } from "../../model/changes";
import { findDraftOperator } from "../../model/snapshots";
import { EDIT_LIMITS, listIdentifierKinds } from "../../model/validate";
import { DuplicateSiteIdNotice } from "./duplicateSiteIdNotice";
import { FieldGroup, getControlProps, getFieldColumnsClass, getStationFieldView } from "./stationFields";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { getOperatorShortLabel } from "@/features/station-details/station/utils/stations";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type IdentifierRowsProps = {
  edit: StationDraftApi;
  stationId: number | null;
  idPrefix: string;
};

const SITE_ID_EXAMPLE = "WWW12345";

function hasText(value: string | null): value is string {
  return value !== null && value !== "";
}

export function IdentifierRows({ edit, stationId, idPrefix }: IdentifierRowsProps) {
  const { t } = useTranslation(["common", "stations", "submissions"]);
  const [isSiteIdFocused, setIsSiteIdFocused] = useState(false);
  const [isFetchingPartner, setIsFetchingPartner] = useState(false);
  const { session, dispatch, lookups } = edit;
  const { station, place } = session.draft;
  const operator = findDraftOperator(session.draft, lookups.operatorsById);
  const kinds = listIdentifierKinds(operator);
  const hasNetworksFields = kinds.includes("networksId");
  const partner = hasNetworksFields ? findPartnerOperator(operator, lookups.operators) : null;
  const isLocked = !edit.canEdit;
  const isForm = session.kind === "form";
  const checksDuplicate = session.live === null && session.kind !== "review";
  const siteIdView = getStationFieldView(edit, "siteId", idPrefix);
  const ownNameView = getStationFieldView(edit, "operatorName", idPrefix);
  const networksIdView = getStationFieldView(edit, "networksId", idPrefix);
  const networksNameView = getStationFieldView(edit, "networksName", idPrefix);

  function fetchFromPartner() {
    if (stationId === null) return;

    setIsFetchingPartner(true);
    void fetchPartnerIdentifiers(stationId)
      .then((found) => {
        if (!hasText(found.networksId) && !hasText(found.networksName) && !hasText(found.operatorName)) {
          toast.info(t("submissions:sibling.notFound"));
          return;
        }

        const ownName = resolveOwnNameFromPartner(operator, station.siteId, place?.city ?? null, found.operatorName);
        if (hasText(found.networksId)) dispatch({ type: "setIdentifier", kind: "networksId", value: found.networksId });
        if (hasText(found.networksName)) dispatch({ type: "setIdentifier", kind: "networksName", value: found.networksName });
        if (hasText(ownName)) dispatch({ type: "setIdentifier", kind: "operatorName", value: ownName });
        toast.success(t("submissions:sibling.fetched"));
      })
      .catch(() => toast.error(t("submissions:sibling.fetchFailed")))
      .finally(() => setIsFetchingPartner(false));
  }

  return (
    <div className={cn("grid gap-y-3", getFieldColumnsClass(isForm))}>
      <FieldGroup view={siteIdView} label={t("labels.stationId")}>
        <div className="relative">
          <Input
            {...NO_AUTOFILL_PROPS}
            {...getControlProps(siteIdView)}
            value={station.siteId}
            onChange={(event) => dispatch({ type: "setStation", patch: { siteId: event.target.value } })}
            onFocus={() => setIsSiteIdFocused(true)}
            onBlur={() => setIsSiteIdFocused(false)}
            maxLength={EDIT_LIMITS.siteId}
            placeholder={isForm ? SITE_ID_EXAMPLE : undefined}
            disabled={isLocked}
            className={cn(isForm ? "font-mono" : null, siteIdView.className)}
          />
          {checksDuplicate ? (
            <div className="absolute top-full left-0 w-72 max-w-[calc(100vw-3rem)]">
              <DuplicateSiteIdNotice
                siteId={station.siteId}
                operatorId={station.operatorId}
                editKind={isForm ? "form" : "editor"}
                isFieldFocused={isSiteIdFocused}
              />
            </div>
          ) : null}
        </div>
      </FieldGroup>
      {kinds.includes("operatorName") ? (
        <FieldGroup view={ownNameView} label={t("labels.mnoName", { brand: getOperatorShortLabel(operator) })}>
          <Input
            {...NO_AUTOFILL_PROPS}
            {...getControlProps(ownNameView)}
            value={station.identifiers.operatorName}
            onChange={(event) => dispatch({ type: "setIdentifier", kind: "operatorName", value: event.target.value })}
            maxLength={EDIT_LIMITS.identifier}
            placeholder={t("placeholder.optional")}
            disabled={isLocked}
            className={ownNameView.className}
          />
        </FieldGroup>
      ) : null}
      {isForm ? <p className="col-span-full -mt-1.5 text-xs text-muted-foreground">{t("submissions:stationInfo.stationIdHint")}</p> : null}
      {hasNetworksFields ? (
        <>
          <FieldGroup view={networksIdView} label={t("labels.networksId")}>
            <Input
              type="text"
              inputMode="numeric"
              {...NO_AUTOFILL_PROPS}
              {...getControlProps(networksIdView)}
              value={station.identifiers.networksId}
              onChange={(event) => dispatch({ type: "setIdentifier", kind: "networksId", value: keepDigits(event.target.value) })}
              maxLength={EDIT_LIMITS.networksIdDigits}
              placeholder={t("stations:edit.stationCard.networksIdPlaceholder")}
              disabled={isLocked}
              className={cn("font-mono", networksIdView.className)}
            />
          </FieldGroup>
          <div className="flex min-w-0 flex-wrap items-start justify-end gap-2">
            <FieldGroup view={networksNameView} label={t("labels.networksName")} className="flex-[1_1_180px]">
              <Input
                {...NO_AUTOFILL_PROPS}
                {...getControlProps(networksNameView)}
                value={station.identifiers.networksName}
                onChange={(event) => dispatch({ type: "setIdentifier", kind: "networksName", value: event.target.value })}
                maxLength={EDIT_LIMITS.identifier}
                placeholder={t("placeholder.optional")}
                disabled={isLocked}
                className={networksNameView.className}
              />
            </FieldGroup>
            {stationId !== null && partner !== null && !isLocked ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchFromPartner}
                disabled={isFetchingPartner}
                focusableWhenDisabled
                className={cn(
                  "h-8 shrink-0 cursor-pointer gap-1.5 data-disabled:pointer-events-none data-disabled:opacity-50",
                  isForm ? "mt-[18px]" : "mt-[22px]",
                )}
              >
                <BrandMark brand={getOperatorBrand(partner, lookups.brands)} size={14} />
                {isFetchingPartner
                  ? t("submissions:sibling.fetching")
                  : t("submissions:sibling.fetchFrom", { brand: getOperatorShortLabel(partner) })}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
