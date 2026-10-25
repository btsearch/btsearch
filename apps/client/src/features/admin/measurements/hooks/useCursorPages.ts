import { useState } from "react";

type CursorPagesState = {
  resetKey: string;
  cursors: readonly (string | null)[];
  index: number;
};

function firstPage(resetKey: string): CursorPagesState {
  return { resetKey, cursors: [null], index: 0 };
}

export function useCursorPages(resetKey: string) {
  const [state, setState] = useState(() => firstPage(resetKey));
  const pages = state.resetKey === resetKey ? state : firstPage(resetKey);
  if (pages !== state) setState(pages);

  return {
    cursor: pages.cursors[pages.index] ?? null,
    pageIndex: pages.index,
    goFirst: () => setState({ ...pages, index: 0 }),
    goPrevious: () => setState({ ...pages, index: Math.max(0, pages.index - 1) }),
    goNext: (nextCursor: string) => setState({ ...pages, cursors: [...pages.cursors.slice(0, pages.index + 1), nextCursor], index: pages.index + 1 }),
  };
}
