import { CopyButton } from "../../../components/copyButton";

const CHIP_CLASS =
  "relative inline-flex h-6 items-center gap-1.5 rounded-md bg-background/60 pl-2 pr-1 ring-1 ring-inset ring-border/70 [&_button]:opacity-100";

type SharedValueChipProps = {
  label: string;
  value: number;
};

export function SharedValueChip({ label, value }: SharedValueChipProps) {
  return (
    <span className={CHIP_CLASS}>
      <span className="text-[11px] font-medium leading-4 text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
      <CopyButton text={String(value)} compact />
    </span>
  );
}
