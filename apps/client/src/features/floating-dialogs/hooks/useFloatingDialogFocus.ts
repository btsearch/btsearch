import { useIsPresent } from "motion/react";
import { type RefObject, useEffect } from "react";

const RETURN_TARGET_SETTLE_MS = 300;
const MENU_SELECTOR = "[role='menu']";

function isInsideMenu(element: Element): boolean {
  return element.closest(MENU_SELECTOR) !== null;
}

function moveFocusIntoWindow(windowElement: HTMLElement, target: HTMLElement): () => void {
  let returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let settleTimeoutId: number | undefined;

  function focusTarget() {
    target.focus({ preventScroll: true });
  }

  function stopWaiting() {
    window.clearTimeout(settleTimeoutId);
    document.removeEventListener("focusin", adoptReturnTarget);
  }

  function adoptReturnTarget(event: FocusEvent) {
    const focused = event.target;
    if (!(focused instanceof HTMLElement) || isInsideMenu(focused)) return;

    stopWaiting();
    if (windowElement.contains(focused)) return;

    returnTarget = focused;
    focusTarget();
  }

  if (returnTarget === null || !isInsideMenu(returnTarget)) focusTarget();
  else {
    document.addEventListener("focusin", adoptReturnTarget);
    settleTimeoutId = window.setTimeout(() => {
      stopWaiting();
      focusTarget();
    }, RETURN_TARGET_SETTLE_MS);
  }

  return () => {
    stopWaiting();
    const focused = document.activeElement;
    const isFocusElsewhere = focused !== null && focused !== document.body && !windowElement.contains(focused);
    if (returnTarget?.isConnected && !isFocusElsewhere) returnTarget.focus({ preventScroll: true });
  };
}

export function useFloatingDialogFocus(windowRef: RefObject<HTMLElement | null>, targetRef: RefObject<HTMLElement | null>, isEnabled = true): void {
  const isPresent = useIsPresent();

  useEffect(() => {
    const windowElement = windowRef.current;
    const target = targetRef.current;
    if (!isEnabled || !isPresent || windowElement === null || target === null) return;

    return moveFocusIntoWindow(windowElement, target);
  }, [isEnabled, isPresent, windowRef, targetRef]);
}
