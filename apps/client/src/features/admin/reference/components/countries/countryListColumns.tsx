import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type CellContext, createColumnHelper } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { CountryIdentity, CountryListNumber, CountryPlanSize, CountryRegionCount, CountryTeamSummary } from "./countryListCells";
import { CountryContributionsBadge, CountryVisibilityBadge } from "./countryStatusBadges";
import type { CountryListRow } from "./useCountryListRows";
import type { AppTableFeatures } from "@/lib/tableFeatures";

type CountryListCellProps = Pick<CellContext<AppTableFeatures, CountryListRow, unknown>, "row">;

const END_ALIGNED_CLASS = "flex justify-end";
const TEAM_INSET_CLASS = "pl-6";
const columnHelper = createColumnHelper<AppTableFeatures, CountryListRow>();

function CountryHeader() {
  const { t } = useTranslation("admin");
  return <div className="pl-2">{t("admin:users.detail.grants.dialog.country")}</div>;
}

function VisibilityHeader() {
  const { t } = useTranslation("admin");
  return t("admin:lists.table.visibility");
}

function ContributionsHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.submissions");
}

function RegionsHeader() {
  const { t } = useTranslation("admin");
  return <div className="text-right">{t("admin:reference.country.regions.title")}</div>;
}

function OperatorsHeader() {
  const { t } = useTranslation("nav");
  return <div className="text-right">{t("nav:items.operators")}</div>;
}

function BandPlanHeader() {
  const { t } = useTranslation("admin");
  return <div className="text-right">{t("admin:reference.country.bandPlan.title")}</div>;
}

function TeamHeader() {
  const { t } = useTranslation("admin");
  return <div className={TEAM_INSET_CLASS}>{t("admin:reference.country.team.title")}</div>;
}

function ActiveStationsHeader() {
  const { t } = useTranslation("admin");
  return <div className="text-right">{t("admin:reference.country.regions.columns.activeStations")}</div>;
}

function OpenHeader() {
  return null;
}

function CountryCell({ row }: CountryListCellProps) {
  return (
    <div className="pl-2">
      <CountryIdentity row={row.original} />
    </div>
  );
}

function VisibilityCell({ row }: CountryListCellProps) {
  return <CountryVisibilityBadge isVisible={row.original.country.isVisible} />;
}

function ContributionsCell({ row }: CountryListCellProps) {
  return <CountryContributionsBadge contributions={row.original.country.contributions} />;
}

function RegionsCell({ row }: CountryListCellProps) {
  return (
    <div className={END_ALIGNED_CLASS}>
      <CountryRegionCount count={row.original.regionCount} />
    </div>
  );
}

function OperatorsCell({ row }: CountryListCellProps) {
  return (
    <div className={END_ALIGNED_CLASS}>
      <CountryListNumber count={row.original.operatorCount} />
    </div>
  );
}

function BandPlanCell({ row }: CountryListCellProps) {
  return (
    <div className={END_ALIGNED_CLASS}>
      <CountryPlanSize count={row.original.planSize} />
    </div>
  );
}

function TeamCell({ row }: CountryListCellProps) {
  return (
    <div className={TEAM_INSET_CLASS}>
      <CountryTeamSummary team={row.original.team} />
    </div>
  );
}

function ActiveStationsCell({ row }: CountryListCellProps) {
  return (
    <div className={END_ALIGNED_CLASS}>
      <CountryListNumber count={row.original.activeStations} />
    </div>
  );
}

function OpenCell() {
  return (
    <div className="flex justify-end pr-2 text-muted-foreground">
      <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" className="size-4" />
    </div>
  );
}

export const COUNTRY_LIST_COLUMNS = columnHelper.columns([
  columnHelper.display({ id: "country", size: 220, header: CountryHeader, cell: CountryCell }),
  columnHelper.display({ id: "visibility", size: 130, header: VisibilityHeader, cell: VisibilityCell }),
  columnHelper.display({ id: "contributions", size: 140, header: ContributionsHeader, cell: ContributionsCell }),
  columnHelper.display({ id: "regions", size: 90, header: RegionsHeader, cell: RegionsCell }),
  columnHelper.display({ id: "operators", size: 100, header: OperatorsHeader, cell: OperatorsCell }),
  columnHelper.display({ id: "bandPlan", size: 100, header: BandPlanHeader, cell: BandPlanCell }),
  columnHelper.display({ id: "team", size: 230, header: TeamHeader, cell: TeamCell }),
  columnHelper.display({ id: "activeStations", size: 120, header: ActiveStationsHeader, cell: ActiveStationsCell }),
  columnHelper.display({ id: "open", size: 44, header: OpenHeader, cell: OpenCell }),
]);
