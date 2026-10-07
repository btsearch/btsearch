import { Gps01Icon, InformationCircleIcon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { formatDistance } from "@openbts/shared/radiolinesUtils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type PickerLocation, toPlacePoint } from "../../data/places";
import { type EditText, type StationDraftApi, useEditText } from "../../hooks/useStationDraft";
import { formatCoordinate, getFieldState, getMoveDistance, hasMarkerMoved, movesStationAlone } from "../../model/changes";
import type { PlacePatch } from "../../model/draftReducer";
import { toPlaceDraft } from "../../model/snapshots";
import type { EditSession, FieldMark, FieldTarget, PlaceField } from "../../model/types";
import { EDIT_LIMITS, findFieldError } from "../../model/validate";
import { editTargetProps } from "../frame/editTargets";
import { getFieldLook } from "../frame/fieldLook";
import { FieldMarks, WasLine } from "../frame/wasLine";
import { type AddressFill, type LocationFieldLook, LocationPicker, type LocationPickerValue, PICKER_NOTE_CLASS } from "./locationPicker";
import { MoveChoice } from "./moveChoice";
import type { PickerMatchMode } from "./pickerMap";
import { type PlaceStation, PlaceStations, useOwnPlaceStations } from "./placeStations";
import { StructureFields } from "./structureFields";
import { useRegionLookup } from "./useRegionLookup";
import type { UkeStation } from "@/types/station";

type LocationCardProps = {
  edit: StationDraftApi;
  stationId?: number | null;
  onRegisterStationPick?: (station: UkeStation) => void;
};

type CoordinateLooks = {
  latitude: LocationFieldLook;
  longitude: LocationFieldLook;
};

type CoordinateMarksProps = {
  marks: readonly FieldMark[];
  liveValue: number | null;
  submittedValue: number | null;
};

type MoveSectionProps = {
  edit: StationDraftApi;
  joinsExisting: boolean;
  otherStationCount: number | null;
};

type PlaceExtrasProps = {
  edit: StationDraftApi;
  existingMatch: PickerLocation | null;
  ownStations: readonly PlaceStation[] | null;
  stationId: number | null;
};

type PlaceNoteProps = {
  children: ReactNode;
};

const NO_STATIONS: PlaceStation[] = [];
const COORDINATES_TARGET: FieldTarget = { scope: "place", field: "coordinates" };
const MOVE_TARGET: FieldTarget = { scope: "place", field: "move" };
const EDIT_LINK_CLASS = "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors";

function isOutOfRange(value: number | null, limit: number): boolean {
  return value === null || Math.abs(value) > limit;
}

function getMatchMode(session: EditSession, canEdit: boolean): PickerMatchMode | undefined {
  if (!canEdit) return undefined;
  if (session.kind === "editor") return "select";
  return session.kind === "form" && session.live === null && session.proposed === null ? "select" : "compare";
}

function CoordinateMarks({ marks, liveValue, submittedValue }: CoordinateMarksProps) {
  const hasDatabaseMark = marks.some((mark) => mark.tone === "database");
  const hasSubmittedMark = marks.some((mark) => mark.tone === "submitted");

  return (
    <>
      {hasDatabaseMark && liveValue !== null ? <WasLine className={PICKER_NOTE_CLASS}>{formatCoordinate(liveValue)}</WasLine> : null}
      {hasSubmittedMark && submittedValue !== null ? (
        <WasLine tone="submitted" className={PICKER_NOTE_CLASS}>
          {formatCoordinate(submittedValue)}
        </WasLine>
      ) : null}
    </>
  );
}

function buildFieldLook(edit: StationDraftApi, field: PlaceField, formatError: EditText["formatError"]): LocationFieldLook {
  const target: FieldTarget = { scope: "place", field };
  const state = getFieldState(edit.session, edit.context, target);
  const error = findFieldError(edit.errors, target);
  const look: LocationFieldLook = { tone: getFieldLook(state, edit.session.kind === "review"), attributes: editTargetProps(target) };

  if (error !== undefined) look.error = formatError(error);
  if (edit.session.kind === "review") look.note = <FieldMarks marks={state.marks} className={PICKER_NOTE_CLASS} />;
  return look;
}

function buildCoordinateLooks(edit: StationDraftApi, formatError: EditText["formatError"]): CoordinateLooks {
  const { session } = edit;
  const { place } = session.draft;
  const state = getFieldState(session, edit.context, COORDINATES_TARGET);
  const error = findFieldError(edit.errors, COORDINATES_TARGET);
  const tone = getFieldLook(state, session.kind === "review");
  const isLatitudeWrong = isOutOfRange(place?.latitude ?? null, EDIT_LIMITS.latitude);
  const isLongitudeWrong = isOutOfRange(place?.longitude ?? null, EDIT_LIMITS.longitude);
  const blamesLatitude = error !== undefined && (isLatitudeWrong || !isLongitudeWrong);
  const blamesLongitude = error !== undefined && (isLongitudeWrong || !isLatitudeWrong);
  const latitude: LocationFieldLook = { tone, isInvalid: blamesLatitude, attributes: editTargetProps(COORDINATES_TARGET) };
  const longitude: LocationFieldLook = { tone, isInvalid: blamesLongitude };

  if (error !== undefined && blamesLatitude) latitude.error = formatError(error);
  if (error !== undefined && !blamesLatitude) longitude.error = formatError(error);
  if (session.kind === "review") {
    const livePlace = session.live?.place ?? null;
    const submittedPlace = session.proposed?.place ?? null;
    latitude.note = <CoordinateMarks marks={state.marks} liveValue={livePlace?.latitude ?? null} submittedValue={submittedPlace?.latitude ?? null} />;
    longitude.note = (
      <CoordinateMarks marks={state.marks} liveValue={livePlace?.longitude ?? null} submittedValue={submittedPlace?.longitude ?? null} />
    );
  }
  return { latitude, longitude };
}

function RegionHint() {
  const { t } = useTranslation();

  return (
    <span title={t("stations:edit.location.regionFromCoordinatesHint")} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <HugeiconsIcon icon={Gps01Icon} aria-hidden="true" className="size-3 shrink-0" />
      {t("stations:edit.location.regionFromCoordinates")}
    </span>
  );
}

function MoveSection({ edit, joinsExisting, otherStationCount }: MoveSectionProps) {
  const { t } = useTranslation();
  const text = useEditText();
  const { session, dispatch, canEdit } = edit;
  const { place } = session.draft;
  const move = place?.move ?? "station";
  const distance = getMoveDistance(place, session.live?.place ?? null) ?? 0;
  const error = findFieldError(edit.errors, MOVE_TARGET);

  let consequence: string;
  if (move === "station" && otherStationCount === 0) {
    consequence = joinsExisting ? t("stations:edit.location.stationAloneToExisting") : t("stations:edit.location.stationAloneToNew");
  } else if (move === "station") {
    consequence = joinsExisting ? t("stations:edit.location.stationToExisting") : t("stations:edit.location.stationToNew");
  } else if (otherStationCount === null || otherStationCount === 0) {
    consequence = joinsExisting ? t("stations:edit.location.mergeAlone") : t("stations:edit.location.locationAlone");
  } else if (joinsExisting) {
    consequence = t("stations:edit.location.mergeWithStations", { count: otherStationCount });
  } else {
    consequence = t("stations:edit.location.locationWithStations", { count: otherStationCount });
  }

  return (
    <div {...editTargetProps(MOVE_TARGET)}>
      <MoveChoice
        isShown={hasMarkerMoved(session)}
        move={move}
        distance={formatDistance(distance)}
        consequence={consequence}
        error={error === undefined ? undefined : text.formatError(error)}
        isDisabled={!canEdit}
        onMoveChange={(nextMove) => dispatch({ type: "setMove", move: nextMove })}
      />
    </div>
  );
}

function PlaceNote({ children }: PlaceNoteProps) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

function PlaceExtras({ edit, existingMatch, ownStations, stationId }: PlaceExtrasProps) {
  const { t } = useTranslation();
  const { session, lookups } = edit;
  const { place } = session.draft;
  const movesAlone = movesStationAlone(session);
  const stayingStations = movesAlone ? NO_STATIONS : (ownStations ?? NO_STATIONS);
  const joinedStations = existingMatch === null ? NO_STATIONS : existingMatch.stations.filter((station) => station.id !== stationId);
  const neighbours = [...stayingStations, ...joinedStations];
  const proposesOwner = session.kind === "form" && place?.structure.owner.kind === "proposed";

  return (
    <>
      <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
        <StructureFields edit={edit} />
        {proposesOwner ? <PlaceNote>{t("stations:edit.owner.proposedHint")}</PlaceNote> : null}
        {neighbours.length === 0 ? null : <PlaceNote>{t("stations:edit.location.sharedByStations", { total: neighbours.length + 1 })}</PlaceNote>}
      </div>
      <PlaceStations stations={neighbours} operatorsById={lookups.operatorsById} brands={lookups.brands} opensEditor={session.kind !== "form"} />
    </>
  );
}

export function LocationCard({ edit, stationId = null, onRegisterStationPick }: LocationCardProps) {
  const { t } = useTranslation();
  const text = useEditText();
  const { session, dispatch, lookups, canEdit } = edit;
  const { place } = session.draft;
  const livePlace = session.live?.place ?? null;
  const ownLocationId = livePlace?.locationId ?? null;
  const ownStations = useOwnPlaceStations(ownLocationId, stationId);
  const regionAtId = useRegionLookup(edit);

  const isMoved = hasMarkerMoved(session);
  const coordinateLooks = buildCoordinateLooks(edit, text.formatError);
  const value: LocationPickerValue = {
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    regionId: place?.regionId ?? null,
    city: place?.city ?? "",
    address: place?.address ?? "",
  };

  function isRegionFromCoordinates(regionId: number): boolean {
    if (regionAtId !== null) return regionAtId === regionId;
    return livePlace !== null && !isMoved && livePlace.regionId === regionId;
  }

  function changePlace(patch: Partial<LocationPickerValue>) {
    const next: PlacePatch = {};

    if (patch.city !== undefined) next.city = patch.city;
    if (patch.address !== undefined) next.address = patch.address;
    if (patch.regionId !== undefined) {
      next.regionId = patch.regionId;
      next.isRegionPicked = patch.regionId !== null && !isRegionFromCoordinates(patch.regionId);
    }
    if (patch.latitude !== undefined || patch.longitude !== undefined) {
      const latitude = patch.latitude === undefined ? (place?.latitude ?? null) : patch.latitude;
      const longitude = patch.longitude === undefined ? (place?.longitude ?? null) : patch.longitude;
      const isAtOwnPlace = livePlace !== null && livePlace.latitude === latitude && livePlace.longitude === longitude;

      next.latitude = latitude;
      next.longitude = longitude;
      next.locationId = isAtOwnPlace ? ownLocationId : null;
    }
    dispatch({ type: "setPlace", patch: next });
  }

  function pickPlace(location: PickerLocation) {
    if (location.id === ownLocationId) dispatch({ type: "revertToLive", target: COORDINATES_TARGET });
    else dispatch({ type: "pickPlace", place: toPlaceDraft(location) });
  }

  function detectPlace(location: PickerLocation) {
    if (!canEdit || place === null || place.locationId === location.id) return;

    const next: PlacePatch = { locationId: location.id };
    if (!place.isRegionPicked) next.regionId = location.regionId;
    dispatch({ type: "setPlace", patch: next });
  }

  function fillAddress(fill: AddressFill) {
    const next: PlacePatch = {};

    if (fill.city !== undefined) next.city = fill.city;
    if (fill.address !== undefined) next.address = fill.address;
    dispatch({ type: "setPlace", patch: next });
  }

  function adoptAddress(location: PickerLocation) {
    dispatch({
      type: "setPlace",
      patch: {
        locationId: location.id,
        regionId: location.regionId,
        isRegionPicked: false,
        city: location.city ?? "",
        address: location.address ?? "",
      },
    });
  }

  const hasRegionHint = place !== null && place.regionId !== null && !place.isRegionPicked;
  const editLink =
    session.kind === "editor" && ownLocationId !== null ? (
      <Link to="/admin/locations/$id" params={{ id: String(ownLocationId) }} className={EDIT_LINK_CLASS}>
        <HugeiconsIcon icon={PencilEdit01Icon} className="size-3" />
        {t("common:actions.edit")}
      </Link>
    ) : null;

  return (
    <LocationPicker
      value={value}
      onChange={changePlace}
      onPlacePick={pickPlace}
      onPlaceDetect={detectPlace}
      onAddressFill={fillAddress}
      onAddressAdopt={adoptAddress}
      onRegisterStationPick={onRegisterStationPick}
      matchMode={getMatchMode(session, canEdit)}
      ownLocationId={ownLocationId}
      knownLocationId={place?.locationId ?? null}
      basePoint={isMoved && livePlace !== null ? toPlacePoint(livePlace.latitude, livePlace.longitude) : null}
      azimuthStationId={stationId}
      countryCode={lookups.countryCode}
      isDisabled={!canEdit}
      fieldLooks={{
        latitude: coordinateLooks.latitude,
        longitude: coordinateLooks.longitude,
        region: buildFieldLook(edit, "regionId", text.formatError),
        city: buildFieldLook(edit, "city", text.formatError),
        address: buildFieldLook(edit, "address", text.formatError),
      }}
      titleExtras={editLink}
      afterCoordinates={(picker) => (
        <MoveSection edit={edit} joinsExisting={picker.existingMatch !== null} otherStationCount={ownStations?.length ?? null} />
      )}
      regionHint={hasRegionHint ? <RegionHint /> : null}
    >
      {(picker) => <PlaceExtras edit={edit} existingMatch={picker.existingMatch} ownStations={ownStations} stationId={stationId} />}
    </LocationPicker>
  );
}
