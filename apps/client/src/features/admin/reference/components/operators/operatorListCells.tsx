import { formatPlmn } from "../../utils/plmn";
import { BrandTile } from "../shared/brandTile";
import { type Loadable, isZeroCount } from "../shared/loadable";
import { CountValue, MONO_TEXT_CLASS } from "../shared/values";
import type { OperatorListRow, OperatorNetworkRef } from "./useOperatorListRows";
import { BrandMark } from "@/components/cellular/brandMark";
import { EmptyValue } from "@/components/ui/emptyValue";
import { cn } from "@/lib/utils";

export function OperatorIdentity({ row }: { row: OperatorListRow }) {
  const { operator, brand } = row;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandTile brand={brand} size={32} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{operator.name}</div>
        <div className="truncate text-xs text-muted-foreground">{operator.legalName}</div>
      </div>
    </div>
  );
}

export function OperatorPlmnCode({ plmn }: { plmn: string | null }) {
  if (plmn === null) return <EmptyValue />;
  return <span className={MONO_TEXT_CLASS}>{formatPlmn(plmn)}</span>;
}

export function OperatorNetworks({ networks }: { networks: readonly OperatorNetworkRef[] }) {
  if (networks.length === 0) return <EmptyValue />;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
      {networks.map((network) => (
        <span key={network.id} className="inline-flex min-w-0 items-center gap-1.5">
          <BrandMark brand={network.brand} size={16} />
          <span className="truncate">{network.name}</span>
        </span>
      ))}
    </div>
  );
}

export function OperatorStationTotal({ stationCount }: { stationCount: Loadable<number> }) {
  return (
    <span className={cn(MONO_TEXT_CLASS, isZeroCount(stationCount) && "text-muted-foreground")}>
      <CountValue count={stationCount} skeletonClassName="h-4 w-12" />
    </span>
  );
}
