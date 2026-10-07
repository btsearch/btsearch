import { useState } from "react";

export function useOpeningCount(open: boolean): number {
  const [opening, setOpening] = useState({ count: 0, isOpen: open });
  if (opening.isOpen !== open) setOpening({ count: open ? opening.count + 1 : opening.count, isOpen: open });

  return opening.count;
}
