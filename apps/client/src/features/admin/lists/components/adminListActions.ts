import type { List } from "@openbts/shared/contract";
import { createContext, useContext } from "react";

export type AdminListActions = {
  pendingListId: string | null;
  onEdit: (list: List) => void;
  onVisibilityToggle: (list: List) => void;
  onDelete: (list: List) => void;
};

export const AdminListActionsContext = createContext<AdminListActions | null>(null);

export function useAdminListActions(): AdminListActions {
  const actions = useContext(AdminListActionsContext);
  if (actions === null) throw new Error("The admin list rows must render inside AdminListActionsContext");
  return actions;
}
