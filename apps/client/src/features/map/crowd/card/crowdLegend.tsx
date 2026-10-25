import { useTranslation } from "react-i18next";

import {
  type CrowdTheme,
  EDGE_COLORS,
  LEVEL_COLORS,
  LEVEL_TICKS_DBM,
  MY_TRAIL_BUCKETS,
  MY_TRAIL_COLORS,
  NO_SINR_COLORS,
  NO_SINR_OPACITY,
  SINR_COLORS,
  SINR_TICKS_DB,
} from "../style/palette";
import { CARD_SECTION_TITLE_CLASS } from "./cardParts";
import { cn } from "@/lib/utils";

type RampProps = {
  colors: readonly string[];
  ticks: readonly number[];
  unit: string;
};

type LegendTitleProps = {
  title: string;
  unit: string;
};

type EdgesLegendProps = {
  theme: CrowdTheme;
  caption: string;
  showsTitle: boolean;
};

const SWATCH_CLASS = "block h-2.5 flex-1 rounded-xs";
const TICKS_CLASS = "relative mt-0.75 h-3.5 font-mono text-[10px] leading-3.5 text-muted-foreground tabular-nums";
const CAPTION_CLASS = "mt-1.5 text-[11px] leading-4 text-muted-foreground";
const EDGE_SAMPLES = [
  { kind: "handedOver", dash: undefined, width: 2, opacity: 1 },
  { kind: "faded", dash: "7 5", width: 2, opacity: 1 },
  { kind: "otherLayer", dash: "0.1 5", width: 2, opacity: 1 },
  { kind: "unmeasured", dash: undefined, width: 1, opacity: 0.7 },
] as const;

function Ramp({ colors, ticks, unit }: RampProps) {
  const { t } = useTranslation("main");
  const titles = colors.map((_, index) => {
    if (index === 0) return t("crowd.legend.below", { value: ticks[0], unit });
    if (index === colors.length - 1) return t("crowd.legend.above", { value: ticks[ticks.length - 1], unit });
    return t("crowd.legend.between", { from: ticks[index - 1], to: ticks[index], unit });
  });

  return (
    <>
      <div className="flex gap-0.5">
        {colors.map((color, index) => (
          <span key={color} title={titles[index]} className={SWATCH_CLASS} style={{ background: color }} />
        ))}
      </div>
      <div aria-hidden="true" className={TICKS_CLASS}>
        {ticks.map((tick, index) => (
          <span key={tick} className="absolute -translate-x-1/2" style={{ left: `${((index + 1) / colors.length) * 100}%` }}>
            {tick}
          </span>
        ))}
      </div>
    </>
  );
}

export function LegendTitle({ title, unit }: LegendTitleProps) {
  return (
    <span>
      {title} <span className="font-normal text-muted-foreground">({unit})</span>
    </span>
  );
}

export function LevelLegend({ theme, caption }: { theme: CrowdTheme; caption: string }) {
  return (
    <div>
      <Ramp colors={LEVEL_COLORS[theme]} ticks={LEVEL_TICKS_DBM} unit="dBm" />
      <p className={CAPTION_CLASS}>{caption}</p>
    </div>
  );
}

export function SinrLegend({ theme }: { theme: CrowdTheme }) {
  const { t } = useTranslation("main");

  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Ramp colors={SINR_COLORS[theme]} ticks={SINR_TICKS_DB} unit="dB" />
        </div>
        <div className="w-10 shrink-0">
          <span className="block h-2.5 rounded-xs" style={{ background: NO_SINR_COLORS[theme], opacity: NO_SINR_OPACITY }} />
          <span className="mt-0.75 block text-center text-[10px] leading-3.5 text-muted-foreground">{t("crowd.legend.noSinr")}</span>
        </div>
      </div>
      <p className={CAPTION_CLASS}>{t("crowd.legend.sinrCaption")}</p>
    </div>
  );
}

export function MyTrailsLegend({ theme }: { theme: CrowdTheme }) {
  const { t } = useTranslation("main");

  return (
    <div>
      <p className="mb-1.5 text-xs leading-4 font-medium">
        <LegendTitle title={t("crowd.trails.mineTitle")} unit={t("crowd.trails.readings")} />
      </p>
      <div className="flex gap-0.5">
        {MY_TRAIL_BUCKETS.map((bucket) => (
          <span key={bucket.label} className={SWATCH_CLASS} style={{ background: MY_TRAIL_COLORS[theme], opacity: bucket.alpha }} />
        ))}
      </div>
      <div aria-hidden="true" className="mt-0.75 flex font-mono text-[10px] leading-3.5 text-muted-foreground tabular-nums">
        {MY_TRAIL_BUCKETS.map((bucket) => (
          <span key={bucket.label} className="flex-1 text-center">
            {bucket.label}
          </span>
        ))}
      </div>
      <p className={CAPTION_CLASS}>{t("crowd.trails.mineCaption")}</p>
    </div>
  );
}

export function EdgesLegend({ theme, caption, showsTitle }: EdgesLegendProps) {
  const { t } = useTranslation("main");

  return (
    <div>
      {showsTitle ? <h4 className={cn(CARD_SECTION_TITLE_CLASS, "mb-1.5")}>{t("crowd.coverage.edges")}</h4> : null}
      <div className="grid grid-cols-[1.75rem_1fr] items-center gap-x-2 gap-y-1 text-[11px] leading-4">
        {EDGE_SAMPLES.map((sample) => (
          <span key={sample.kind} className="contents">
            <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true" className="block">
              <path
                d="M2 4H26"
                stroke={EDGE_COLORS[theme]}
                strokeWidth={sample.width}
                strokeOpacity={sample.opacity}
                strokeLinecap="round"
                strokeDasharray={sample.dash}
                fill="none"
              />
            </svg>
            <span>{t(`crowd.coverage.edgeKinds.${sample.kind}`)}</span>
          </span>
        ))}
      </div>
      <p className={CAPTION_CLASS}>{caption}</p>
    </div>
  );
}
