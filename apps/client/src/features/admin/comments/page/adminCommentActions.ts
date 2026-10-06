import type { Comment } from "@openbts/shared/contract";
import { createContext, useContext } from "react";

import type { PendingCommentWrite } from "../mutations";
import type { AdminCommentsSort } from "./commentsSearch";
import type { MapLookups } from "@/features/map/data/mapLookups";

export type AdminCommentActions = {
  lookups: MapLookups | undefined;
  pendingWrite: PendingCommentWrite | null;
  sort: AdminCommentsSort;
  onSortChange: (sort: AdminCommentsSort) => void;
  onOpen: (comment: Comment) => void;
  onApprove: (comment: Comment) => void;
  onSendBack: (comment: Comment) => void;
  onEdit: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
};

export const AdminCommentActionsContext = createContext<AdminCommentActions | null>(null);

export function useAdminCommentActions(): AdminCommentActions {
  const actions = useContext(AdminCommentActionsContext);
  if (actions === null) throw new Error("The admin comment rows must render inside AdminCommentActionsContext");
  return actions;
}
