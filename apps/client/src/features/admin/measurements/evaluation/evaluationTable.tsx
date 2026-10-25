import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { formatShare } from "../utils/format";
import { isRadiusOnTarget } from "./evaluationScores";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WARNING_TEXT_CLASS } from "@/features/admin/settings/components/classNames";
import { SettingsCardNote } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type ScoreAlign = "start" | "end";
type ScoreTone = "default" | "muted" | "warning";

type ScoreHeadProps = Omit<ComponentProps<"th">, "align"> & {
  align?: ScoreAlign;
};

type ScoreCellProps = Omit<ComponentProps<"td">, "align"> & {
  align?: ScoreAlign;
  tone?: ScoreTone;
};

export const NO_VALUE = "-";

const EDGE_PADDING_CLASS = "px-2 first:pl-4 last:pr-4";
const TONE_CLASSES = { default: null, muted: "text-muted-foreground", warning: WARNING_TEXT_CLASS } as const satisfies Record<
  ScoreTone,
  string | null
>;

export function ScoreTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <Table className="tabular-nums">
      <TableHeader>
        <TableRow className="hover:bg-transparent">{head}</TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

export function ScoreHead({ align = "end", className, ...props }: ScoreHeadProps) {
  return (
    <TableHead
      scope="col"
      className={cn("h-9 text-[13px] text-muted-foreground", EDGE_PADDING_CLASS, align === "end" && "text-right", className)}
      {...props}
    />
  );
}

export function ScoreRow({ className, ...props }: ComponentProps<"tr">) {
  return <TableRow className={cn("h-10 hover:bg-transparent", className)} {...props} />;
}

export function ScoreCell({ align = "end", tone = "default", className, ...props }: ScoreCellProps) {
  return <TableCell className={cn("py-1.5", EDGE_PADDING_CLASS, align === "end" && "text-right", TONE_CLASSES[tone], className)} {...props} />;
}

export function InsideShareCell({ share }: { share: number | null }) {
  const { i18n } = useTranslation();

  if (share === null) return <ScoreCell tone="muted">{NO_VALUE}</ScoreCell>;
  return <ScoreCell tone={isRadiusOnTarget(share) ? "default" : "warning"}>{formatShare(share, i18n.language)}</ScoreCell>;
}

export function ScoreCardHeadNote({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}

export function ScoreCardNote({ children }: { children: ReactNode }) {
  return <SettingsCardNote className="mt-auto sm:px-4">{children}</SettingsCardNote>;
}

export function ScoreCardEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}
