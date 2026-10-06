const OPEN_CONFIRMATION_SELECTOR = "[data-slot='alert-dialog-content']";

export function isConfirmationOpen(): boolean {
  return document.querySelector(OPEN_CONFIRMATION_SELECTOR) !== null;
}
