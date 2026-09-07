import { useEffect, useRef } from "react";

import { isEditableKeyboardTarget } from "@/lib/dom/keyboard";

export type MapKeybind = {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

type MapKeybindHandler = (keybind: MapKeybind) => boolean;
type MapKeybindOptions = { includeModifiedKeys?: boolean };
type MapKeybindRegistration = {
  handleKeybind: MapKeybindHandler;
  includesModifiedKeys: () => boolean;
};

const registrations = new Set<MapKeybindRegistration>();

function toMapKeybind(event: KeyboardEvent): MapKeybind {
  return {
    altKey: event.altKey,
    code: event.code,
    ctrlKey: event.ctrlKey,
    key: event.key.toLowerCase(),
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  };
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || isEditableKeyboardTarget(event.target)) return;

  const hasModifiedKey = event.ctrlKey || event.metaKey || event.altKey;
  const keybind = toMapKeybind(event);
  for (const registration of registrations) {
    if (hasModifiedKey && !registration.includesModifiedKeys()) continue;
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

export function useMapKeybinds(handleKeybind: MapKeybindHandler, { includeModifiedKeys = false }: MapKeybindOptions = {}): void {
  const handlerRef = useRef(handleKeybind);
  const includeModifiedKeysRef = useRef(includeModifiedKeys);

  useEffect(() => {
    handlerRef.current = handleKeybind;
    includeModifiedKeysRef.current = includeModifiedKeys;
  }, [handleKeybind, includeModifiedKeys]);

  useEffect(
    () =>
      registerMapKeybind({
        handleKeybind: (keybind) => handlerRef.current(keybind),
        includesModifiedKeys: () => includeModifiedKeysRef.current,
      }),
    [],
  );
}
