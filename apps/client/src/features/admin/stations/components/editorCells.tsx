import { useQueryClient } from "@tanstack/react-query";

import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CellsPanel } from "@/features/station-editing/components/cells/cellsPanel";
import { retryEditLookups } from "@/features/station-editing/data/lookups";
import type { StationDraftApi } from "@/features/station-editing/hooks/useStationDraft";
import { authClient } from "@/lib/auth/client";

type EditorCellsProps = {
  edit: StationDraftApi;
};

const ADMIN_ROLE = "admin";
const CELL_CARD_SKELETONS = [0, 1];

export function EditorCells({ edit }: EditorCellsProps) {
  const queryClient = useQueryClient();
  const { data: authSession } = authClient.useSession();
  const { lookups } = edit;

  if (lookups.hasFailed) return <InlineError onRetry={() => retryEditLookups(queryClient, lookups.countryCode, lookups)} />;
  if (!lookups.isReady) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {CELL_CARD_SKELETONS.map((card) => (
          <Skeleton key={card} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  return <CellsPanel edit={edit} canConfirm isNewCellConfirmed={authSession?.user?.role === ADMIN_ROLE} />;
}
