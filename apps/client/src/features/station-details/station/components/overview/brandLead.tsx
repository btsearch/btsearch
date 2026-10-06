import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";

type BrandLeadProps = {
  brand: BrandLook | null;
  isPending: boolean;
};

export function BrandLead({ brand, isPending }: BrandLeadProps) {
  const isMarkShown = brand !== null || !isPending;

  return <span className="flex h-4 min-w-4 items-center justify-center">{isMarkShown ? <BrandMark brand={brand} size={16} /> : null}</span>;
}
