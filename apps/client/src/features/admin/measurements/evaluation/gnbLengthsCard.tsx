import type { Brand, Operator } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { formatCount } from "../utils/format";
import { type GnbLengthTest, isApartHigh, listShownGnbLengths } from "./evaluationScores";
import { ScoreCardHeadNote, ScoreCell, ScoreHead, ScoreRow, ScoreTable } from "./evaluationTable";
import { BrandMark } from "@/components/cellular/brandMark";
import { DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";

type NetworkNameProps = {
  plmn: string;
  operators: readonly Operator[] | undefined;
  brands: readonly Brand[] | undefined;
};

function findNetworkOperator(operators: readonly Operator[] | undefined, plmn: string): Operator | undefined {
  if (operators === undefined) return undefined;
  return (
    operators.find((operator) => operator.primaryPlmn === plmn) ?? operators.find((operator) => operator.plmns.some((entry) => entry.plmn === plmn))
  );
}

function readLengthLabel(t: TFunction, test: GnbLengthTest): string {
  const bits = t("measurements.evaluation.gnb.bits", { count: test.length });
  if (test.isCutLength) return t("measurements.evaluation.gnb.used", { length: bits });
  if (test.isSuggested) return t("measurements.evaluation.gnb.suggested", { length: bits });
  return bits;
}

function NetworkName({ plmn, operators, brands }: NetworkNameProps) {
  const operator = findNetworkOperator(operators, plmn);

  if (operator === undefined) return <span className="font-medium">{plmn}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <BrandMark brand={getOperatorBrand(operator, brands)} />
      <span className="truncate font-medium">{operator.name}</span>
      <span className="text-xs text-muted-foreground">{plmn}</span>
    </span>
  );
}

export function GnbLengthsCard({ tests }: { tests: readonly GnbLengthTest[] }) {
  const { t, i18n } = useTranslation("admin");
  const { data: operators } = useQuery(operatorsQueryOptions());
  const { data: brands } = useQuery(brandsQueryOptions());
  const rows = listShownGnbLengths(tests);

  return (
    <DashboardCard
      title={t("measurements.evaluation.gnb.title")}
      headEnd={<ScoreCardHeadNote>{t("measurements.evaluation.gnb.headEnd")}</ScoreCardHeadNote>}
    >
      <ScoreTable
        head={
          <>
            <ScoreHead align="start">{t("measurements.evaluation.gnb.network")}</ScoreHead>
            <ScoreHead>{t("measurements.evaluation.gnb.length")}</ScoreHead>
            <ScoreHead>{t("measurements.evaluation.gnb.cells")}</ScoreHead>
            <ScoreHead>{t("measurements.evaluation.gnb.together")}</ScoreHead>
            <ScoreHead>{t("measurements.evaluation.gnb.apart")}</ScoreHead>
            <ScoreHead>{t("measurements.evaluation.gnb.sites")}</ScoreHead>
          </>
        }
      >
        {rows.map((row) => (
          <ScoreRow key={`${row.plmn}-${row.length}`} className="h-11">
            <ScoreCell align="start" className="w-full max-w-0 min-w-48">
              <NetworkName plmn={row.plmn} operators={operators} brands={brands} />
            </ScoreCell>
            <ScoreCell>{readLengthLabel(t, row)}</ScoreCell>
            <ScoreCell>{formatCount(row.cells, i18n.language)}</ScoreCell>
            <ScoreCell>{formatCount(row.together, i18n.language)}</ScoreCell>
            <ScoreCell tone={isApartHigh(row) ? "warning" : "default"}>{formatCount(row.apart, i18n.language)}</ScoreCell>
            <ScoreCell>{formatCount(row.sites, i18n.language)}</ScoreCell>
          </ScoreRow>
        ))}
      </ScoreTable>
    </DashboardCard>
  );
}
