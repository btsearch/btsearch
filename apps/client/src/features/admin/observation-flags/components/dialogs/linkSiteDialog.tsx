import { Alert02Icon, Link04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Band, ObservedSite, Station, StationCell } from "@openbts/shared/contract";
import type { CellRat } from "@openbts/shared/contract/constants";
import { calculateDistance } from "@openbts/shared/geo";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { nearestStationsQueryOptions, updateObservedSite } from "../../api/sites";
import { type QueueConflict, isForbidden, isLinkedStationMissing, reportQueueError } from "../../model/conflicts";
import { formatStationLabel, getOperatorName, getRatName, joinParts } from "../../model/format";
import { QueueDialog } from "./queueDialog";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { SearchField } from "@/features/admin/reference/components/shared/searchField";
import { getOperatorLook, useMapLookups } from "@/features/map/data/mapLookups";
import { type StationSearchHit, stationSearchQueryOptions } from "@/features/map/searchApi";
import { formatBandMhzLabel } from "@/features/station-details/station/utils/bands";
import { RAT_ORDER } from "@/features/station-editing/model/ratFields";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ApiResponseError } from "@/lib/api";
import { formatDistance } from "@/lib/format";
import { cn } from "@/lib/utils";

type ChoiceCell = Pick<StationCell, "rat"> & { band?: Band };

export type StationChoice = {
  id: number;
  label: string;
  isNumbered: boolean;
  operatorId: number | null;
  place: { latitude: number; longitude: number; city: string | null; address: string | null } | null;
  cells: readonly ChoiceCell[];
};

type LinkSiteDialogProps = {
  site: ObservedSite;
  suggestedStation: StationChoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: (site: ObservedSite, station: StationChoice) => void;
  onConflict: (conflict: QueueConflict) => void;
};

type LinkFormProps = Omit<LinkSiteDialogProps, "open" | "onOpenChange"> & {
  onPendingChange: (isPending: boolean) => void;
  onCancel: () => void;
};

type ChoiceRowProps = {
  choice: StationChoice;
  site: ObservedSite;
};

const SEARCH_DELAY_MS = 300;
const VALIDATION_STATUS = 400;
const NO_STATIONS: Station[] = [];
const NO_HITS: StationSearchHit[] = [];

export function toStationChoice(station: Station | StationSearchHit): StationChoice {
  const { location } = station;
  return {
    id: station.id,
    label: formatStationLabel(station),
    isNumbered: station.siteId !== null,
    operatorId: station.operatorId,
    place:
      location === null || location === undefined
        ? null
        : { latitude: location.latitude, longitude: location.longitude, city: location.city, address: location.address },
    cells: station.cells ?? [],
  };
}

function listBandsByRat(cells: readonly ChoiceCell[], language: string): [CellRat, string][] {
  return RAT_ORDER.flatMap((rat): [CellRat, string][] => {
    const labels = [...new Set(cells.flatMap((cell) => (cell.rat === rat && cell.band?.labelMhz ? [cell.band.labelMhz] : [])))].sort(
      (left, right) => left - right,
    );
    return labels.length === 0 ? [] : [[rat, labels.map((labelMhz) => formatBandMhzLabel(labelMhz, language)).join(" ")]];
  });
}

function ChoiceRow({ choice, site }: ChoiceRowProps) {
  const { t, i18n } = useTranslation("admin");
  const { lookups } = useMapLookups();
  const { operator, brand } = getOperatorLook(lookups, choice.operatorId);
  const { place } = choice;
  const distance =
    place === null || site.latitude === null || site.longitude === null
      ? null
      : calculateDistance(site.latitude, site.longitude, place.latitude, place.longitude);
  const placeText = joinParts([place?.city ?? null, place?.address ?? null]);
  const bands = listBandsByRat(choice.cells, i18n.language);

  return (
    <label className="flex cursor-pointer items-start gap-2.5 border-b px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50 has-[[data-checked]]:bg-primary/10">
      <RadioGroupItem value={choice.id} className="mt-0.5 cursor-pointer" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          {operator === null ? null : (
            <>
              <BrandMark brand={brand} size={16} />
              <span className="text-xs font-medium">{operator.name}</span>
            </>
          )}
          <span className={cn("min-w-0 truncate text-sm font-medium tabular-nums", choice.isNumbered ? "font-mono" : null)}>{choice.label}</span>
          {distance === null ? null : (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
              {t("observationFlags.evidence.choices.fromEstimate", { distance: formatDistance(distance, i18n.language) })}
            </span>
          )}
        </span>
        {placeText === "" ? null : <span className="mt-1 truncate text-[11px] leading-4 text-muted-foreground">{placeText}</span>}
        {bands.length === 0 ? null : (
          <span className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
            {bands.map(([rat, labels]) => (
              <span key={rat} className="mr-2">
                <span className="font-bold text-foreground/70">{getRatName(rat)}</span> <span className="font-mono font-medium">{labels}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </label>
  );
}

function LinkForm({ site, suggestedStation, onLinked, onConflict, onPendingChange, onCancel }: LinkFormProps) {
  const { t } = useTranslation(["admin", "common"]);
  const { lookups } = useMapLookups();
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<number | null>(suggestedStation?.id ?? null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const searchText = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
  const isSearching = searchText !== "";
  const operatorName = getOperatorName(site.operatorId, lookups) ?? "";
  const point = site.latitude === null || site.longitude === null ? null : { latitude: site.latitude, longitude: site.longitude };
  const operatorIds = site.operatorId === null ? [] : [site.operatorId];
  const nearestQuery = useQuery({ ...nearestStationsQueryOptions(point, operatorIds), enabled: suggestedStation === null && point !== null });
  const searchQuery = useQuery(stationSearchQueryOptions(searchText));

  const nearest = suggestedStation === null ? (nearestQuery.data ?? NO_STATIONS).map(toStationChoice) : [suggestedStation];
  const hits = (searchQuery.data?.hits ?? NO_HITS).map(toStationChoice);
  const choices = isSearching ? hits : nearest;
  const picked = [...nearest, ...hits].find((choice) => choice.id === pickedId) ?? null;
  const isLoadingChoices = isSearching ? searchQuery.isLoading : nearestQuery.isLoading;

  function describeRefusal(error: unknown, station: StationChoice): string | null {
    if (isLinkedStationMissing(error)) return t("observationFlags.link.stationGone", { station: station.label });
    if (!(error instanceof ApiResponseError) || error.status !== VALIDATION_STATUS) return null;
    const stationOperator = getOperatorName(station.operatorId, lookups) ?? "";
    return t("observationFlags.link.wrongOperator", { station: station.label, stationOperator, operator: operatorName });
  }

  const linkMutation = useMutation({
    mutationFn: (station: StationChoice) => updateObservedSite(site.id, { handLink: { stationId: station.id } }),
    onMutate: () => {
      setRefusal(null);
      onPendingChange(true);
    },
    onSettled: () => onPendingChange(false),
    onSuccess: (linkedSite, station) => onLinked(linkedSite, station),
    onError: (error, station) => {
      const stationRefusal = describeRefusal(error, station);
      if (stationRefusal !== null) setRefusal(stationRefusal);
      else if (isForbidden(error)) onConflict({ kind: "linkForbidden" });
      else reportQueueError(error, onConflict);
    },
  });
  const isPending = linkMutation.isPending;

  let lead = t("observationFlags.link.nearest", { operator: operatorName });
  if (isSearching) lead = t("observationFlags.link.results");
  else if (suggestedStation !== null) lead = t("observationFlags.link.suggested");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (picked !== null && !isPending) linkMutation.mutate(picked);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader className="pr-7">
        <DialogTitle>{t("observationFlags.link.title")}</DialogTitle>
        <DialogDescription>{t("observationFlags.link.description")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          label={t("common:actions.selectStation")}
          placeholder={t("observationFlags.link.searchPlaceholder")}
          showLabel={false}
          inputClassName="h-9"
        />
        <span className="text-xs font-medium text-muted-foreground">{lead}</span>
        {isLoadingChoices ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : choices.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">{t("observationFlags.link.noStations")}</p>
        ) : (
          <RadioGroup
            aria-label={t("observationFlags.link.stationLabel")}
            value={pickedId}
            onValueChange={(value) => {
              if (typeof value !== "number") return;
              setPickedId(value);
              setRefusal(null);
            }}
            disabled={isPending}
            className="gap-0 overflow-hidden rounded-lg border"
          >
            {choices.map((choice) => (
              <ChoiceRow key={choice.id} choice={choice} site={site} />
            ))}
          </RadioGroup>
        )}
        {refusal === null ? (
          <p className="text-xs text-muted-foreground">{t("observationFlags.link.rule", { operator: operatorName })}</p>
        ) : (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
            <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span>{refusal}</span>
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={picked === null || refusal !== null || isPending}>
          {isPending ? <Spinner /> : <HugeiconsIcon icon={Link04Icon} data-icon="inline-start" aria-hidden="true" />}
          {t("observationFlags.link.confirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function LinkSiteDialog({ open, onOpenChange, ...formProps }: LinkSiteDialogProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <QueueDialog open={open} isPending={isPending} onOpenChange={onOpenChange}>
      <LinkForm {...formProps} onPendingChange={setIsPending} onCancel={() => onOpenChange(false)} />
    </QueueDialog>
  );
}
