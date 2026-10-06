import type { RoleGrant } from "@openbts/shared/contract";

import { type EditorArea, WHOLE_EDITOR_AREA, getEditorArea } from "@/features/stations/list/data/editorArea";
import { useSettledSession } from "@/hooks/useSettledSession";
import { useEditorMe } from "@/lib/auth/me";
import { hasFailedLoad } from "@/lib/queryLoadState";

type DashboardLowerCard = "audit" | "notes" | "pending";

export type DashboardAccess = {
  isAdmin: boolean;
  area: EditorArea | undefined;
  lowerCard: DashboardLowerCard;
  hasAreaFailed: boolean;
  isAreaRetrying: boolean;
  retryArea: () => void;
};

function pickLowerCard(isAdmin: boolean, grants: readonly RoleGrant[] | undefined, hasAreaFailed: boolean): DashboardLowerCard {
  if (isAdmin) return "audit";
  if (grants === undefined) return hasAreaFailed ? "notes" : "pending";
  return grants.some((grant) => grant.role === "maintainer") ? "audit" : "notes";
}

export function useDashboardAccess(): DashboardAccess {
  const { data: session } = useSettledSession();
  const role = session?.user?.role;
  const isAdmin = role === "admin";
  const isEditor = role === "editor";
  const meQuery = useEditorMe(session?.user?.id, isEditor);
  const me = isEditor ? meQuery.data : undefined;
  const hasAreaFailed = isEditor && hasFailedLoad(meQuery);

  function retryArea() {
    void meQuery.refetch();
  }

  let area: EditorArea | undefined;
  if (isAdmin) area = WHOLE_EDITOR_AREA;
  else if (me !== undefined) area = getEditorArea(me);

  return {
    isAdmin,
    area,
    lowerCard: pickLowerCard(isAdmin, me?.grants, hasAreaFailed),
    hasAreaFailed,
    isAreaRetrying: hasAreaFailed && meQuery.isFetching,
    retryArea,
  };
}
