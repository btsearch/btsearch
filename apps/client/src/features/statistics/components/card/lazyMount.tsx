import { type ReactNode, Suspense, startTransition, useEffect, useRef, useState } from "react";

const MOUNT_MARGIN = "400px";
const IDLE_TIMEOUT_MS = 300;

export function LazyMount({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        observer.disconnect();
        const reveal = () => startTransition(() => setIsVisible(true));
        if (typeof requestIdleCallback === "undefined") reveal();
        else requestIdleCallback(reveal, { timeout: IDLE_TIMEOUT_MS });
      },
      { rootMargin: MOUNT_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-w-0">
      {isVisible ? (
        <Suspense fallback={fallback}>
          <div className="chart-enter">{children}</div>
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
