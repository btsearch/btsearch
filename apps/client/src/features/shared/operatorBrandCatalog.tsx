import type { Brand, Operator } from "@openbts/shared/contract";
import { createContext } from "react";

type OperatorBrandCatalog = {
  operators: readonly Operator[] | undefined;
  brands: readonly Brand[] | undefined;
};

export const OperatorBrandCatalogContext = createContext<OperatorBrandCatalog>({ operators: undefined, brands: undefined });
