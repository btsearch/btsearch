import { toast } from "sonner";

import { showApiError } from "@/lib/api";

export function showUndoToast(message: string, undoLabel: string, undo: () => Promise<unknown>, onUndone: () => void): void {
  toast.success(message, { action: { label: undoLabel, onClick: () => void undo().then(onUndone, showApiError) } });
}
