import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { RAT_FIELDS, RAT_ORDER } from "../../model/ratFields";
import type { Rat } from "../../model/types";
import { EmptyPanel } from "@/components/content/emptyPanel";
import { Button } from "@/components/ui/button";

type AddRatButtonsProps = {
  rats: readonly Rat[];
  size: "default" | "sm";
  onAdd: (rat: Rat) => void;
};

type EmptyCellsProps = {
  canEdit: boolean;
  onAdd: (rat: Rat) => void;
};

type AddTechnologyRowProps = {
  rats: readonly Rat[];
  onAdd: (rat: Rat) => void;
};

function AddRatButtons({ rats, size, onAdd }: AddRatButtonsProps) {
  return (
    <>
      {rats.map((rat) => (
        <Button key={rat} type="button" variant="outline" size={size} onClick={() => onAdd(rat)} className="cursor-pointer">
          <HugeiconsIcon icon={Add01Icon} aria-hidden="true" />
          {RAT_FIELDS[rat].generation} {RAT_FIELDS[rat].name}
        </Button>
      ))}
    </>
  );
}

export function EmptyCells({ canEdit, onAdd }: EmptyCellsProps) {
  const { t } = useTranslation();

  return (
    <EmptyPanel className="h-auto flex-col border-dashed px-6 py-7">
      <p className="text-[15px] leading-[22px] font-semibold text-foreground">{t("stations:edit.cells.empty.title")}</p>
      {canEdit ? (
        <>
          <p className="mt-0.5 text-[13px] leading-[18px]">{t("stations:edit.cells.empty.description")}</p>
          <div className="mt-3.5 flex flex-wrap justify-center gap-2">
            <AddRatButtons rats={RAT_ORDER} size="default" onAdd={onAdd} />
          </div>
        </>
      ) : null}
    </EmptyPanel>
  );
}

export function AddTechnologyRow({ rats, onAdd }: AddTechnologyRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-1">
      <span className="text-xs text-muted-foreground">{t("stations:edit.cells.empty.addTechnology")}</span>
      <AddRatButtons rats={rats} size="sm" onAdd={onAdd} />
    </div>
  );
}
