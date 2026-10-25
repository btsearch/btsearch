import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { quirkRulesQueryOptions, readerQuirkFlagsQueryOptions, readerVersionsQueryOptions, readingBlocksQueryOptions } from "../api/readingBlocks";
import { MeasurementsPage } from "../components/measurementsPage";
import type { BlockDialogSource } from "./blockDraft";
import { QuirkRulesCard } from "./quirkRulesCard";
import { ReaderQuirkFlagsCard } from "./readerQuirkFlagsCard";
import { ReaderVersionsCard } from "./readerVersionsCard";
import { ReadingBlockDialog } from "./readingBlockDialog";
import { ReadingBlocksCard } from "./readingBlocksCard";
import { useBlockLookups } from "./useBlockLookups";
import { StaleDataNotice } from "@/components/ui/error-state";
import { hasStaleRows } from "@/features/admin/dashboard/cards/dashboardCard";
import { hasFailedLoad } from "@/lib/queryLoadState";

type BlockDialogState = { isOpen: boolean; source: BlockDialogSource };

export function BlocksPage() {
  const [dialog, setDialog] = useState<BlockDialogState>({ isOpen: false, source: { kind: "new" } });
  const blocksQuery = useQuery(readingBlocksQueryOptions());
  const readerVersionsQuery = useQuery(readerVersionsQueryOptions());
  const rulesQuery = useQuery(quirkRulesQueryOptions());
  const flagsQuery = useQuery(readerQuirkFlagsQueryOptions());
  const lookups = useBlockLookups(blocksQuery.data);
  const staleQueries = [blocksQuery, readerVersionsQuery, rulesQuery].filter(hasStaleRows);
  const flags = flagsQuery.data ?? [];

  function openDialog(source: BlockDialogSource) {
    setDialog({ isOpen: true, source });
  }

  return (
    <MeasurementsPage
      section="blocks"
      notice={
        staleQueries.length === 0 ? undefined : (
          <StaleDataNotice
            onRetry={() => Promise.all(staleQueries.map((query) => query.refetch()))}
            isRetrying={staleQueries.some((query) => query.isFetching)}
          />
        )
      }
    >
      <div className="flex flex-col gap-3">
        {flags.length === 0 ? null : <ReaderQuirkFlagsCard flags={flags} onCreateBlock={(flag) => openDialog({ kind: "flag", flag })} />}
        <ReadingBlocksCard
          blocks={blocksQuery.data}
          isLoadError={hasFailedLoad(blocksQuery)}
          isRetrying={blocksQuery.isFetching}
          lookups={lookups}
          onRetry={() => void blocksQuery.refetch()}
          onAdd={() => openDialog({ kind: "new" })}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <ReaderVersionsCard
            readerVersions={readerVersionsQuery.data}
            blocks={blocksQuery.data}
            isLoadError={hasFailedLoad(readerVersionsQuery)}
            isRetrying={readerVersionsQuery.isFetching}
            onRetry={() => void readerVersionsQuery.refetch()}
            onBlock={(readerVersion) => openDialog({ kind: "readerVersion", readerVersion })}
          />
          <QuirkRulesCard
            rules={rulesQuery.data}
            isLoadError={hasFailedLoad(rulesQuery)}
            isRetrying={rulesQuery.isFetching}
            onRetry={() => void rulesQuery.refetch()}
          />
        </div>
      </div>
      <ReadingBlockDialog open={dialog.isOpen} source={dialog.source} onOpenChange={(isOpen) => setDialog((current) => ({ ...current, isOpen }))} />
    </MeasurementsPage>
  );
}
