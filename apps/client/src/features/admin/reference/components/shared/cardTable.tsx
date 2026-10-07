import type { ComponentProps, ReactNode } from "react";

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type CardTableAlign = "start" | "end";

type CardTableProps = Omit<ComponentProps<"table">, "children"> & {
  head: ReactNode;
  children: ReactNode;
};

type CardTableHeadProps = Omit<ComponentProps<"th">, "align"> & {
  align?: CardTableAlign;
};

type CardTableCellProps = Omit<ComponentProps<"td">, "align"> & {
  align?: CardTableAlign;
};

const EDGE_PADDING_CLASS = "px-1.5 first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";

export function CardTable({ head, children, className, ...props }: CardTableProps) {
  return (
    <div className="custom-scrollbar overflow-x-auto border-t">
      <table className={cn("w-full text-sm", className)} {...props}>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">{head}</TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </table>
    </div>
  );
}

export function CardTableHead({ align = "start", className, ...props }: CardTableHeadProps) {
  return (
    <TableHead
      scope="col"
      className={cn("h-9 text-xs text-muted-foreground", EDGE_PADDING_CLASS, align === "end" && "text-right", className)}
      {...props}
    />
  );
}

export function CardTableRow({ className, ...props }: ComponentProps<"tr">) {
  return <TableRow className={cn("h-11", className)} {...props} />;
}

export function CardTableCell({ align = "start", className, ...props }: CardTableCellProps) {
  return <TableCell className={cn("py-1.5", EDGE_PADDING_CLASS, align === "end" && "text-right", className)} {...props} />;
}
