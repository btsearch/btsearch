const INTERACTIVE_CONTROL_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='checkbox']",
  "[role='combobox']",
  "[role='link']",
  "[role='listbox']",
  "[role='menuitem']",
  "[role='option']",
  "[role='radio']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='switch']",
  "[role='tab']",
  "[role='textbox']",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function isInteractiveTarget(target: EventTarget | null, currentTarget?: EventTarget): boolean {
  if (!(target instanceof Element) || target === currentTarget) return false;
  const interactiveElement = target.closest(INTERACTIVE_CONTROL_SELECTOR);
  return interactiveElement !== null && interactiveElement !== currentTarget;
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return isInteractiveTarget(target);
}
