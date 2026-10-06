import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { EditKind } from "../../model/types";
import { ToneDot } from "./ratCardHeader";
import { ShortcutsPopover } from "./shortcutsPopover";

type CellsToolbarProps = {
  editKind: EditKind;
};

type LegendItemProps = {
  children: ReactNode;
};

const WAS_SAMPLE = "123";

function LegendItem({ children }: LegendItemProps) {
  return <span className="inline-flex items-center gap-[5px]">{children}</span>;
}

function ReviewLegend() {
  const { t } = useTranslation();

  return (
    <span className="hidden items-center gap-3 text-xs whitespace-nowrap text-muted-foreground @[640px]/panel:flex">
      <LegendItem>
        <ToneDot tone="added" />
        {t("stations:cells.diffAdded", { count: 1 })}
      </LegendItem>
      <LegendItem>
        <ToneDot tone="changed" />
        {t("stations:cells.diffModified", { count: 1 })}
      </LegendItem>
      <LegendItem>
        <ToneDot tone="deleted" />
        {t("stations:cells.diffDeleted", { count: 1 })}
      </LegendItem>
      <LegendItem>
        <span aria-hidden="true" className="size-2.5 rounded-[3px] border border-primary bg-primary/10" />
        {t("stations:edit.frame.ownCorrection")}
      </LegendItem>
      <LegendItem>
        <s aria-hidden="true" className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
          {WAS_SAMPLE}
        </s>
        {t("stations:edit.cells.legend.wasInDatabase")}
      </LegendItem>
    </span>
  );
}

export function CellsToolbar({ editKind }: CellsToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-7 items-center gap-2 pr-0.5 pl-1">
      <h2 className="shrink-0 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">{t("common:labels.cells")}</h2>
      <div aria-hidden="true" className="h-px min-w-4 flex-1 bg-border" />
      {editKind === "review" ? <ReviewLegend /> : null}
      <ShortcutsPopover />
    </div>
  );
}
