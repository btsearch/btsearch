import { useTranslation } from "react-i18next";

import type { AuditSnapshot } from "../types";
import { cn } from "@/lib/utils";

type ValueComparison = {
  value: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRenderableNestedValues(value: unknown): boolean {
  if (Array.isArray(value)) {
    if (value.every(isObject)) return value.some((item) => Object.keys(item).length > 0);
    return value.length > 0;
  }
  if (isObject(value)) return Object.keys(value).length > 0;
  return false;
}

function tryParseJson(value: string): unknown {
  if (!value.startsWith("{") && !value.startsWith("[")) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function ObjectValue({
  value,
  compareWith,
  highlightAll = false,
  variant,
}: {
  value: Record<string, unknown>;
  compareWith?: Record<string, unknown>;
  highlightAll?: boolean;
  variant?: "old" | "new";
}) {
  return (
    <div className="flex flex-col gap-1 pl-2 border-l-2 border-muted/50 my-1">
      {Object.entries(value).map(([key, nestedValue]) => {
        const fieldChanged = highlightAll || (compareWith !== undefined && JSON.stringify(nestedValue) !== JSON.stringify(compareWith[key]));
        return (
          <div
            key={key}
            className={cn(
              "flex flex-col gap-0.5 rounded-sm px-1 -mx-1",
              fieldChanged && variant === "old" && "bg-red-500/10",
              fieldChanged && variant === "new" && "bg-emerald-500/10",
            )}
          >
            <span className="text-[10px] text-muted-foreground font-mono">{key}</span>
            <div className="pl-1">
              <Value value={nestedValue} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ObjectArrayValue({
  items,
  compareItems,
  highlightAll = false,
  variant,
}: {
  items: Record<string, unknown>[];
  compareItems?: Record<string, unknown>[];
  highlightAll?: boolean;
  variant?: "old" | "new";
}) {
  return (
    <div className="flex flex-col gap-2 pl-2 border-l-2 border-muted/50 my-1">
      {items.map((item, index) => {
        const counterpart = compareItems?.[index];
        const counterpartMissing = compareItems !== undefined && counterpart === undefined;
        return (
          <div key={`object-${index}`} className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-muted-foreground font-semibold">Item {index + 1}</span>
            <div className="pl-2 border-l border-muted/30">
              {Object.entries(item).map(([key, nestedValue]) => {
                const fieldChanged =
                  highlightAll ||
                  counterpartMissing ||
                  (counterpart !== undefined && JSON.stringify(nestedValue) !== JSON.stringify(counterpart[key]));
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex gap-2 text-xs py-0.5 rounded-sm px-1 -mx-1",
                      fieldChanged && variant === "old" && "bg-red-500/10",
                      fieldChanged && variant === "new" && "bg-emerald-500/10",
                    )}
                  >
                    <span className="text-muted-foreground min-w-20 shrink-0 font-mono">{key}:</span>
                    <span className="break-all">
                      <Value value={nestedValue} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PrimitiveArrayValue({
  items,
  compareItems,
  highlightAll = false,
  variant,
}: {
  items: unknown[];
  compareItems?: unknown[];
  highlightAll?: boolean;
  variant?: "old" | "new";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item, index) => {
        const fieldChanged = highlightAll || (compareItems !== undefined && JSON.stringify(item) !== JSON.stringify(compareItems[index]));
        return (
          <div
            key={`${String(item)}-${index}`}
            className={cn(
              "flex gap-2 rounded-sm px-1 -mx-1",
              fieldChanged && variant === "old" && "bg-red-500/10",
              fieldChanged && variant === "new" && "bg-emerald-500/10",
            )}
          >
            <span className="text-muted-foreground text-[10px] select-none min-w-4 text-right">{index + 1}.</span>
            <span className="break-all">
              <Value value={item} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

const nullPlaceholder = <span className="text-muted-foreground">-</span>;
const emptyArrayPlaceholder = <span className="text-muted-foreground">[]</span>;

function resolveValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return tryParseJson(value) ?? value;
}

function Value({ value, comparison, variant }: { value: unknown; comparison?: ValueComparison; variant?: "old" | "new" }): React.ReactNode {
  if (value === null || value === undefined) return nullPlaceholder;

  if (Array.isArray(value)) {
    if (value.length === 0) return emptyArrayPlaceholder;
    const compareArray = Array.isArray(comparison?.value) ? comparison.value : undefined;
    const highlightAll = comparison !== undefined && compareArray === undefined;
    if (value.every(isObject)) {
      const compareObjectArray = compareArray?.every(isObject) ? compareArray : undefined;
      return (
        <ObjectArrayValue
          items={value}
          compareItems={compareObjectArray}
          highlightAll={highlightAll || (compareArray !== undefined && compareObjectArray === undefined)}
          variant={variant}
        />
      );
    }
    return <PrimitiveArrayValue items={value} compareItems={compareArray} highlightAll={highlightAll} variant={variant} />;
  }

  if (isObject(value)) {
    const compareObject = isObject(comparison?.value) ? comparison.value : undefined;
    return (
      <ObjectValue
        value={value}
        compareWith={compareObject}
        highlightAll={comparison !== undefined && compareObject === undefined}
        variant={variant}
      />
    );
  }

  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    if (parsed !== undefined) return <Value value={parsed} comparison={comparison} variant={variant} />;
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return nullPlaceholder;
}

function SnapshotPair({ oldValues, newValues }: { oldValues: AuditSnapshot; newValues: AuditSnapshot }) {
  const { t } = useTranslation("admin");
  const hasComparison = oldValues !== null && newValues !== null;
  return (
    <div className={hasComparison ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "flex"}>
      {oldValues !== null ? (
        <div className="min-w-0 rounded-sm bg-red-500/10 p-2 font-mono text-xs break-all">
          <span className="mb-1 block text-[10px] font-semibold text-red-400">{t("auditLogs.detail.oldValues")}</span>
          <Value value={oldValues} comparison={hasComparison ? { value: newValues } : undefined} variant="old" />
        </div>
      ) : null}
      {newValues !== null ? (
        <div className="min-w-0 rounded-sm bg-emerald-500/10 p-2 font-mono text-xs break-all">
          <span className="mb-1 block text-[10px] font-semibold text-emerald-400">{t("auditLogs.detail.newValues")}</span>
          <Value value={newValues} comparison={hasComparison ? { value: oldValues } : undefined} variant="new" />
        </div>
      ) : null}
    </div>
  );
}

export function ChangesTable({ oldValues, newValues }: { oldValues: AuditSnapshot; newValues: AuditSnapshot }) {
  const { t } = useTranslation("admin");

  if (oldValues === null && newValues === null) return <p className="text-muted-foreground text-xs italic">{t("auditLogs.detail.noChanges")}</p>;

  const oldRecord = isObject(oldValues) ? oldValues : null;
  const newRecord = isObject(newValues) ? newValues : null;

  if ((oldValues !== null && oldRecord === null) || (newValues !== null && newRecord === null))
    return (
      <div className="rounded-lg border p-3 overflow-hidden">
        <SnapshotPair oldValues={oldValues} newValues={newValues} />
      </div>
    );

  const allKeys = [...new Set([...Object.keys(oldRecord ?? {}), ...Object.keys(newRecord ?? {})])];
  const fieldRows = allKeys.map((key) => {
    const rawOld = oldRecord?.[key];
    const rawNew = newRecord?.[key];
    const oldValue = resolveValue(rawOld);
    const newValue = resolveValue(rawNew);
    return {
      key,
      oldValue,
      newValue,
      changed: oldRecord !== null && newRecord !== null && JSON.stringify(rawOld) !== JSON.stringify(rawNew),
      oldHasNestedValues: hasRenderableNestedValues(oldValue),
      newHasNestedValues: hasRenderableNestedValues(newValue),
    };
  });

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="hidden sm:table w-full text-xs table-fixed">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-1/4">{t("auditLogs.detail.field")}</th>
            {oldRecord !== null ? (
              <th className="text-left px-3 py-2 font-medium text-red-400 w-[37.5%]">{t("auditLogs.detail.oldValues")}</th>
            ) : null}
            {newRecord !== null ? (
              <th className="text-left px-3 py-2 font-medium text-emerald-400 w-[37.5%]">{t("auditLogs.detail.newValues")}</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {fieldRows.map(({ key, oldValue, newValue, changed, oldHasNestedValues, newHasNestedValues }) => (
            <tr key={key} className="border-b last:border-0 group hover:bg-muted/20 transition-colors">
              <td className="px-3 py-2 font-mono text-muted-foreground align-top font-medium break-all">{key}</td>
              {oldRecord !== null ? (
                <td className={cn("px-3 py-2 font-mono break-all align-top", changed && !oldHasNestedValues && "bg-red-500/5")}>
                  <Value value={oldValue} comparison={newRecord !== null ? { value: newValue } : undefined} variant="old" />
                </td>
              ) : null}
              {newRecord !== null ? (
                <td className={cn("px-3 py-2 font-mono break-all align-top", changed && !newHasNestedValues && "bg-emerald-500/5")}>
                  <Value value={newValue} comparison={oldRecord !== null ? { value: oldValue } : undefined} variant="new" />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sm:hidden divide-y">
        {fieldRows.map(({ key, oldValue, newValue, changed, oldHasNestedValues, newHasNestedValues }) => (
          <div key={key} className="px-3 py-2 text-xs space-y-1.5">
            <span className="font-mono font-medium text-muted-foreground">{key}</span>
            <div className={oldRecord !== null && newRecord !== null ? "grid grid-cols-2 gap-2" : "flex"}>
              {oldRecord !== null ? (
                <div className={cn("min-w-0 font-mono break-all rounded-sm p-1.5", changed && !oldHasNestedValues ? "bg-red-500/10" : "bg-muted/30")}>
                  <span className="block text-[10px] text-red-400 font-semibold mb-1">{t("auditLogs.detail.oldValues")}</span>
                  <Value value={oldValue} comparison={newRecord !== null ? { value: newValue } : undefined} variant="old" />
                </div>
              ) : null}
              {newRecord !== null ? (
                <div
                  className={cn("min-w-0 font-mono break-all rounded-sm p-1.5", changed && !newHasNestedValues ? "bg-emerald-500/10" : "bg-muted/30")}
                >
                  <span className="block text-[10px] text-emerald-400 font-semibold mb-1">{t("auditLogs.detail.newValues")}</span>
                  <Value value={newValue} comparison={oldRecord !== null ? { value: oldValue } : undefined} variant="new" />
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
