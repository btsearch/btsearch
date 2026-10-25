import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MeasurementReadingBlock } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { updateReadingBlock } from "../api/readingBlocks";
import { ReasonDialog } from "../components/reasonDialog";
import { storeReadingBlock } from "./blockCache";
import type { BlockLookups } from "./blockText";
import { ReadingBlockRow } from "./readingBlockRow";
import { Button } from "@/components/ui/button";
import { TINTED_BUTTON_CLASS } from "@/features/admin/users/components/detail/userDetailPrimitives";
import {
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsCardHeader,
  SettingsRowError,
  SettingsRowSkeleton,
} from "@/features/settings/components/settingsPrimitives";
import { showApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type ReadingBlocksCardProps = {
  blocks: MeasurementReadingBlock[] | undefined;
  isLoadError: boolean;
  isRetrying: boolean;
  lookups: BlockLookups;
  onRetry: () => void;
  onAdd: () => void;
};

type ReasonEdit = { isOpen: boolean; block: MeasurementReadingBlock | null };

const SKELETON_ROWS = [0, 1, 2];

function ReadingBlockRows({
  blocks,
  isLoadError,
  isRetrying,
  lookups,
  onRetry,
  onEditReason,
}: Omit<ReadingBlocksCardProps, "onAdd"> & { onEditReason: (block: MeasurementReadingBlock) => void }) {
  const { t } = useTranslation("admin");

  if (blocks === undefined && isLoadError) {
    return <SettingsRowError title={t("measurements.blocks.list.loadFailed")} onRetry={onRetry} isRetrying={isRetrying} />;
  }
  if (blocks === undefined) return SKELETON_ROWS.map((row) => <SettingsRowSkeleton key={row} />);
  if (blocks.length === 0) {
    return <p className={cn("border-t px-4 py-3.5 sm:px-5", SETTINGS_DESCRIPTION_CLASS)}>{t("measurements.blocks.list.empty")}</p>;
  }
  return blocks.map((block) => <ReadingBlockRow key={block.id} block={block} lookups={lookups} onEditReason={onEditReason} />);
}

export function ReadingBlocksCard({ onAdd, ...rowsProps }: ReadingBlocksCardProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [reasonEdit, setReasonEdit] = useState<ReasonEdit>({ isOpen: false, block: null });

  const reasonMutation = useMutation({
    mutationFn: ({ blockId, reason }: { blockId: number; reason: string }) => updateReadingBlock(blockId, { reason }),
    onSuccess: async (updatedBlock) => {
      setReasonEdit((current) => ({ ...current, isOpen: false }));
      toast.success(t("measurements.blocks.list.reasonSaved"));
      await storeReadingBlock(queryClient, updatedBlock);
    },
    onError: showApiError,
  });

  const editedBlock = reasonEdit.block;

  return (
    <SettingsCard>
      <SettingsCardHeader
        title={t("measurements.blocks.list.title")}
        description={t("measurements.blocks.list.description")}
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("cursor-pointer", TINTED_BUTTON_CLASS)}
            disabled={rowsProps.blocks === undefined}
            onClick={onAdd}
          >
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
            {t("measurements.blocks.list.add")}
          </Button>
        }
        wrap
      />
      <ReadingBlockRows {...rowsProps} onEditReason={(block) => setReasonEdit({ isOpen: true, block })} />
      <ReasonDialog
        open={reasonEdit.isOpen}
        title={t("measurements.blocks.list.reasonDialog.title")}
        description={t("measurements.blocks.list.reasonDialog.description")}
        initialReason={editedBlock?.reason ?? ""}
        confirmLabel={t("common:actions.save")}
        isPending={reasonMutation.isPending}
        onOpenChange={(isOpen) => setReasonEdit((current) => ({ ...current, isOpen }))}
        onSubmit={(reason) => {
          if (editedBlock !== null) reasonMutation.mutate({ blockId: editedBlock.id, reason });
        }}
      />
    </SettingsCard>
  );
}
