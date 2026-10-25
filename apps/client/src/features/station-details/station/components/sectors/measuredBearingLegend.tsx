import { useTranslation } from "react-i18next";

type MeasuredBearingLegendProps = {
  color: string;
};

export function MeasuredBearingLegend({ color }: MeasuredBearingLegendProps) {
  const { t } = useTranslation("stationDetails");

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="block">
          <path d="M7 12.5L4.6 1.9A10.6 10.6 0 0 1 9.4 1.9Z" fill={color} fillOpacity={0.3} stroke={color} strokeLinejoin="round" />
        </svg>
        {t("sectors.enteredAzimuth")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="block">
          <path
            d="M7 12.5L1.3 3.4A10.6 10.6 0 0 1 12.7 3.4Z"
            strokeDasharray="2 2"
            strokeLinejoin="round"
            className="fill-foreground/7 stroke-foreground/45"
          />
          <line x1="7" y1="12" x2="7" y2="2.2" strokeWidth="1.25" strokeLinecap="round" className="stroke-foreground/60" />
        </svg>
        {t("sectors.measured")}
      </span>
    </div>
  );
}
