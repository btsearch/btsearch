import { useTranslation } from "react-i18next";

import type { CountryView } from "../../types";

export type ViewEdge = "west" | "east" | "south" | "north";
export type ViewEdgeProblem = "outOfRange" | "northBelowSouth";

type ViewDraft = Record<ViewEdge, string>;
type ViewProblems = Record<ViewEdge, ViewEdgeProblem | null>;

export const VIEW_EDGES: readonly ViewEdge[] = ["west", "east", "south", "north"];
export const DEGREE_SIGN = "°";
export const DEGREES_MAX_LENGTH = 11;

const LONGITUDE_LIMIT = 180;
const LATITUDE_LIMIT = 90;
const STORED_DECIMALS = 6;
const PICKED_DECIMALS = 2;
const DEGREES_PATTERN = /^-?\d{1,3}(?:[.,]\d{0,6})?$/;
const MINUS_SIGN = "-";
const EMPTY_DRAFT: ViewDraft = { west: "", east: "", south: "", north: "" };

function withoutNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return withoutNegativeZero(Math.round(value * factor) / factor);
}

function clampTo(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

function getEdgeLimit(edge: ViewEdge): number {
  return isLongitudeEdge(edge) ? LONGITUDE_LIMIT : LATITUDE_LIMIT;
}

function parseDegrees(text: string): number | null {
  const trimmed = text.trim();
  if (!DEGREES_PATTERN.test(trimmed)) return null;
  return withoutNegativeZero(Number(trimmed.replace(",", ".")));
}

function isUnfinishedDegrees(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === "" || trimmed === MINUS_SIGN;
}

function findEdgeProblem(edge: ViewEdge, text: string): ViewEdgeProblem | null {
  if (isUnfinishedDegrees(text)) return null;

  const degrees = parseDegrees(text);
  return degrees === null || Math.abs(degrees) > getEdgeLimit(edge) ? "outOfRange" : null;
}

export function useViewEdgeLabels(): Record<ViewEdge, string> {
  const { t } = useTranslation("admin");

  return {
    west: t("reference.country.general.defaultView.edges.west"),
    east: t("reference.country.general.defaultView.edges.east"),
    south: t("reference.country.general.defaultView.edges.south"),
    north: t("reference.country.general.defaultView.edges.north"),
  };
}

export function isLongitudeEdge(edge: ViewEdge): boolean {
  return edge === "west" || edge === "east";
}

export function isDrawableView(view: CountryView): boolean {
  return view.west < view.east;
}

export function isSameView(left: CountryView | null, right: CountryView | null): boolean {
  if (left === null || right === null) return left === right;
  return left.west === right.west && left.south === right.south && left.east === right.east && left.north === right.north;
}

export function isEmptyViewDraft(draft: ViewDraft): boolean {
  return VIEW_EDGES.every((edge) => draft[edge].trim() === "");
}

export function roundView(view: CountryView | null): CountryView | null {
  if (view === null) return null;

  return {
    west: roundTo(view.west, STORED_DECIMALS),
    south: roundTo(view.south, STORED_DECIMALS),
    east: roundTo(view.east, STORED_DECIMALS),
    north: roundTo(view.north, STORED_DECIMALS),
  };
}

export function toPickedView(visibleView: CountryView): CountryView {
  return {
    west: roundTo(clampTo(visibleView.west, LONGITUDE_LIMIT), PICKED_DECIMALS),
    south: roundTo(clampTo(visibleView.south, LATITUDE_LIMIT), PICKED_DECIMALS),
    east: roundTo(clampTo(visibleView.east, LONGITUDE_LIMIT), PICKED_DECIMALS),
    north: roundTo(clampTo(visibleView.north, LATITUDE_LIMIT), PICKED_DECIMALS),
  };
}

export function toViewDraft(view: CountryView | null): ViewDraft {
  const roundedView = roundView(view);
  if (roundedView === null) return EMPTY_DRAFT;

  return {
    west: String(roundedView.west),
    east: String(roundedView.east),
    south: String(roundedView.south),
    north: String(roundedView.north),
  };
}

export function findViewProblems(draft: ViewDraft): ViewProblems {
  const southProblem = findEdgeProblem("south", draft.south);
  const northProblem = findEdgeProblem("north", draft.north);
  const south = parseDegrees(draft.south);
  const north = parseDegrees(draft.north);
  const isNorthBelowSouth = southProblem === null && northProblem === null && south !== null && north !== null && south >= north;

  return {
    west: findEdgeProblem("west", draft.west),
    east: findEdgeProblem("east", draft.east),
    south: southProblem,
    north: isNorthBelowSouth ? "northBelowSouth" : northProblem,
  };
}

export function parseViewDraft(draft: ViewDraft): CountryView | null {
  const problems = findViewProblems(draft);
  if (VIEW_EDGES.some((edge) => problems[edge] !== null)) return null;

  const west = parseDegrees(draft.west);
  const south = parseDegrees(draft.south);
  const east = parseDegrees(draft.east);
  const north = parseDegrees(draft.north);
  if (west === null || south === null || east === null || north === null) return null;

  return { west, south, east, north };
}

export function formatDegrees(degrees: number, language: string): string {
  return `${degrees.toLocaleString(language, { maximumFractionDigits: STORED_DECIMALS })}${DEGREE_SIGN}`;
}
