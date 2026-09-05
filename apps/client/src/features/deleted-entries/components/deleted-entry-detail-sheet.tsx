import { useTranslation } from "react-i18next";

import { UKESourceBadge } from "@/components/cellular/uke-source-badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatFullDate } from "@/lib/format";

import type { DeletedEntry } from "../types";

const SOURCE_TABLE_LABELS: Record<string, string> = {
  uke_permits: "UKE Permits",
  uke_radiolines: "UKE Radiolines",
};

function Value({ value }: { value: unknown }): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">-</span>;
  if (typeof value === "boolean") return <span className="font-mono">{String(value)}</span>;
  if (typeof value === "number") return <span className="font-mono">{value}</span>;
  if (typeof value === "string") return <span className="break-all">{value}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">[]</span>;
    return (
      <div className="flex flex-col gap-0.5">
        {value.map((item, i) => (
          <div key={`${String(item)}-${i}`} className="flex gap-2">
            <span className="text-muted-foreground text-[10px] select-none w-4 text-right">{i + 1}.</span>
            <span className="break-all">
              <Value value={item} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="flex flex-col gap-1 pl-2 border-l-2 border-muted/50 my-1">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground font-mono">{k}</span>
            <div className="pl-1">
              <Value value={v} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return String(value as string | number | boolean | bigint);
}

interface DeletedEntryDetailSheetProps {
  entry: DeletedEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeletedEntryDetailSheet({ entry, open, onOpenChange }: DeletedEntryDetailSheetProps) {
  const { t, i18n } = useTranslation(["deletedEntries"]);

  if (!entry) return null;

  const dataKeys = Object.keys(entry.data);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-xl! sm:max-w-5xl! overflow-y-auto custom-scrollbar">
        <SheetHeader>
          <SheetTitle>{t("deletedEntries.detail.title")}</SheetTitle>
          <SheetDescription>
            #{entry.source_id} · {formatFullDate(entry.deleted_at, i18n.language)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-4">
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("deletedEntries.detail.overview")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("deletedEntries.columns.sourceTable")}</span>
                <span className="text-sm font-medium">{SOURCE_TABLE_LABELS[entry.source_table] ?? entry.source_table}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("deletedEntries.columns.sourceType")}</span>
                <span className="text-sm font-medium">
                  <UKESourceBadge source={entry.source_type} />
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("deletedEntries.columns.sourceId")}</span>
                <span className="text-sm font-mono">#{entry.source_id}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("deletedEntries.columns.importId")}</span>
                <span className="text-sm font-mono">{entry.import_id !== null ? `#${entry.import_id}` : "-"}</span>
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("deletedEntries.columns.deletedAt")}</span>
                <span className="text-sm">{formatFullDate(entry.deleted_at, i18n.language)}</span>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("deletedEntries.detail.data")}</h3>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs table-fixed">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-1/3">{t("deletedEntries.detail.field")}</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-2/3">{t("deletedEntries.detail.value")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dataKeys.map((key) => (
                    <tr key={key} className="border-b last:border-0 group hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-mono text-muted-foreground align-top font-medium break-all">{key}</td>
                      <td className="px-3 py-2 font-mono break-all align-top">
                        <Value value={entry.data[key]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
