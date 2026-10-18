import { useTranslation } from "react-i18next";

import { CopyButton } from "../../../components/copyButton";
import { type OperatorMark, OperatorMarks } from "@/features/shared/operatorMarks";
import { cn } from "@/lib/utils";

const CHIP_CLASS =
  "relative inline-flex h-6 items-center gap-1.5 rounded-md bg-background/60 pl-2 pr-1 ring-1 ring-inset ring-border/70 [&_button]:opacity-100";

type SharedValueChipProps = {
  label: string;
  value: number;
};

type SharedNetworksChipProps = {
  label: string;
  rat: string;
  marks: readonly OperatorMark[];
};

export function SharedValueChip({ label, value }: SharedValueChipProps) {
  return (
    <span className={CHIP_CLASS}>
      <span className="text-[11px] font-medium leading-4 text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
      <CopyButton text={String(value)} fieldLabel={label} compact />
    </span>
  );
}

export function SharedNetworksChip({ label, rat, marks }: SharedNetworksChipProps) {
  const { t } = useTranslation("common");

  return (
    <span className={cn(CHIP_CLASS, "pr-2")}>
      <span className="text-[11px] font-medium leading-4 text-muted-foreground">{label}</span>
      <OperatorMarks marks={marks} title={t("sharedNetworks.cellTitle")} description={t("sharedNetworks.tableHint", { rat })} size={14} />
    </span>
  );
}
