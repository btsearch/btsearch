import type { CSSProperties } from "react";
import { forwardRef } from "react";
import { useTranslation } from "react-i18next";

import { PermitSnapshotBandChart, type SnapshotBand, type SnapshotMetric } from "./permitSnapshotBandChart";

const IMAGE_WIDTH = 1920;
const IMAGE_HEIGHT = 1080;
const IMAGE_PIXEL_RATIO = 2;
const MAX_GRID_ROWS = 4;

type ExportCanvasStyle = CSSProperties & Record<`--${string}`, string>;

const EXPORT_CANVAS_STYLE: ExportCanvasStyle = {
  width: `${IMAGE_WIDTH}px`,
  height: `${IMAGE_HEIGHT}px`,
  backgroundColor: "#000000",
  color: "#fafafa",
  "--background": "#000000",
  "--foreground": "#fafafa",
  "--muted": "#18181b",
  "--muted-foreground": "#a1a1aa",
  "--border": "#3f3f46",
  "--chart-1": "#fafafa",
  "--chart-2": "#a1a1aa",
};

function getLocalizedMonth(monthValue: string, locale: string) {
  const date = new Date(`${monthValue}-01T00:00:00.000Z`);
  return {
    month: date.toLocaleDateString(locale, { month: "long", timeZone: "UTC" }),
    year: String(date.getUTCFullYear()),
  };
}

export const PermitSnapshotImage = forwardRef<
  HTMLDivElement,
  {
    bands: SnapshotBand[];
    description: string;
    metric: SnapshotMetric;
    month: string;
  }
>(function PermitSnapshotImage({ bands, description, metric, month }, ref) {
  const { t, i18n } = useTranslation("statistics");
  const localizedMonth = getLocalizedMonth(month, i18n.language);
  const columns = Math.max(4, Math.ceil(bands.length / MAX_GRID_ROWS));

  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 z-[-1]">
      <div ref={ref} className="box-border overflow-hidden bg-black p-12 font-sans text-white" style={EXPORT_CANVAS_STYLE}>
        <header className="flex h-26 items-center justify-between border-b border-white/20 pb-6">
          <div className="flex min-w-0 items-center gap-8">
            <img src="/btsearch.webp" alt="" width={185} height={65} className="h-[65px] w-[185px] shrink-0 brightness-0 invert" draggable={false} />
            <div className="min-w-0 border-l border-white/20 pl-8">
              <h1 className="truncate text-[34px] font-semibold leading-none tracking-[-0.02em]">
                {t("permitsByMonth.export.imageTitle", localizedMonth)}
              </h1>
              <p className="mt-3 text-sm text-zinc-400">
                {t(`permitsByMonth.views.${metric}`)} · {description}
              </p>
            </div>
          </div>
          <div className="ml-8 flex shrink-0 items-center gap-6 text-xs text-zinc-400">
            <span className="flex items-center gap-2">
              <span className="h-3 w-5 bg-white" />
              {t("permitsByMonth.all")}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-5 border border-white bg-[repeating-linear-gradient(135deg,transparent_0,transparent_3px,white_3px,white_4px)]" />
              {t("permitsByMonth.new")}
            </span>
          </div>
        </header>
        <div
          className="mt-3 grid h-217 overflow-hidden border-l border-t border-white/15 bg-black"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${MAX_GRID_ROWS}, minmax(0, 1fr))`,
          }}
        >
          {bands.map((band) => (
            <PermitSnapshotBandChart key={band.id} band={band} metric={metric} mode="export" />
          ))}
        </div>
      </div>
    </div>
  );
});

export async function exportPermitSnapshotImage(node: HTMLElement, filename: string) {
  const [{ toBlob }] = await Promise.all([
    import("html-to-image"),
    document.fonts.ready,
    Promise.all([...node.querySelectorAll("img")].map((image) => image.decode())),
  ]);
  const blob = await toBlob(node, {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    canvasWidth: IMAGE_WIDTH,
    canvasHeight: IMAGE_HEIGHT,
    pixelRatio: IMAGE_PIXEL_RATIO,
    backgroundColor: "#000000",
    cacheBust: true,
    skipAutoScale: true,
  });
  if (blob === null) throw new Error("The statistics image could not be rendered");

  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}
