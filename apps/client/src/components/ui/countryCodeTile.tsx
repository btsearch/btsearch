import { cn } from "@/lib/utils";

type CountryCodeTileSize = "xs" | "sm" | "md" | "lg";
type CountryCodeTileTone = "default" | "inverse";

type CountryCodeTileProps = {
  code: string;
  size?: CountryCodeTileSize;
  tone?: CountryCodeTileTone;
  label?: string;
  className?: string;
};

const TILE_CLASS = "inline-flex shrink-0 items-center justify-center font-bold tracking-[0.04em]";
const TILE_TONE_CLASSES: Record<CountryCodeTileTone, string> = {
  default: "bg-muted text-foreground",
  inverse: "bg-primary-foreground text-primary",
};
const TILE_SIZE_CLASSES: Record<CountryCodeTileSize, string> = {
  xs: "h-4.5 self-center rounded-sm px-1.5 text-[0.625rem] leading-none",
  sm: "h-5.5 min-w-5.5 rounded-md px-1 text-[0.625rem] leading-none",
  md: "size-8 rounded-lg text-[0.6875rem] leading-none",
  lg: "size-12 rounded-lg text-sm leading-none sm:size-18 sm:rounded-2xl sm:text-[1.375rem]",
};

export function CountryCodeTile({ code, size = "md", tone = "default", label, className }: CountryCodeTileProps) {
  const tileClassName = cn(TILE_CLASS, TILE_TONE_CLASSES[tone], TILE_SIZE_CLASSES[size], className);

  if (label === undefined) {
    return (
      <span aria-hidden="true" className={tileClassName}>
        {code}
      </span>
    );
  }

  return (
    <span role="img" aria-label={label} title={label} className={tileClassName}>
      {code}
    </span>
  );
}
