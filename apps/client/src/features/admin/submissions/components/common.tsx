export function ChangeBadge({ label, current }: { label: string; current: string }) {
  return (
    <div className="flex items-start gap-1.5 mt-1 text-xs">
      <span className="size-1.5 rounded-full bg-amber-500 shrink-0 mt-[5px]" />
      <span className="text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap shrink-0">{label}:</span>
      <span className="font-mono text-foreground min-w-0 wrap-break-word">{current || "-"}</span>
    </div>
  );
}
