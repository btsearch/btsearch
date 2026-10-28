import type { VendorMark } from "../../lib/microwaveLinks";
import { toFillStyle } from "../blocks/stackedRows";

export function VendorLegend({ vendors }: { vendors: readonly VendorMark[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {vendors.map(({ operator: vendor, isUnknown = false }) => (
        <li key={vendor.id} className="inline-flex h-5 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
          <span aria-hidden="true" style={toFillStyle(vendor.color, isUnknown)} className="size-3 shrink-0 rounded-[2px]" />
          {vendor.name}
        </li>
      ))}
    </ul>
  );
}
