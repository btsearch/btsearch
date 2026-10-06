import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type MotionItemProps = {
  className?: string;
  children: ReactNode;
};

type RevealProps = MotionItemProps & {
  shown: boolean;
};

type SmoothHeightProps = MotionItemProps & {
  contentClassName?: string;
};

const CALM_TRANSITION = { duration: 0.2, ease: "easeOut" } as const;
const INSTANT_TRANSITION = { duration: 0 } as const;
const COLLAPSED = { height: 0, opacity: 0 } as const;
const EXPANDED = { height: "auto", opacity: 1 } as const;
const NARROW = { width: 0, opacity: 0 } as const;
const WIDE = { width: "auto", opacity: 1 } as const;
const FADED = { opacity: 0 } as const;
const VISIBLE = { opacity: 1 } as const;

export function useCalmTransition() {
  return useReducedMotion() === true ? INSTANT_TRANSITION : CALM_TRANSITION;
}

export function RevealItem({ className, children }: MotionItemProps) {
  const transition = useCalmTransition();
  const isPresent = useIsPresent();

  return (
    <motion.div inert={!isPresent} initial={COLLAPSED} animate={EXPANDED} exit={COLLAPSED} transition={transition} className="-mx-1 overflow-hidden">
      <div className={cn("px-1", className)}>{children}</div>
    </motion.div>
  );
}

export function Reveal({ shown, className, children }: RevealProps) {
  return (
    <AnimatePresence initial={false}>
      {shown ? (
        <RevealItem key="content" className={className}>
          {children}
        </RevealItem>
      ) : null}
    </AnimatePresence>
  );
}

export function FadeItem({ className, children }: MotionItemProps) {
  const transition = useCalmTransition();
  const isPresent = useIsPresent();

  return (
    <motion.span
      inert={!isPresent}
      initial={FADED}
      animate={VISIBLE}
      exit={FADED}
      transition={transition}
      className={cn("inline-flex max-w-full", className)}
    >
      {children}
    </motion.span>
  );
}

export function GrowItem({ children }: { children: ReactNode }) {
  const transition = useCalmTransition();
  const isPresent = useIsPresent();

  return (
    <motion.span
      inert={!isPresent}
      initial={NARROW}
      animate={WIDE}
      exit={NARROW}
      transition={transition}
      className="inline-flex shrink-0 overflow-hidden"
    >
      {children}
    </motion.span>
  );
}

export function SmoothHeight({ className, contentClassName, children }: SmoothHeightProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (frame === null || content === null) return;

    const observer = new ResizeObserver(() => {
      frame.style.height = `${content.offsetHeight}px`;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className={cn("-m-0.5 overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none", className)}>
      <div ref={contentRef} className={cn("p-0.5", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
