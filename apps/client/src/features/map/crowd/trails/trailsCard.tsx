import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Reveal } from "../../components/search-overlay/mapFilterMotion";
import type { MapOperator } from "../../data/mapLookups";
import { CARD_NOTE_CLASS, CARD_SECTION_TITLE_CLASS, CollapseButton, SwitchRow } from "../card/cardParts";
import { LegendTitle, LevelLegend, MyTrailsLegend } from "../card/crowdLegend";
import type { TileStatus } from "../layers/useVectorFillLayer";
import type { CrowdTheme } from "../style/palette";
import { BrandMark } from "@/components/cellular/brandMark";
import { InlineError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type TrailsPrivateNote = "guest" | "admin";

export type TrailBandNote = { label: number; mhz: string; codes: string };

type TrailsCardProps = {
  theme: CrowdTheme;
  operators: readonly MapOperator[];
  operatorId: number | null;
  onOperatorChange: (operatorId: number) => void;
  canShowMine: boolean;
  isMine: boolean;
  onMineChange: (isMine: boolean) => void;
  status: TileStatus;
  isZoomedOut: boolean;
  onRetry: () => void;
  bandNotes: readonly TrailBandNote[];
  privateNote: TrailsPrivateNote | null;
};

export function TrailsCard({
  theme,
  operators,
  operatorId,
  onOperatorChange,
  canShowMine,
  isMine,
  onMineChange,
  status,
  isZoomedOut,
  onRetry,
  bandNotes,
  privateNote,
}: TrailsCardProps) {
  const { t } = useTranslation("main");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const operatorName = operators.find((entry) => entry.operator.id === operatorId)?.operator.name ?? "";
  const hasFailed = status === "error";
  const showsPrivateNote = privateNote !== null && !isMine;

  return (
    <>
      <div className="mb-2 flex items-center gap-1.5">
        <h3 className={CARD_SECTION_TITLE_CLASS}>{t("crowd.trails.title")}</h3>
        {status === "loading" ? <Spinner className="size-3" /> : null}
        <span className="flex-1" />
        <CollapseButton isCollapsed={isCollapsed} onToggle={() => setIsCollapsed((collapsed) => !collapsed)} />
      </div>
      {operators.length > 0 ? (
        <Tabs value={operatorId === null ? null : String(operatorId)} onValueChange={(value) => onOperatorChange(Number(value))}>
          <TabsList aria-label={t("crowd.trails.network")} className="w-full">
            {operators.map(({ operator, brand, color }) => (
              <TabsTrigger key={operator.id} value={String(operator.id)} className="cursor-pointer text-xs">
                <BrandMark brand={{ color, logo: brand?.logo ?? null }} size={14} />
                {operator.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
      <Reveal shown={!isCollapsed}>
        {canShowMine ? (
          <SwitchRow
            label={t("crowd.trails.mine")}
            checked={isMine}
            onCheckedChange={onMineChange}
            className="-mx-1.5 mt-1 h-7 justify-between px-1.5"
          />
        ) : null}
        {!isMine && !hasFailed ? (
          <div className="mt-2.5">
            <p className="mb-1.5 text-xs leading-4 font-medium">
              <LegendTitle title={t("crowd.legend.signal")} unit="dBm" />
            </p>
            <LevelLegend theme={theme} caption={t("crowd.trails.levelCaption")} />
          </div>
        ) : null}
        {isMine && !hasFailed ? (
          <div className="mt-2.5">
            <MyTrailsLegend theme={theme} />
          </div>
        ) : null}
        {bandNotes.length > 0 && !isMine && !hasFailed && privateNote !== "guest" ? (
          <p className={CARD_NOTE_CLASS}>
            {t("crowd.trails.bandsFromFilters")}{" "}
            {bandNotes.map((note, index) => (
              <span key={note.label} className="whitespace-nowrap">
                <span className="font-mono font-semibold text-foreground/80">{note.mhz}</span>
                {note.codes === "" ? null : <span className="font-mono"> {note.codes}</span>}
                {index < bandNotes.length - 1 ? ", " : null}
              </span>
            ))}
          </p>
        ) : null}
        {status === "empty" && !isMine && privateNote === null ? (
          <p className={CARD_NOTE_CLASS}>{t("crowd.trails.empty", { operator: operatorName })}</p>
        ) : null}
        {status === "empty" && isMine ? <p className={CARD_NOTE_CLASS}>{t("crowd.trails.mineEmpty", { operator: operatorName })}</p> : null}
        {isZoomedOut ? <p className={CARD_NOTE_CLASS}>{t("crowd.trails.zoomIn")}</p> : null}
        {showsPrivateNote ? (
          <p className={CARD_NOTE_CLASS}>{privateNote === "admin" ? t("crowd.trails.privateAdmin") : t("crowd.trails.privateGuest")}</p>
        ) : null}
        {hasFailed ? <InlineError size="sm" title={t("crowd.trails.loadError")} onRetry={onRetry} className="mt-2" /> : null}
      </Reveal>
    </>
  );
}
