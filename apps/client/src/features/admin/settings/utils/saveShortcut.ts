const OPEN_CONFIRMATION_SELECTOR = "[data-slot='alert-dialog-content']";
const SHORTCUT_FORM_SELECTOR = "form[data-save-shortcut]";

export function isConfirmationOpen(): boolean {
  return document.querySelector(OPEN_CONFIRMATION_SELECTOR) !== null;
}

export function submitShortcutForms(root: ParentNode): void {
  for (const form of root.querySelectorAll<HTMLFormElement>(SHORTCUT_FORM_SELECTOR)) form.requestSubmit();
}
