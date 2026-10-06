import { useCallback } from "react";

import type { DraftKey } from "../../model/types";
import { useEditPage } from "../frame/editPage";

export function useSectorReveal(): (sectorKey: DraftKey) => void {
  const { reveal } = useEditPage();
  return useCallback((sectorKey: DraftKey) => reveal({ scope: "sector", key: sectorKey, field: "degrees" }), [reveal]);
}
