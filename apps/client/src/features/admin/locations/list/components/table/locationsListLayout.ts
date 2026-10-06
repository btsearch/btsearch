import { LIST_BOX_BORDER_WIDTH } from "@/features/stations/list/components/table/listTableRow";
import type { GpsFormat } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

const GRID_CLASS = "grid gap-x-3 px-3";
const DMS_TABLE_MIN_WIDTH = 808;
const DMS_TOUCH_TABLE_MIN_WIDTH = 878;

export const LOCATIONS_NARROWEST_TABLE_WIDTH = DMS_TABLE_MIN_WIDTH + 2 * LIST_BOX_BORDER_WIDTH;
export const LOCATIONS_TOUCH_NARROWEST_TABLE_WIDTH = DMS_TOUCH_TABLE_MIN_WIDTH + 2 * LIST_BOX_BORDER_WIDTH;
export const LOCATIONS_TABLE_CLASSES: Record<GpsFormat, string> = {
  decimal: "@container min-w-197 pointer-coarse:min-w-214.5",
  dms: "@container min-w-202 pointer-coarse:min-w-219.5",
};
export const LOCATIONS_GRID_CLASSES: Record<GpsFormat, string> = {
  decimal: cn(
    GRID_CLASS,
    "grid-cols-[48px_minmax(170px,1fr)_140px_76px_minmax(170px,216px)_100px]",
    "@min-[1350px]:grid-cols-[48px_minmax(170px,1fr)_calc(22.222cqi_-_160px)_76px_calc(33.333cqi_-_234px)_100px]",
    "pointer-coarse:grid-cols-[48px_minmax(170px,1fr)_140px_76px_minmax(170px,216px)_100px_58px]",
    "pointer-coarse:@min-[1350px]:grid-cols-[48px_minmax(170px,1fr)_calc(22.222cqi_-_160px)_76px_calc(33.333cqi_-_234px)_100px_58px]",
  ),
  dms: cn(
    GRID_CLASS,
    "grid-cols-[48px_minmax(170px,1fr)_140px_96px_minmax(170px,216px)_100px]",
    "@min-[1350px]:grid-cols-[48px_minmax(170px,1fr)_calc(22.222cqi_-_160px)_96px_calc(33.333cqi_-_234px)_100px]",
    "pointer-coarse:grid-cols-[48px_minmax(170px,1fr)_140px_96px_minmax(170px,216px)_100px_58px]",
    "pointer-coarse:@min-[1350px]:grid-cols-[48px_minmax(170px,1fr)_calc(22.222cqi_-_160px)_96px_calc(33.333cqi_-_234px)_100px_58px]",
  ),
};
export const LOCATIONS_CARD_HEIGHT_CLASS = "h-31.75";
export const LOCATIONS_CARD_HEIGHT = 127;
