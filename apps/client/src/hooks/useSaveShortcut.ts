import { useEffect, useRef } from "react";

import { isSaveShortcut } from "@/lib/dom/keyboard";

type UseSaveShortcutOptions = {
  canSave: boolean;
  isActive?: boolean;
  onSave: () => void;
};

export function useSaveShortcut({ canSave, isActive = true, onSave }: UseSaveShortcutOptions) {
  const onSaveRef = useRef(onSave);
  const canSaveRef = useRef(canSave);

  useEffect(() => {
    onSaveRef.current = onSave;
    canSaveRef.current = canSave;
  }, [onSave, canSave]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSaveShortcut(event)) return;

      event.preventDefault();
      if (!canSaveRef.current) return;

      onSaveRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive]);
}
