import { useEffect, useRef } from "react";

import { isEditableKeyboardTarget } from "@/lib/dom/keyboard";

export type MapKeybind = {
  key: string;
  shiftKey: boolean;
};

type MapKeybindHandler = (keybind: MapKeybind) => boolean;
type MapKeybindRegistration = {
  handleKeybind: MapKeybindHandler;
};

const registrations = new Set<MapKeybindRegistration>();

function toMapKeybind(event: KeyboardEvent): MapKeybind {
  return {
    key: event.key.toLowerCase(),
    shiftKey: event.shiftKey,
  };
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || isEditableKeyboardTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

  const keybind = toMapKeybind(event);
  for (const registration of registrations) {
    if (!registration.handleKeybind(keybind)) continue;
    event.preventDefault();
    return;
  }
}

function registerMapKeybind(registration: MapKeybindRegistration): () => void {
  registrations.add(registration);
  if (registrations.size === 1) document.addEventListener("keydown", handleGlobalKeyDown);

  return () => {
    registrations.delete(registration);
    if (registrations.size === 0) document.removeEventListener("keydown", handleGlobalKeyDown);
  };
}

export function useMapKeybinds(handleKeybind: MapKeybindHandler): void {
  const handlerRef = useRef(handleKeybind);

  useEffect(() => {
    handlerRef.current = handleKeybind;
  }, [handleKeybind]);

  useEffect(
    () =>
      registerMapKeybind({
        handleKeybind: (keybind) => handlerRef.current(keybind),
      }),
    [],
  );
}
