import { useCallback, useEffect, useState } from "react";

import type { SearchOption } from "./searchOptions";
import { getSearchOptionId } from "./searchOptions";

export function useSearchNavigation(options: SearchOption[], listboxId: string, resetKey: string) {
  const [activeState, setActiveState] = useState<{ key: string | null; resetKey: string }>({ key: null, resetKey });
  const requestedActiveKey = activeState.resetKey === resetKey ? activeState.key : null;
  const activeIndex = options.findIndex((option) => option.key === requestedActiveKey);
  const activeKey = activeIndex >= 0 ? requestedActiveKey : null;
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;
  const activeOptionId = activeKey ? getSearchOptionId(listboxId, activeKey) : undefined;

  useEffect(() => {
    if (!activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  const move = useCallback(
    (direction: 1 | -1) => {
      if (options.length === 0) return;
      let nextIndex = (activeIndex + direction + options.length) % options.length;
      if (activeIndex < 0) nextIndex = direction === 1 ? 0 : options.length - 1;
      setActiveState({ key: options[nextIndex]!.key, resetKey });
    },
    [activeIndex, options, resetKey],
  );

  const reset = useCallback(() => setActiveState({ key: null, resetKey }), [resetKey]);
  const setActiveKey = useCallback((key: string) => setActiveState({ key, resetKey }), [resetKey]);

  return {
    activeKey,
    activeOption,
    activeOptionId,
    move,
    reset,
    setActiveKey,
  };
}
