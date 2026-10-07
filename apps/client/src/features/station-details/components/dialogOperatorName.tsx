import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { cn } from "@/lib/utils";

type DialogOperatorNameProps = {
  name: string;
  brand: BrandLook | null;
  compact?: boolean;
  labelClassName?: string;
};

export function DialogOperatorName({ name, brand, compact = false, labelClassName }: DialogOperatorNameProps) {
  const Root = compact ? "span" : "div";

  return (
    <Root className={cn("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}>
      <BrandMark brand={brand} size={compact ? 16 : 20} />
      {compact ? (
        <span className={cn("min-w-0 truncate text-xs font-medium text-foreground", labelClassName)}>{name}</span>
      ) : (
        <h2 className={cn("min-w-0 truncate text-base font-semibold leading-5 tracking-tight text-foreground", labelClassName)}>{name}</h2>
      )}
    </Root>
  );
}
