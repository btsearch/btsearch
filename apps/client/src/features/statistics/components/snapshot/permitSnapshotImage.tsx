import type { CSSProperties, Ref } from "react";
import { useTranslation } from "react-i18next";

import type { SnapshotBand } from "../../lib/chartData";
import { toMonthStart } from "../../lib/periods";
import { PermitSnapshotBandChart, type SnapshotMetric } from "./permitSnapshotBandChart";
import { getBandCellStyle } from "./snapshotLayout";
import { downloadBlob } from "@/lib/dom/download";

const IMAGE_WIDTH = 1920;
const IMAGE_HEIGHT = 1080;
const IMAGE_PIXEL_RATIO = 2;

type ExportCanvasStyle = CSSProperties & Record<`--${string}`, string>;

type PermitSnapshotImageProps = {
  ref: Ref<HTMLDivElement>;
  bands: SnapshotBand[];
  description: string;
  metric: SnapshotMetric;
  month: string;
  sourceName: string | null;
};

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

function getLocalizedMonth(month: string, locale: string) {
  const date = new Date(toMonthStart(month));
  return {
    month: date.toLocaleDateString(locale, { month: "long", timeZone: "UTC" }),
    year: String(date.getUTCFullYear()),
  };
}

export function PermitSnapshotImage({ ref, bands, description, metric, month, sourceName }: PermitSnapshotImageProps) {
  const { t, i18n } = useTranslation("statistics");
  const localizedMonth = getLocalizedMonth(month, i18n.language);
  const title =
    sourceName === null
      ? t("permitsByMonth.export.registerImageTitle", localizedMonth)
      : t("permitsByMonth.export.imageTitle", { ...localizedMonth, source: sourceName });

  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 z-[-1]">
      <div ref={ref} className="box-border flex flex-col overflow-hidden bg-black px-12 py-10 font-sans text-white" style={EXPORT_CANVAS_STYLE}>
        <header className="flex h-28 shrink-0 items-center justify-between border-b border-white/20 pb-6">
          <div className="flex min-w-0 items-center gap-8">
            <img src="/btsearch.webp" alt="" width={185} height={65} className="h-[65px] w-[185px] shrink-0 brightness-0 invert" draggable={false} />
            <div className="min-w-0 border-l border-white/20 pl-8">
              <h1 className="truncate text-[42px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
              <p className="mt-1 text-lg text-zinc-400">
                {t(`permitsByMonth.views.${metric}`)} · {description}
              </p>
            </div>
          </div>
          <div className="ml-8 flex shrink-0 items-center gap-8 text-lg text-zinc-300">
            <span className="flex items-center gap-3">
              <span className="h-4 w-7 bg-white" />
              {t("common:status.all")}
            </span>
            <span className="flex items-center gap-3">
              <span className="h-4 w-7 border border-white bg-[repeating-linear-gradient(135deg,transparent_0,transparent_3px,white_3px,white_4px)]" />
              {t("common:labels.new")}
            </span>
          </div>
        </header>
        <div className="mt-4 flex min-h-0 flex-1 flex-wrap overflow-hidden border-l border-t border-white/15">
          {bands.map((band) => (
            <div key={band.key} className="flex min-w-0" style={getBandCellStyle(band.rows.length, "export")}>
              <PermitSnapshotBandChart band={band} metric={metric} mode="export" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

  downloadBlob(blob, filename);
}
