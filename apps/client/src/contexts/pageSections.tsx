import { type ReactNode, createContext, useCallback, useContext, useEffect, useEffectEvent, useLayoutEffect, useMemo, useState } from "react";

export type PageSection = { id: string; title: string };

const SectionsContext = createContext<PageSection[]>([]);
const ActiveIdContext = createContext<string | null>(null);
const SECTION_ID_SEPARATOR = " ";

interface WriteContextValue {
  register: (sections: PageSection[]) => void;
  setActiveId: (id: string | null) => void;
  unregister: () => void;
}

const WriteContext = createContext<WriteContextValue>({
  register: () => {},
  setActiveId: () => {},
  unregister: () => {},
});

export function PageSectionsProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<PageSection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const register = useCallback((s: PageSection[]) => setSections(s), []);
  const unregister = useCallback(() => {
    setSections([]);
    setActiveId(null);
  }, []);

  const write = useMemo(() => ({ register, setActiveId, unregister }), [register, setActiveId, unregister]);

  return (
    <WriteContext.Provider value={write}>
      <SectionsContext.Provider value={sections}>
        <ActiveIdContext.Provider value={activeId}>{children}</ActiveIdContext.Provider>
      </SectionsContext.Provider>
    </WriteContext.Provider>
  );
}

export function useRegisterPageSections(sections: PageSection[]): void {
  const { register, unregister, setActiveId } = useContext(WriteContext);
  const sectionsKey = JSON.stringify(sections);
  const sectionIds = sections.map((section) => section.id).join(SECTION_ID_SEPARATOR);
  const registerSections = useEffectEvent(() => register(sections));

  useLayoutEffect(() => {
    registerSections();
  }, [sectionsKey]);

  useLayoutEffect(() => unregister, [unregister]);

  useEffect(() => {
    if (sectionIds === "") return;
    const ids = sectionIds.split(SECTION_ID_SEPARATOR);

    setActiveId(ids[0]);

    const firstEl = document.getElementById(ids[0]);
    let scrollEl: Element | null = null;
    if (firstEl) {
      let node = firstEl.parentElement;
      while (node && node !== document.body) {
        const { overflowY } = getComputedStyle(node);
        if (overflowY === "auto" || overflowY === "scroll") {
          scrollEl = node;
          break;
        }
        node = node.parentElement;
      }
    }

    const update = () => {
      const containerTop = scrollEl ? scrollEl.getBoundingClientRect().top : 0;
      let active = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - containerTop <= 80) active = id;
      }
      setActiveId(active);
    };

    const target = scrollEl ?? window;
    target.addEventListener("scroll", update, { passive: true });
    update();

    return () => target.removeEventListener("scroll", update);
  }, [sectionIds, setActiveId]);
}

export function usePageSectionsList(): PageSection[] {
  return useContext(SectionsContext);
}

export function usePageSectionsActiveId(): string | null {
  return useContext(ActiveIdContext);
}
