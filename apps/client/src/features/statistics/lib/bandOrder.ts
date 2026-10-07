import { useQuery } from "@tanstack/react-query";

import { registerBandsQueryOptions } from "@/features/map/api";

type OrderedBand = { id: number; name: string };
export type BandComparator = (a: OrderedBand, b: OrderedBand) => number;

function compareBandsByName(a: OrderedBand, b: OrderedBand): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

function toRegisterBandComparator(registerBands: readonly { id: number }[]): BandComparator {
  const positions = new Map(registerBands.map((band, index) => [band.id, index]));
  return (a, b) => {
    const positionA = positions.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const positionB = positions.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return positionA - positionB || compareBandsByName(a, b);
  };
}

export function useRegisterBandComparator(): BandComparator {
  const { data } = useQuery({ ...registerBandsQueryOptions(), select: toRegisterBandComparator });
  return data ?? compareBandsByName;
}
