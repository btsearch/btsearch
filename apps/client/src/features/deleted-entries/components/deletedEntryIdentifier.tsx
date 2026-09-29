import { getDeletedEntryIdentifier, getDeletedEntryOperator } from "../labels";
import type { DeletedEntry } from "../types";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { cn } from "@/lib/utils";

type DeletedEntryIdentifierProps = {
  entry: DeletedEntry;
  inline?: boolean;
  className?: string;
};

export function DeletedEntryIdentifier({ entry, inline = false, className }: DeletedEntryIdentifierProps) {
  const { label, detail } = getDeletedEntryIdentifier(entry);
  const operator = getDeletedEntryOperator(entry);

  return (
    <span className={cn("flex min-w-0", inline ? "items-center gap-2" : "flex-col gap-0.5", className)}>
      <span className={cn("flex min-w-0 items-center gap-2", inline ? "text-sm font-medium" : "text-xs")}>
        {operator ? (
          <span className="flex shrink-0">
            <DialogOperatorName name={operator.name} mnc={operator.mnc} compact />
          </span>
        ) : null}
        {label ? (
          <span className="min-w-0 truncate" title={label}>
            {label}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </span>
      {detail ? (
        <span className={cn("min-w-0 truncate text-muted-foreground", inline ? "text-xs" : "text-[10px]")} title={detail}>
          {detail}
        </span>
      ) : null}
    </span>
  );
}
