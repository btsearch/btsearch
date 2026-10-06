import { Location01Icon, LocationCheck01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Region } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { type PickerLocation, toPlacePoint } from "../../data/places";
import { EDIT_LIMITS } from "../../model/validate";
import { EditCard } from "../frame/editCard";
import { type FieldLook, getFieldClass } from "../frame/fieldLook";
import { WasLine } from "../frame/wasLine";
import { PickerMap, type PickerMatchMode } from "./pickerMap";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { GeocodingAttribution } from "@/features/shared/GeocodingAttribution";
import { PICKER_FIELD_CLASS, PICKER_NOTE_CLASS } from "@/features/shared/location/fieldClasses";
import { regionsQueryOptions } from "@/features/shared/lookups";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { type GeocodedPlace, type GeocodingSource, type PlacePoint, placeAtQueryOptions } from "@/lib/geo/geocoding";
import { cn } from "@/lib/utils";
import type { UkeStation } from "@/types/station";

export type LocationPickerValue = {
  latitude: number | null;
  longitude: number | null;
  regionId: number | null;
  city: string;
  address: string;
};

type LocationPickerField = "latitude" | "longitude" | "region" | "city" | "address";

export type LocationFieldLook = {
  tone?: FieldLook;
  isInvalid?: boolean;
  error?: string;
  note?: ReactNode;
  attributes?: Record<string, string>;
};

export type AddressFill = {
  city?: string;
  address?: string;
  regionId?: number;
};

type LocationPickerState = {
  existingMatch: PickerLocation | null;
};

type LocationPickerSlot = ReactNode | ((state: LocationPickerState) => ReactNode);

type LocationPickerProps = {
  value: LocationPickerValue;
  onChange: (patch: Partial<LocationPickerValue>) => void;
  onPlacePick?: (location: PickerLocation) => void;
  onPlaceDetect?: (location: PickerLocation) => void;
  onAddressFill?: (fill: AddressFill) => void;
  onAddressAdopt?: (location: PickerLocation) => void;
  onRegisterStationPick?: (station: UkeStation) => void;
  matchMode?: PickerMatchMode;
  ownLocationId?: number | null;
  knownLocationId?: number | null;
  basePoint?: PlacePoint | null;
  azimuthStationId?: number | null;
  countryCode?: string | null;
  isDisabled?: boolean;
  fieldLooks?: Partial<Record<LocationPickerField, LocationFieldLook>>;
  titleExtras?: ReactNode;
  afterCoordinates?: LocationPickerSlot;
  regionHint?: ReactNode;
  children?: LocationPickerSlot;
};

type FieldNotesProps = {
  error?: string;
  errorId: string;
  children: ReactNode;
};

type MatchNoteProps = {
  value: string | null;
};

type MatchDifferences = {
  region: boolean;
  city: boolean;
  address: boolean;
};

export { PICKER_FIELD_CLASS, PICKER_NOTE_CLASS } from "@/features/shared/location/fieldClasses";

const NO_REGIONS: Region[] = [];
const NO_DIFFERENCES: MatchDifferences = { region: false, city: false, address: false };
const MUNICIPALITY_PREFIX = /^gmina\s+/i;
const EMPTY_VALUE = "-";
const STRIP_CLASS = "min-h-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg border bg-muted/50 px-3 py-1.5";

function parseCoordinate(text: string): number | null {
  const coordinate = Number.parseFloat(text);
  return Number.isNaN(coordinate) ? null : coordinate;
}

function toRegionId(choice: string | null): number | null {
  return choice === null || choice === "" ? null : Number(choice);
}

function isInvalid(look: LocationFieldLook | undefined): boolean {
  return look?.isInvalid === true || look?.error !== undefined;
}

function getErrorId(look: LocationFieldLook | undefined, errorId: string): string | undefined {
  return look?.error === undefined ? undefined : errorId;
}

function getLookClass(look: LocationFieldLook | undefined): string {
  return getFieldClass(look?.tone ?? "plain", isInvalid(look));
}

function renderSlot(slot: LocationPickerSlot, state: LocationPickerState): ReactNode {
  return typeof slot === "function" ? slot(state) : slot;
}

function listRegionChoices(regions: readonly Region[], countryCode: string | null | undefined, regionId: number | null): readonly Region[] {
  const chosenCountryCode = countryCode ?? regions.find((region) => region.id === regionId)?.countryCode ?? null;
  return chosenCountryCode === null ? regions : regions.filter((region) => region.countryCode === chosenCountryCode);
}

function findRegionName(regions: readonly Region[], regionId: number | null): string | null {
  if (regionId === null) return null;
  return regions.find((region) => region.id === regionId)?.name ?? null;
}

function findRegionByName(regions: readonly Region[], name: string | null, countryCode: string | null): Region | undefined {
  if (name === null) return undefined;

  const wantedName = name.toLowerCase();
  return regions.find((region) => region.name.toLowerCase() === wantedName && (countryCode === null || region.countryCode === countryCode));
}

function toAddressFill(place: GeocodedPlace, regions: readonly Region[]): AddressFill {
  const { street, houseNumber, city, municipality, region, countryCode } = place.address;
  const streetName = street ?? (houseNumber ? city : null);
  const address = [streetName, houseNumber].filter(Boolean).join(" ") || place.name;
  const locality = city ?? municipality?.replace(MUNICIPALITY_PREFIX, "");
  const matchedRegion = findRegionByName(regions, region, countryCode);
  const fill: AddressFill = {};

  if (locality) fill.city = locality;
  if (address) fill.address = address;
  if (matchedRegion !== undefined) fill.regionId = matchedRegion.id;
  return fill;
}

function isSameText(left: string | null, right: string | null): boolean {
  return (left ?? "").trim() === (right ?? "").trim();
}

function findMatchDifferences(value: LocationPickerValue, match: PickerLocation | null): MatchDifferences {
  if (match === null) return NO_DIFFERENCES;

  return {
    region: value.regionId !== match.regionId,
    city: !isSameText(value.city, match.city),
    address: !isSameText(value.address, match.address),
  };
}

function FieldNotes({ error, errorId, children }: FieldNotesProps) {
  return (
    <>
      {error === undefined ? null : (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
      {children}
    </>
  );
}

function MatchNote({ value }: MatchNoteProps) {
  return <WasLine className={PICKER_NOTE_CLASS}>{value || EMPTY_VALUE}</WasLine>;
}

export function LocationPicker({
  value,
  onChange,
  onPlacePick,
  onPlaceDetect,
  onAddressFill,
  onAddressAdopt,
  onRegisterStationPick,
  matchMode,
  ownLocationId = null,
  knownLocationId = null,
  basePoint = null,
  azimuthStationId = null,
  countryCode,
  isDisabled = false,
  fieldLooks,
  titleExtras,
  afterCoordinates,
  regionHint,
  children,
}: LocationPickerProps) {
  const { t, i18n } = useTranslation(["submissions", "common"]);
  const queryClient = useQueryClient();
  const fieldId = useId();
  const [showsRegister, setShowsRegister] = useState(false);
  const [matchedLocation, setMatchedLocation] = useState<PickerLocation | null>(null);
  const [attribution, setAttribution] = useState<GeocodingSource | null>(null);
  const { data: regions = NO_REGIONS } = useQuery(regionsQueryOptions());
  const coordinatesRef = useRef({ latitude: value.latitude, longitude: value.longitude });
  const addressFill = useMutation({
    mutationFn: (target: PlacePoint) => queryClient.fetchQuery(placeAtQueryOptions(target, i18n.language)),
  });

  useEffect(() => {
    coordinatesRef.current = { latitude: value.latitude, longitude: value.longitude };
  }, [value.latitude, value.longitude]);

  const point = toPlacePoint(value.latitude, value.longitude);
  const hasRegisterToggle = onRegisterStationPick !== undefined && !isDisabled;
  const hasOtherPlace = matchMode !== undefined && matchedLocation !== null && matchedLocation.id !== ownLocationId;
  const existingMatch = hasOtherPlace ? matchedLocation : null;
  const differences = findMatchDifferences(value, existingMatch);
  const hasMatchDifferences = differences.region || differences.city || differences.address;
  const slotState: LocationPickerState = { existingMatch };
  const regionChoices = listRegionChoices(regions, countryCode, value.regionId);
  const regionName = findRegionName(regions, value.regionId);
  const latitudeLook = fieldLooks?.latitude;
  const longitudeLook = fieldLooks?.longitude;
  const regionLook = fieldLooks?.region;
  const cityLook = fieldLooks?.city;
  const addressLook = fieldLooks?.address;
  const latitudeId = `${fieldId}-latitude`;
  const longitudeId = `${fieldId}-longitude`;
  const regionLabelId = `${fieldId}-region`;
  const cityId = `${fieldId}-city`;
  const addressId = `${fieldId}-address`;
  const registerToggleId = `${fieldId}-register`;
  const latitudeErrorId = `${latitudeId}-error`;
  const longitudeErrorId = `${longitudeId}-error`;
  const regionErrorId = `${regionLabelId}-error`;
  const cityErrorId = `${cityId}-error`;
  const addressErrorId = `${addressId}-error`;

  function pickPlace(location: PickerLocation) {
    if (onPlacePick !== undefined) {
      onPlacePick(location);
      return;
    }
    onChange({
      latitude: location.latitude,
      longitude: location.longitude,
      regionId: location.regionId,
      city: location.city ?? "",
      address: location.address ?? "",
    });
  }

  function fillAddress() {
    if (point === null) return;

    addressFill.mutate(point, {
      onSuccess: (place) => {
        const current = coordinatesRef.current;
        if (place === null || current.latitude !== point.latitude || current.longitude !== point.longitude) return;

        const fill = toAddressFill(place, regions);
        if (onAddressFill === undefined) onChange(fill);
        else onAddressFill(fill);
        setAttribution(place.source);
      },
    });
  }

  function adoptMatchAddress(match: PickerLocation) {
    if (onAddressAdopt === undefined) onChange({ regionId: match.regionId, city: match.city ?? "", address: match.address ?? "" });
    else onAddressAdopt(match);
  }

  let regionNote = regionLook?.note;
  let cityNote = cityLook?.note;
  let addressNote = addressLook?.note;
  if (existingMatch !== null) {
    regionNote = differences.region ? <MatchNote value={findRegionName(regions, existingMatch.regionId)} /> : null;
    cityNote = differences.city ? <MatchNote value={existingMatch.city} /> : null;
    addressNote = differences.address ? <MatchNote value={existingMatch.address} /> : null;
  }

  const registerToggle = hasRegisterToggle ? (
    <label htmlFor={registerToggleId} className="flex items-center gap-1.5 cursor-pointer">
      <Checkbox id={registerToggleId} checked={showsRegister} onCheckedChange={(checked) => setShowsRegister(checked === true)} />
      <span className="text-xs text-muted-foreground select-none">{t("locationPicker.showUkeLocations")}</span>
    </label>
  ) : undefined;

  return (
    <EditCard title={t("common:labels.location")} icon={Location01Icon} extras={titleExtras} actions={registerToggle}>
      <div className="h-75 lg:h-87.5 relative">
        <PickerMap
          latitude={point?.latitude ?? null}
          longitude={point?.longitude ?? null}
          basePoint={basePoint}
          matchMode={matchMode ?? null}
          ownLocationId={ownLocationId}
          knownLocationId={knownLocationId}
          azimuthStationId={azimuthStationId}
          showsRegister={hasRegisterToggle && showsRegister}
          isDisabled={isDisabled}
          onPointSet={onChange}
          onPlacePick={pickPlace}
          onPlaceDetect={(location) => onPlaceDetect?.(location)}
          onMatchChange={setMatchedLocation}
          onRegisterStationPick={(station) => onRegisterStationPick?.(station)}
        />
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fillAddress}
            disabled={point === null || isDisabled || addressFill.isPending}
            className="h-8 cursor-pointer text-xs"
          >
            {addressFill.isPending ? <Spinner className="size-3.5" /> : <HugeiconsIcon icon={Location01Icon} className="size-3.5" />}
            {t("locationPicker.fetchAddress")}
          </Button>
          {attribution === null ? null : <GeocodingAttribution source={attribution} />}
        </div>

        <div>
          <div className="grid grid-cols-2 gap-3">
            <div className={PICKER_FIELD_CLASS} {...latitudeLook?.attributes}>
              <Label htmlFor={latitudeId} className="text-xs">
                {t("common:labels.latitude")}
              </Label>
              <Input
                id={latitudeId}
                type="number"
                {...NO_AUTOFILL_PROPS}
                step="0.001"
                placeholder="52.2297"
                value={value.latitude ?? ""}
                onChange={(event) => onChange({ latitude: parseCoordinate(event.target.value) })}
                disabled={isDisabled}
                aria-invalid={isInvalid(latitudeLook) || undefined}
                aria-describedby={getErrorId(latitudeLook, latitudeErrorId)}
                className={cn("h-8 font-mono text-sm", getLookClass(latitudeLook))}
              />
              <FieldNotes error={latitudeLook?.error} errorId={latitudeErrorId}>
                {latitudeLook?.note}
              </FieldNotes>
            </div>
            <div className={PICKER_FIELD_CLASS} {...longitudeLook?.attributes}>
              <Label htmlFor={longitudeId} className="text-xs">
                {t("common:labels.longitude")}
              </Label>
              <Input
                id={longitudeId}
                type="number"
                {...NO_AUTOFILL_PROPS}
                step="0.001"
                placeholder="21.0122"
                value={value.longitude ?? ""}
                onChange={(event) => onChange({ longitude: parseCoordinate(event.target.value) })}
                disabled={isDisabled}
                aria-invalid={isInvalid(longitudeLook) || undefined}
                aria-describedby={getErrorId(longitudeLook, longitudeErrorId)}
                className={cn("h-8 font-mono text-sm", getLookClass(longitudeLook))}
              />
              <FieldNotes error={longitudeLook?.error} errorId={longitudeErrorId}>
                {longitudeLook?.note}
              </FieldNotes>
            </div>
          </div>
          {renderSlot(afterCoordinates, slotState)}
        </div>

        <div className={PICKER_FIELD_CLASS} {...regionLook?.attributes}>
          <Label id={regionLabelId} className="text-xs">
            {t("common:labels.region")}
          </Label>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <Select
              value={value.regionId === null ? "" : String(value.regionId)}
              onValueChange={(choice) => onChange({ regionId: toRegionId(choice) })}
              disabled={isDisabled}
            >
              <SelectTrigger
                aria-labelledby={regionLabelId}
                aria-invalid={isInvalid(regionLook) || undefined}
                aria-describedby={getErrorId(regionLook, regionErrorId)}
                className={cn("h-8 cursor-pointer text-sm", getLookClass(regionLook))}
              >
                <SelectValue>{regionName ?? t("locationPicker.regionPlaceholder")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {regionChoices.map((region) => (
                  <SelectItem key={region.id} value={String(region.id)} className="cursor-pointer">
                    {region.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {regionHint}
          </div>
          <FieldNotes error={regionLook?.error} errorId={regionErrorId}>
            {regionNote}
          </FieldNotes>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={PICKER_FIELD_CLASS} {...cityLook?.attributes}>
            <Label htmlFor={cityId} className="text-xs">
              {t("common:labels.city")}
            </Label>
            <Input
              id={cityId}
              {...NO_AUTOFILL_PROPS}
              placeholder={t("locationPicker.cityPlaceholder")}
              value={value.city}
              maxLength={EDIT_LIMITS.city}
              onChange={(event) => onChange({ city: event.target.value })}
              disabled={isDisabled}
              aria-invalid={isInvalid(cityLook) || undefined}
              aria-describedby={getErrorId(cityLook, cityErrorId)}
              className={cn("h-8 text-sm", getLookClass(cityLook))}
            />
            <FieldNotes error={cityLook?.error} errorId={cityErrorId}>
              {cityNote}
            </FieldNotes>
          </div>
          <div className={PICKER_FIELD_CLASS} {...addressLook?.attributes}>
            <Label htmlFor={addressId} className="text-xs">
              {t("common:labels.address")}
            </Label>
            <Input
              id={addressId}
              {...NO_AUTOFILL_PROPS}
              placeholder={t("locationPicker.addressPlaceholder")}
              value={value.address}
              onChange={(event) => onChange({ address: event.target.value })}
              disabled={isDisabled}
              aria-invalid={isInvalid(addressLook) || undefined}
              aria-describedby={getErrorId(addressLook, addressErrorId)}
              className={cn("h-8 text-sm", getLookClass(addressLook))}
            />
            <FieldNotes error={addressLook?.error} errorId={addressErrorId}>
              {addressNote}
            </FieldNotes>
          </div>
        </div>

        {existingMatch === null ? null : (
          <div className={STRIP_CLASS}>
            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              <HugeiconsIcon icon={LocationCheck01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium">{t("locationPicker.existingLocation")}</span>
              <span className="text-muted-foreground">· {t("common:labels.stations", { count: existingMatch.stations.length })}</span>
            </div>
            {hasMatchDifferences && !isDisabled ? (
              <Button type="button" variant="outline" size="sm" onClick={() => adoptMatchAddress(existingMatch)} className="cursor-pointer text-xs">
                {t("locationPicker.useExistingAddress")}
              </Button>
            ) : null}
          </div>
        )}

        {renderSlot(children, slotState)}
      </div>
    </EditCard>
  );
}
