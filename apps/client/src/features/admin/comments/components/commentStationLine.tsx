import type { CommentStation } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { cn } from "@/lib/utils";

type CommentStationLineProps = {
  station: CommentStation;
  brand: BrandLook | null | undefined;
  operatorName?: string;
  onStationOpen?: () => void;
};

const LEADING_SITE_ID_CLASS = "shrink-0 font-mono text-[13px] leading-4 font-medium text-foreground";
const NAMED_SITE_ID_CLASS = "shrink-0 font-mono";

export function CommentStationLine({ station, brand, operatorName, onStationOpen }: CommentStationLineProps) {
  const { t } = useTranslation("terrainProfile");
  const city = station.location?.city ?? null;
  const siteIdClass = operatorName === undefined ? LEADING_SITE_ID_CLASS : NAMED_SITE_ID_CLASS;

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <BrandMark brand={brand} />
      {operatorName === undefined ? null : <span className="shrink-0 font-medium text-foreground">{operatorName}</span>}
      {onStationOpen === undefined ? (
        <span className={siteIdClass}>{station.siteId}</span>
      ) : (
        <button
          type="button"
          className={cn(
            siteIdClass,
            "cursor-pointer rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
          title={t("header.openStation")}
          aria-haspopup="dialog"
          onClick={onStationOpen}
        >
          {station.siteId}
        </button>
      )}
      {city === null ? null : (
        <>
          <span aria-hidden="true" className="shrink-0">
            ·
          </span>
          <span className="min-w-0 truncate">{city}</span>
        </>
      )}
    </div>
  );
}
