import type { Map as MapLibreMap } from "maplibre-gl";

const PROFILE_PART_SELECTOR = "[data-terrain-profile-part]";
const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

export const PROFILE_PART_PROPS = { "data-terrain-profile-part": "" } as const;

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  return target instanceof HTMLElement && target.isContentEditable;
}

export function moveFocusFromProfileToMap(map: MapLibreMap | null): void {
  const focusedElement = document.activeElement;
  if (focusedElement === null || focusedElement.closest(PROFILE_PART_SELECTOR) === null) return;
  map?.getCanvas().focus({ preventScroll: true });
}
