import type { Operator, Region, StationBase } from "@openbts/shared/contract";

import { type PhotosGalleryFilters, getPhotosGallerySortParts } from "./galleryFilters";
import type { GalleryPhoto, GallerySelection, PhotoListPage } from "./galleryRequests";

type GalleryLocation = GalleryPhoto["location"];

export type GalleryTile = {
  key: string;
  photo: GalleryPhoto;
  station: StationBase;
  isMain: boolean;
  slideIndex: number;
  tileIndex: number;
};

type GallerySlide = {
  index: number;
  photo: GalleryPhoto;
  tiles: GalleryTile[];
};

type GalleryPlace = {
  location: GalleryLocation;
  tiles: GalleryTile[];
};

export type StationPhotoGroup = {
  station: StationBase;
  location: GalleryLocation;
  tiles: GalleryTile[];
};

export type Gallery = {
  groups: StationPhotoGroup[];
  slides: GallerySlide[];
};

type GalleryLookups = {
  operators: readonly Operator[];
  regionsById: ReadonlyMap<number, Region>;
};

type OperatorChoice = {
  operatorIds: ReadonlySet<number>;
  narrowedCountryCodes: ReadonlySet<string>;
};

function getPhotoRowKey(photo: Pick<GalleryPhoto, "id" | "locationId">): string {
  return `${photo.locationId}:${photo.id}`;
}

export function listGalleryPhotos(pages: readonly PhotoListPage[] | undefined): GalleryPhoto[] {
  const photos = new Map<string, GalleryPhoto>();
  for (const page of pages ?? []) {
    for (const photo of page.data) {
      const rowKey = getPhotoRowKey(photo);
      if (!photos.has(rowKey)) photos.set(rowKey, photo);
    }
  }
  return [...photos.values()];
}

function containsText(value: string | null | undefined, needle: string): boolean {
  return typeof value === "string" && value.toLowerCase().includes(needle);
}

function getOperatorChoice(filters: PhotosGalleryFilters, lookups: GalleryLookups | undefined): OperatorChoice | null {
  if (filters.operatorIds.length === 0) return null;

  const namedOperatorIds = new Set(filters.operatorIds);
  const operatorIds = new Set(filters.operatorIds);
  const narrowedCountryCodes = new Set<string>();

  for (const operator of lookups?.operators ?? []) {
    const isChosen = namedOperatorIds.has(operator.id) || operator.links.some((link) => namedOperatorIds.has(link.operatorId));
    if (!isChosen) continue;

    operatorIds.add(operator.id);
    narrowedCountryCodes.add(operator.countryCode);
  }
  return { operatorIds, narrowedCountryCodes };
}

function passesOperatorChoice(selection: GallerySelection, location: GalleryLocation, choice: OperatorChoice | null): boolean {
  if (choice === null || !choice.narrowedCountryCodes.has(location.countryCode)) return true;

  const { operatorId } = selection.station;
  return operatorId !== null && choice.operatorIds.has(operatorId);
}

function listMatchingSelections(
  photo: GalleryPhoto,
  filters: PhotosGalleryFilters,
  choice: OperatorChoice | null,
  region: Region | undefined,
  searchText: string,
): GallerySelection[] {
  const selections = photo.selections.filter(
    (selection) =>
      filters.statuses.includes(selection.station.status) &&
      passesOperatorChoice(selection, photo.location, choice) &&
      (selection.isMain || !filters.isMainOnly),
  );
  const placeTexts = [photo.location.city, photo.location.address, photo.note, region?.name, region?.code];
  if (searchText === "" || placeTexts.some((text) => containsText(text, searchText))) return selections;

  const namedSelections = selections.filter((selection) => containsText(selection.station.siteId, searchText));
  return namedSelections.length > 0 ? namedSelections : selections;
}

function compareSiteIds(left: GallerySelection, right: GallerySelection): number {
  if (left.station.siteId === right.station.siteId) return 0;
  return left.station.siteId < right.station.siteId ? -1 : 1;
}

function orderSelections(selections: readonly GallerySelection[], filters: PhotosGalleryFilters): GallerySelection[] {
  const newestFirst = [...selections].reverse();
  const { sortBy, order } = getPhotosGallerySortParts(filters.sort);
  if (sortBy !== "station") return newestFirst;

  const direction = order === "asc" ? 1 : -1;
  return newestFirst.sort((left, right) => direction * compareSiteIds(left, right));
}

export function buildGallery(photos: readonly GalleryPhoto[], filters: PhotosGalleryFilters, lookups: GalleryLookups | undefined): Gallery {
  const searchText = filters.searchText.toLowerCase();
  const choice = getOperatorChoice(filters, lookups);
  const groups = new Map<number, StationPhotoGroup>();
  const slides = new Map<string, GallerySlide>();
  let tileCount = 0;

  for (const photo of photos) {
    const region = lookups?.regionsById.get(photo.location.regionId);
    const selections = orderSelections(listMatchingSelections(photo, filters, choice, region, searchText), filters);
    if (selections.length === 0) continue;

    let slide = slides.get(photo.id);
    if (slide === undefined) {
      slide = { index: slides.size, photo, tiles: [] };
      slides.set(photo.id, slide);
    }

    for (const { station, isMain } of selections) {
      const tile: GalleryTile = {
        key: `${station.id}:${getPhotoRowKey(photo)}`,
        photo,
        station,
        isMain,
        slideIndex: slide.index,
        tileIndex: tileCount,
      };
      tileCount += 1;
      slide.tiles.push(tile);

      const group = groups.get(station.id);
      if (group) group.tiles.push(tile);
      else groups.set(station.id, { station, location: photo.location, tiles: [tile] });
    }
  }

  return { groups: [...groups.values()], slides: [...slides.values()] };
}

export function listTilePlaces(tiles: readonly GalleryTile[]): GalleryPlace[] {
  const places = new Map<number, GalleryPlace>();
  for (const tile of tiles) {
    const place = places.get(tile.photo.locationId);
    if (place) place.tiles.push(tile);
    else places.set(tile.photo.locationId, { location: tile.photo.location, tiles: [tile] });
  }
  return [...places.values()];
}
