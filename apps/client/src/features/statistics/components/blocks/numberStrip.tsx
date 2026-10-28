import NumberFlow, { continuous } from "@number-flow/react";
import { type CSSProperties, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { cn } from "@/lib/utils";

export type NumberTile = { key: string; label: string; generation?: string; value: number | null; hint?: string; isPrimary?: boolean };

type StripStyle = CSSProperties & Record<"--tiles", number>;

const SKELETON_TILE_COUNT = 4;
const STRIP_CLASS = "grid grid-cols-2 gap-x-5 gap-y-3 @4xl:grid-cols-[repeat(var(--tiles),minmax(0,1fr))] @4xl:gap-0";
const TILE_CLASS =
  "min-w-0 @max-4xl:odd:last:col-span-2 @max-4xl:[&:nth-child(n+3)]:border-t @max-4xl:[&:nth-child(n+3)]:pt-3 @4xl:border-l @4xl:px-5 @4xl:first:border-l-0 @4xl:first:pl-0";

const FLOW_PROPS = {
  plugins: [continuous],
  transformTiming: { duration: 1200, easing: "ease-out" },
  spinTiming: { duration: 1200, easing: "ease-out" },
  opacityTiming: { duration: 400, easing: "ease-out" },
};

function roundDownToPowerOfTen(value: number): number {
  if (value <= 0) return 0;
  return 10 ** Math.floor(Math.log10(value));
}

function useScrolledIntoView() {
  const [isScrolledIntoView, setIsScrolledIntoView] = useState(false);

  const ref = useCallback((element: HTMLDListElement | null) => {
    if (element === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsScrolledIntoView(true);
        observer.disconnect();
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, isScrolledIntoView };
}

export function NumberStrip({ tiles }: { tiles: readonly NumberTile[] }) {
  const { i18n } = useTranslation();
  const { ref, isScrolledIntoView } = useScrolledIntoView();
  const style: StripStyle = { "--tiles": tiles.length };

  return (
    <dl ref={ref} style={style} className={STRIP_CLASS}>
      {tiles.map((tile) => (
        <div key={tile.key} className={TILE_CLASS}>
          <dt className="flex items-center gap-1.5 text-xs leading-4 text-muted-foreground">
            {tile.generation === undefined ? null : <GenerationTag>{tile.generation}</GenerationTag>}
            <span className="min-w-0 truncate">{tile.label}</span>
          </dt>
          <dd className={cn("mt-1 truncate leading-8 font-bold tabular-nums", tile.isPrimary ? "text-2xl" : "text-lg")}>
            {tile.value === null ? (
              "-"
            ) : (
              <NumberFlow {...FLOW_PROPS} value={isScrolledIntoView ? tile.value : roundDownToPowerOfTen(tile.value)} locales={i18n.language} />
            )}
          </dd>
          {tile.hint === undefined ? null : (
            <dd title={tile.hint} className="mt-0.5 truncate text-xs leading-4 text-muted-foreground tabular-nums">
              {tile.hint}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

export function NumberStripSkeleton() {
  const style: StripStyle = { "--tiles": SKELETON_TILE_COUNT };

  return (
    <div aria-hidden="true" style={style} className={STRIP_CLASS}>
      {Array.from({ length: SKELETON_TILE_COUNT }, (_, index) => (
        <div key={index} className={TILE_CLASS}>
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="mt-2.5 h-5.5 w-24" />
          <Skeleton className="mt-2.5 h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}
