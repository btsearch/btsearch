import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { EngineRun, MeasurementDeviceModel, UserRef } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { contributorQueryOptions } from "../api/contributors";
import { deviceModelsByIdsQueryOptions } from "../api/readingBlocks";
import { useContributorName } from "../components/contributorIdentity";
import { getDeviceModelName } from "../components/deviceModelPicker";
import { formatDayTime, shortId } from "../utils/format";
import { mapById } from "../utils/mapById";
import { EngineRunStateBadge } from "./engineCardParts";
import { EngineRunDialog } from "./engineRunDialog";
import { formatElapsed, getEngineRunState, getRunDurationMs } from "./engineRuns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardCard } from "@/features/admin/dashboard/cards/dashboardCard";
import { TINTED_BUTTON_CLASS } from "@/features/admin/users/components/detail/userDetailPrimitives";
import { UserLink } from "@/features/user-profile/components/userLink";
import { cn } from "@/lib/utils";

type Hemispheres = { positive: string; negative: string };
type RefoldParams = Extract<EngineRun, { kind: "refold" }>["params"];

type RunRowProps = {
  run: EngineRun;
  models: ReadonlyMap<number, MeasurementDeviceModel>;
  now: number;
};

const COLUMN_CLASS = "px-2 first:pl-4 last:pr-4";
const AREA_DECIMALS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const LONGITUDE_HEMISPHERES: Hemispheres = { positive: "east", negative: "west" };
const LATITUDE_HEMISPHERES: Hemispheres = { positive: "north", negative: "south" };

function formatCoordinateRange(t: TFunction, from: number, to: number, hemispheres: Hemispheres, language: string): string {
  const fromText = Math.abs(from).toLocaleString(language, AREA_DECIMALS);
  const toText = Math.abs(to).toLocaleString(language, AREA_DECIMALS);
  const positive = t(`measurements.engine.scope.hemispheres.${hemispheres.positive}`);
  const negative = t(`measurements.engine.scope.hemispheres.${hemispheres.negative}`);
  if (from >= 0) return `${fromText}-${toText} ${positive}`;
  if (to <= 0) return `${fromText}-${toText} ${negative}`;
  return `${fromText} ${negative}-${toText} ${positive}`;
}

function getModelIds(runs: readonly EngineRun[]): number[] {
  return runs.flatMap((run) => (run.kind === "refold" && "deviceModelId" in run.params ? [run.params.deviceModelId] : []));
}

function getRefoldScope(t: TFunction, params: RefoldParams, models: ReadonlyMap<number, MeasurementDeviceModel>): string {
  if ("deviceModelId" in params) {
    const model = models.get(params.deviceModelId);
    return model === undefined ? t("measurements.engine.scope.someModel") : t("measurements.engine.scope.model", { name: getDeviceModelName(model) });
  }
  if ("readingBlockId" in params) return t("measurements.engine.scope.block", { id: params.readingBlockId });
  if ("quirkRuleId" in params) return t("measurements.engine.scope.quirkRule", { id: params.quirkRuleId });
  return t("measurements.engine.scope.allFiles");
}

function getRunScope(t: TFunction, run: EngineRun, models: ReadonlyMap<number, MeasurementDeviceModel>, language: string): string {
  switch (run.kind) {
    case "refold":
      return getRefoldScope(t, run.params, models);
    case "rebuild":
      return t("measurements.engine.scope.upload", { id: shortId(run.params.uploadId) });
    case "rebuildTrails":
      return t("measurements.engine.scope.area", {
        longitudes: formatCoordinateRange(t, run.params.west, run.params.east, LONGITUDE_HEMISPHERES, language),
        latitudes: formatCoordinateRange(t, run.params.south, run.params.north, LATITUDE_HEMISPHERES, language),
      });
    case "reestimate":
      return t("measurements.engine.scope.allStations");
    case "rebuildReadModels":
      return t("measurements.engine.scope.allReadModels");
    case "subtract":
    case "restore":
      return t("measurements.engine.scope.queuedFiles");
    default:
      return "-";
  }
}

function PersonScope({ userId }: { userId: string }) {
  const { t } = useTranslation("admin");
  const contributorQuery = useQuery(contributorQueryOptions(userId));
  const contributor = contributorQuery.data;
  const name = useContributorName(contributor?.user ?? null);

  if (contributor === undefined) return t("measurements.engine.scope.someone");
  return (
    <>
      {t("measurements.engine.scope.person")}{" "}
      <Link
        to="/admin/measurements/contributors/$userId"
        params={{ userId }}
        className="font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:underline"
      >
        {name}
      </Link>
    </>
  );
}

function RunRequester({ user }: { user: UserRef | null }) {
  const { t } = useTranslation("admin");
  const name = useContributorName(user);

  if (user === null) return <span className="text-muted-foreground">{t("measurements.engine.runs.server")}</span>;
  return (
    <UserLink user={user} className="block w-fit max-w-full truncate">
      {name}
    </UserLink>
  );
}

function RunState({ run }: { run: EngineRun }) {
  const { t } = useTranslation("admin");
  const state = getEngineRunState(run);
  const { progress } = run;

  if (state === "running" && progress !== null) {
    const { done, total } = progress;
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs leading-4 text-muted-foreground tabular-nums">
          {total === null ? t("measurements.engine.runs.progressDone", { done }) : t("measurements.engine.runs.progress", { done, total })}
        </span>
        {total === null ? null : (
          <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${total > 0 ? Math.min((done / total) * 100, 100) : 0}%` }} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <EngineRunStateBadge state={state} />
      {state === "failed" && run.error !== null ? (
        <span className="min-w-0 truncate font-mono text-xs leading-4 text-muted-foreground" title={run.error}>
          {run.error}
        </span>
      ) : null}
    </div>
  );
}

function RunRow({ run, models, now }: RunRowProps) {
  const { t, i18n } = useTranslation("admin");
  const durationMs = getRunDurationMs(run, now);
  const personId = run.kind === "refold" && "userId" in run.params ? run.params.userId : null;
  const scope = personId === null ? getRunScope(t, run, models, i18n.language) : null;

  return (
    <TableRow className="h-12">
      <TableCell className={cn(COLUMN_CLASS, "font-medium")}>{t(`measurements.engine.runKinds.${run.kind}`)}</TableCell>
      <TableCell className={cn(COLUMN_CLASS, "truncate text-muted-foreground")} title={scope ?? undefined}>
        {personId === null ? scope : <PersonScope userId={personId} />}
      </TableCell>
      <TableCell className={cn(COLUMN_CLASS, "truncate")}>
        <RunRequester user={run.requestedBy} />
      </TableCell>
      <TableCell className={cn(COLUMN_CLASS, "text-muted-foreground tabular-nums")}>{formatDayTime(run.createdAt, i18n.language)}</TableCell>
      <TableCell className={COLUMN_CLASS}>
        <RunState run={run} />
      </TableCell>
      <TableCell className={cn(COLUMN_CLASS, "text-muted-foreground tabular-nums")}>
        {durationMs === null ? "-" : formatElapsed(t, durationMs)}
      </TableCell>
    </TableRow>
  );
}

export function EngineRunsCard({ runs, now }: { runs: readonly EngineRun[]; now: number }) {
  const { t } = useTranslation("admin");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const modelsQuery = useQuery(deviceModelsByIdsQueryOptions(getModelIds(runs)));
  const models = mapById(modelsQuery.data);

  return (
    <DashboardCard
      title={t("measurements.engine.runs.title")}
      count={runs.length}
      className="col-span-full"
      headEnd={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("-my-1 cursor-pointer", TINTED_BUTTON_CLASS)}
          onClick={() => setIsDialogOpen(true)}
        >
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("measurements.engine.runs.new")}
        </Button>
      }
    >
      {runs.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t("measurements.engine.runs.empty")}</p>
      ) : (
        <Table className="min-w-[1080px] table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(COLUMN_CLASS, "w-[218px]")}>{t("measurements.engine.runs.columns.kind")}</TableHead>
              <TableHead className={COLUMN_CLASS}>{t("measurements.engine.runs.columns.scope")}</TableHead>
              <TableHead className={cn(COLUMN_CLASS, "w-[190px]")}>{t("measurements.engine.runs.columns.requestedBy")}</TableHead>
              <TableHead className={cn(COLUMN_CLASS, "w-[150px]")}>{t("measurements.engine.runs.columns.createdAt")}</TableHead>
              <TableHead className={cn(COLUMN_CLASS, "w-[280px]")}>{t("measurements.engine.runs.columns.state")}</TableHead>
              <TableHead className={cn(COLUMN_CLASS, "w-[98px]")}>{t("measurements.engine.runs.columns.duration")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <RunRow key={run.id} run={run} models={models} now={now} />
            ))}
          </TableBody>
        </Table>
      )}
      <EngineRunDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </DashboardCard>
  );
}
