import { CircleLock02Icon } from "@hugeicons/core-free-icons";
import type { MeasurementReaderVersion, MeasurementReadingBlock } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { BLOCK_LIST_ROW_CLASS, BlockListLoading } from "./blockListParts";
import { getSourceLabel } from "./blockText";
import { Button } from "@/components/ui/button";
import { CardLoadError, CardNotice, DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";
import { StatusBadge } from "@/features/settings/components/settingsPrimitives";
import { formatShortDate } from "@/lib/format";

type ReaderVersionsCardProps = {
  readerVersions: MeasurementReaderVersion[] | undefined;
  blocks: MeasurementReadingBlock[] | undefined;
  isLoadError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onBlock: (readerVersion: MeasurementReaderVersion) => void;
};

type ReaderVersionRowProps = {
  readerVersion: MeasurementReaderVersion;
  blockId: number | undefined;
  canBlock: boolean;
  onBlock: (readerVersion: MeasurementReaderVersion) => void;
};

function findWholeBlocks(blocks: MeasurementReadingBlock[] | undefined): ReadonlyMap<number, number> {
  const blockIds = new Map<number, number>();
  for (const block of blocks ?? []) {
    if (!block.isEnabled || block.fields !== null || !("readerVersionId" in block.phones)) continue;
    if (!blockIds.has(block.phones.readerVersionId)) blockIds.set(block.phones.readerVersionId, block.id);
  }
  return blockIds;
}

function ReaderVersionRow({ readerVersion, blockId, canBlock, onBlock }: ReaderVersionRowProps) {
  const { t, i18n } = useTranslation("admin");
  const since = t("measurements.blocks.readers.since", {
    source: getSourceLabel(t, readerVersion.source),
    date: formatShortDate(readerVersion.firstSeenAt, i18n.language),
  });

  return (
    <div className={BLOCK_LIST_ROW_CLASS}>
      <span className="shrink-0 font-mono text-[0.8125rem] leading-[1.125rem] font-medium">
        {readerVersion.reader} {readerVersion.version}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
        {blockId === undefined ? since : `${since}, ${t("measurements.blocks.readers.blockNumber", { id: blockId })}`}
      </span>
      {blockId === undefined ? (
        <Button type="button" variant="ghost" size="sm" className="cursor-pointer" disabled={!canBlock} onClick={() => onBlock(readerVersion)}>
          {t("measurements.block")}
        </Button>
      ) : (
        <StatusBadge tone="destructive" icon={CircleLock02Icon}>
          {t("measurements.blocks.blocked")}
        </StatusBadge>
      )}
    </div>
  );
}

export function ReaderVersionsCard({ readerVersions, blocks, isLoadError, isRetrying, onRetry, onBlock }: ReaderVersionsCardProps) {
  const { t } = useTranslation("admin");
  const wholeBlocks = findWholeBlocks(blocks);

  return (
    <DashboardCard
      title={t("measurements.blocks.readers.title")}
      headEnd={<span className="min-w-0 truncate text-xs text-muted-foreground">{t("measurements.blocks.readers.description")}</span>}
    >
      {readerVersions === undefined && isLoadError ? <CardLoadError onRetry={onRetry} isRetrying={isRetrying} /> : null}
      {readerVersions === undefined && !isLoadError ? <BlockListLoading /> : null}
      {readerVersions?.length === 0 ? <CardNotice title={t("measurements.blocks.readers.empty")} /> : null}
      {readerVersions?.map((readerVersion) => (
        <ReaderVersionRow
          key={readerVersion.id}
          readerVersion={readerVersion}
          blockId={wholeBlocks.get(readerVersion.id)}
          canBlock={blocks !== undefined}
          onBlock={onBlock}
        />
      ))}
    </DashboardCard>
  );
}
