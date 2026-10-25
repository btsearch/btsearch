import { CircleLock02Icon } from "@hugeicons/core-free-icons";
import type { MeasurementQuirkRule, MeasurementQuirkRuleUpdate } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { updateQuirkRule } from "../api/readingBlocks";
import { ByUserText } from "../components/byUserText";
import { ReasonDialog } from "../components/reasonDialog";
import { storeQuirkRule } from "./blockCache";
import { BLOCK_LIST_ROW_CLASS, BlockListLoading } from "./blockListParts";
import { Button } from "@/components/ui/button";
import { CardLoadError, CardNotice, DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";
import { StatusBadge } from "@/features/settings/components/settingsPrimitives";
import { showApiError } from "@/lib/api";
import { formatShortDate } from "@/lib/format";

type QuirkRulesCardProps = {
  rules: MeasurementQuirkRule[] | undefined;
  isLoadError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
};

type QuirkRuleRowProps = {
  rule: MeasurementQuirkRule;
  isPending: boolean;
  onBlock: (rule: MeasurementQuirkRule) => void;
  onUnblock: (rule: MeasurementQuirkRule) => void;
};

type RuleChange = { ruleId: string; change: MeasurementQuirkRuleUpdate };

type RuleBlocking = { isOpen: boolean; rule: MeasurementQuirkRule | null };

function RuleBlockNote({ block }: { block: NonNullable<MeasurementQuirkRule["block"]> }) {
  const { t, i18n } = useTranslation("admin");
  const values = { date: formatShortDate(block.at, i18n.language), reason: block.reason };

  return (
    <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
      {block.by === null ? (
        t("measurements.blocks.rules.blockedOn", values)
      ) : (
        <ByUserText i18nKey="admin:measurements.blocks.rules.blockedBy" user={block.by} values={values} />
      )}
    </p>
  );
}

function QuirkRuleRow({ rule, isPending, onBlock, onUnblock }: QuirkRuleRowProps) {
  const { t, i18n } = useTranslation("admin");

  return (
    <div className={BLOCK_LIST_ROW_CLASS}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-[0.8125rem] leading-[1.125rem]">
          <span className="font-mono font-medium">{rule.id}</span>
          <span className="text-muted-foreground">
            {t("measurements.blocks.rules.since", { reader: rule.reader, date: formatShortDate(rule.firstSeenAt, i18n.language) })}
          </span>
        </div>
        {rule.block === null ? null : <RuleBlockNote block={rule.block} />}
      </div>
      {rule.block === null ? null : (
        <StatusBadge tone="destructive" icon={CircleLock02Icon}>
          {t("measurements.blocks.blocked")}
        </StatusBadge>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="cursor-pointer"
        disabled={isPending}
        onClick={() => (rule.block === null ? onBlock(rule) : onUnblock(rule))}
      >
        {rule.block === null ? t("measurements.block") : t("measurements.unblock")}
      </Button>
    </div>
  );
}

export function QuirkRulesCard({ rules, isLoadError, isRetrying, onRetry }: QuirkRulesCardProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [blocking, setBlocking] = useState<RuleBlocking>({ isOpen: false, rule: null });

  const ruleMutation = useMutation({
    mutationFn: ({ ruleId, change }: RuleChange) => updateQuirkRule(ruleId, change),
    onSuccess: async (updatedRule) => {
      setBlocking((current) => ({ ...current, isOpen: false }));
      toast.success(updatedRule.block === null ? t("measurements.blocks.rules.unblockedToast") : t("measurements.blocks.rules.blockedToast"));
      await storeQuirkRule(queryClient, updatedRule);
    },
    onError: showApiError,
  });

  const changingRuleId = ruleMutation.isPending ? ruleMutation.variables.ruleId : null;
  const blockedRule = blocking.rule;

  return (
    <DashboardCard
      title={t("measurements.blocks.rules.title")}
      headEnd={<span className="min-w-0 truncate text-xs text-muted-foreground">{t("measurements.blocks.rules.description")}</span>}
    >
      {rules === undefined && isLoadError ? <CardLoadError onRetry={onRetry} isRetrying={isRetrying} /> : null}
      {rules === undefined && !isLoadError ? <BlockListLoading /> : null}
      {rules?.length === 0 ? <CardNotice title={t("measurements.blocks.rules.empty")} /> : null}
      {rules?.map((rule) => (
        <QuirkRuleRow
          key={rule.id}
          rule={rule}
          isPending={changingRuleId === rule.id}
          onBlock={(chosenRule) => setBlocking({ isOpen: true, rule: chosenRule })}
          onUnblock={(chosenRule) => ruleMutation.mutate({ ruleId: chosenRule.id, change: { block: null } })}
        />
      ))}
      <ReasonDialog
        open={blocking.isOpen}
        title={t("measurements.blocks.rules.blockDialog.title")}
        description={t("measurements.blocks.rules.blockDialog.description", { id: blockedRule?.id ?? "" })}
        confirmLabel={t("measurements.block")}
        isDestructive
        refold={{ label: t("measurements.blocks.list.refold"), description: t("measurements.blocks.rules.blockDialog.refoldDescription") }}
        isPending={ruleMutation.isPending}
        onOpenChange={(isOpen) => setBlocking((current) => ({ ...current, isOpen }))}
        onSubmit={(reason, refold) => {
          if (blockedRule !== null) ruleMutation.mutate({ ruleId: blockedRule.id, change: { block: { reason }, refold } });
        }}
      />
    </DashboardCard>
  );
}
