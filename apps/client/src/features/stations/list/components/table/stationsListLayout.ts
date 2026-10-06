import { LIST_BOX_BORDER_WIDTH } from "./listTableRow";
import type { StationsListVariant } from "@/features/stations/list/data/stationsListFilters";
import { cn } from "@/lib/utils";

const TABLE_CLASS = "@container min-w-186";
const GRID_CLASS = cn(
  "grid grid-cols-[144px_minmax(190px,1fr)_24px_minmax(214px,280px)_100px] gap-x-3 px-3",
  "@min-[870px]:@max-[1350px]:grid-cols-[144px_minmax(210px,1fr)_minmax(130px,170px)_minmax(214px,280px)_100px]",
  "@min-[1350px]:grid-cols-[144px_minmax(210px,1fr)_calc(21.05cqi_-_114px)_calc(31.58cqi_-_146px)_calc(15.79cqi_-_93px)_100px]",
);
const TOUCH_ACTIONS_COLUMN_TABLE_CLASS = "pointer-coarse:min-w-203.5";
const TOUCH_ACTIONS_COLUMN_TABLE_MIN_WIDTH = 814;
const TOUCH_ACTIONS_COLUMN_GRID_CLASS = cn(
  "pointer-coarse:grid-cols-[144px_minmax(190px,1fr)_24px_minmax(214px,280px)_100px_58px]",
  "pointer-coarse:@min-[870px]:@max-[1350px]:grid-cols-[144px_minmax(190px,1fr)_minmax(100px,170px)_minmax(194px,280px)_100px_58px]",
  "pointer-coarse:@min-[1350px]:grid-cols-[144px_minmax(190px,1fr)_calc(21.05cqi_-_114px)_calc(31.58cqi_-_146px)_calc(15.79cqi_-_93px)_100px_58px]",
);

export const STATIONS_TABLE_CLASSES: Record<StationsListVariant, string> = {
  public: TABLE_CLASS,
  admin: cn(TABLE_CLASS, TOUCH_ACTIONS_COLUMN_TABLE_CLASS),
};
export const STATIONS_GRID_CLASSES: Record<StationsListVariant, string> = {
  public: GRID_CLASS,
  admin: cn(GRID_CLASS, TOUCH_ACTIONS_COLUMN_GRID_CLASS),
};
export const STATIONS_WIDE_ONLY_CLASS = "hidden @min-[1350px]:block";
export const STATIONS_PLACE_LINE_CLASS = "@min-[1350px]:max-w-144";
export const STATIONS_CARD_HEIGHT_CLASSES: Record<StationsListVariant, string> = { public: "h-24.75", admin: "h-26.75" };
export const STATIONS_CARD_HEIGHTS: Record<StationsListVariant, number> = { public: 99, admin: 107 };
export const STATIONS_TOUCH_NARROWEST_TABLE_WIDTH = TOUCH_ACTIONS_COLUMN_TABLE_MIN_WIDTH + 2 * LIST_BOX_BORDER_WIDTH;
