import { CpuIcon, File01Icon, PencilEdit02Icon, RepeatIcon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { MeasurementReadingBlock } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { updateReadingBlock } from "../api/readingBlocks";
import { ByUserText } from "../components/byUserText";
import { storeReadingBlock } from "./blockCache";
import { type BlockLookups, type PhonesKind, getPhonesKind, getPhonesName, getScopeText } from "./blockText";
import { Switch } from "@/components/ui/switch";
import { RowIconButton, SettingsRow, StatusBadge } from "@/features/settings/components/settingsPrimitives";
import { showApiError } from "@/lib/api";
import { formatShortDate } from "@/lib/format";

type ReadingBlockRowProps = {
  block: MeasurementReadingBlock;
  lookups: BlockLookups;
  onEditReason: (block: MeasurementReadingBlock) => void;
};

const PHONES_ICONS = {
  modemFamily: CpuIcon,
  soc: CpuIcon,
  deviceModel: SmartPhone01Icon,
  readerVersion: File01Icon,
} as const satisfies Record<PhonesKind, IconSvgElement>;

function BlockMeta({ block }: { block: MeasurementReadingBlock }) {
  const { t, i18n } = useTranslation("admin");
  const date = formatShortDate(block.createdAt, i18n.language);

  return (
    <p className="mt-0.5 text-xs leading-4">
      {block.createdBy === null ? (
        t("measurements.blocks.list.addedOn", { date })
      ) : (
        <ByUserText i18nKey="admin:measurements.blocks.list.addedBy" user={block.createdBy} values={{ date }} />
      )}
      {block.disabledAt === null ? null : `, ${t("measurements.blocks.list.disabledOn", { date: formatShortDate(block.disabledAt, i18n.language) })}`}
    </p>
  );
}

export function ReadingBlockRow({ block, lookups, onEditReason }: ReadingBlockRowProps) {
  const { t, i18n } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [isRefoldQueued, setIsRefoldQueued] = useState(false);

  const switchMutation = useMutation({
    mutationFn: (isEnabled: boolean) => updateReadingBlock(block.id, { isEnabled }),
    onSuccess: async (updatedBlock) => {
      toast.success(updatedBlock.isEnabled ? t("measurements.blocks.list.switchedOn") : t("measurements.blocks.list.switchedOff"));
      await storeReadingBlock(queryClient, updatedBlock);
    },
    onError: showApiError,
  });

  const refoldMutation = useMutation({
    mutationFn: () => updateReadingBlock(block.id, { refold: true }),
    onSuccess: async (updatedBlock) => {
      setIsRefoldQueued(true);
      toast.success(t("measurements.blocks.list.refoldQueued"));
      await storeReadingBlock(queryClient, updatedBlock);
    },
    onError: showApiError,
  });

  const isEnabled = switchMutation.isPending ? switchMutation.variables : block.isEnabled;
  const isCorroborate = block.mode === "corroborate";

  return (
    <SettingsRow
      icon={PHONES_ICONS[getPhonesKind(block.phones)]}
      title={getPhonesName(t, block.phones, lookups)}
      badge={
        <>
          <StatusBadge tone={isCorroborate ? "primary" : "warning"}>{t(`measurements.blocks.modes.${block.mode}`)}</StatusBadge>
          {block.isEnabled ? null : <StatusBadge tone="muted">{t("measurements.blocks.list.disabled")}</StatusBadge>}
        </>
      }
      description={
        <>
          <p>{getScopeText(t, block, i18n.language)}</p>
          <p className="mt-0.5 text-foreground">{block.reason}</p>
          <BlockMeta block={block} />
        </>
      }
      wrap
    >
      {isRefoldQueued ? <span className="text-xs text-muted-foreground">{t("measurements.blocks.list.refoldQueued")}</span> : null}
      <RowIconButton
        label={t("measurements.blocks.list.refold")}
        icon={RepeatIcon}
        disabled={refoldMutation.isPending}
        onClick={() => refoldMutation.mutate()}
      />
      <RowIconButton label={t("measurements.blocks.list.editReason")} icon={PencilEdit02Icon} onClick={() => onEditReason(block)} />
      <Switch
        checked={isEnabled}
        disabled={switchMutation.isPending}
        aria-label={isEnabled ? t("measurements.blocks.list.switchOff") : t("measurements.blocks.list.switchOn")}
        onCheckedChange={(checked) => switchMutation.mutate(checked)}
        className="ml-1.5 cursor-pointer"
      />
    </SettingsRow>
  );
}
