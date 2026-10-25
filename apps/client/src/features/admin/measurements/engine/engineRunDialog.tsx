import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { EngineRunCreate, MeasurementDeviceModel, MeasurementReadingBlock } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { startEngineRun } from "../api/engine";
import { measurementsAdminKeys } from "../api/keys";
import { readingBlocksQueryOptions } from "../api/readingBlocks";
import { getPhonesName } from "../blocks/blockText";
import { useBlockLookups } from "../blocks/useBlockLookups";
import { DeviceModelPicker } from "../components/deviceModelPicker";
import { DialogCheckbox } from "../components/dialogCheckbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  DEGREES_MAX_LENGTH,
  DEGREE_SIGN,
  type ViewEdge,
  type ViewEdgeProblem,
  findViewProblems,
  isLongitudeEdge,
  parseViewDraft,
  useViewEdgeLabels,
} from "@/features/admin/reference/components/country/defaultViewDraft";
import { TeamPersonPicker } from "@/features/admin/reference/components/country/teamPersonPicker";
import { useOpeningCount } from "@/features/admin/reference/components/shared/useOpeningCount";
import { MONO_INPUT_CLASS } from "@/features/admin/reference/components/shared/values";
import type { PickerUser } from "@/features/admin/users/picker/api";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";
import { showApiError } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type StartableRunKind = EngineRunCreate["kind"];
type RefoldScope = "all" | "person" | "model" | "block";
type AreaDraft = Record<ViewEdge, string>;

type EngineRunDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type EngineRunFormProps = {
  isPending: boolean;
  onSubmit: (run: EngineRunCreate) => void;
  onCancel: () => void;
};

type RefoldBlockSelectProps = {
  blockId: number | null;
  labelledBy: string;
  disabled: boolean;
  onChange: (blockId: number) => void;
};

type AreaFieldProps = {
  label: string;
  value: string;
  errorText: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
};

const STARTABLE_RUN_KINDS = [
  "refold",
  "reestimate",
  "recalibrate",
  "evaluate",
  "rebuildTrails",
  "rebuildReadModels",
] as const satisfies readonly StartableRunKind[];
const REFOLD_SCOPES = ["all", "person", "model", "block"] as const satisfies readonly RefoldScope[];
const PICKED_SCOPE_LABEL_KEYS: Record<Exclude<RefoldScope, "all">, string> = {
  person: "measurements.engine.runDialog.choosePerson",
  model: "measurements.pickers.model.placeholder",
  block: "measurements.engine.runDialog.chooseBlock",
};
const AREA_EDGES = ["west", "south", "east", "north"] as const satisfies readonly ViewEdge[];
const EMPTY_AREA: AreaDraft = { west: "", south: "", east: "", north: "" };
const NO_HELD_USERS: ReadonlySet<string> = new Set();
const NO_BLOCKS: MeasurementReadingBlock[] = [];

function getAreaProblemText(t: TFunction, edge: ViewEdge, problem: ViewEdgeProblem | null): string | null {
  if (problem === null) return null;
  if (problem === "northBelowSouth") return t("reference.errors.country.viewNorthBelowSouth");
  return isLongitudeEdge(edge) ? t("reference.country.general.defaultView.longitudeRange") : t("reference.country.general.defaultView.latitudeRange");
}

function RefoldBlockSelect({ blockId, labelledBy, disabled, onChange }: RefoldBlockSelectProps) {
  const { t } = useTranslation("admin");
  const blocksQuery = useQuery(readingBlocksQueryOptions());
  const lookups = useBlockLookups(blocksQuery.data);
  const blocks = blocksQuery.data ?? NO_BLOCKS;

  if (blocksQuery.data === undefined) {
    if (!blocksQuery.isError) return <Skeleton className="h-8 w-full" />;
    return (
      <ErrorState
        title={t("measurements.blocks.list.loadFailed")}
        description={null}
        onRetry={() => blocksQuery.refetch()}
        isRetrying={blocksQuery.isFetching}
        className="min-h-0 py-4"
      />
    );
  }
  if (blocks.length === 0) return <p className="text-[13px] leading-[18px] text-muted-foreground">{t("measurements.engine.runDialog.noBlocks")}</p>;

  function getBlockLabel(block: MeasurementReadingBlock): string {
    return t("measurements.engine.runDialog.blockOption", { id: block.id, phones: getPhonesName(t, block.phones, lookups) });
  }

  const chosenBlock = blocks.find((block) => block.id === blockId);

  return (
    <Select
      value={blockId === null ? null : String(blockId)}
      onValueChange={(value) => {
        if (value !== null) onChange(Number(value));
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-labelledby={labelledBy} className="w-full cursor-pointer">
        <SelectValue placeholder={t("measurements.engine.runDialog.chooseBlock")}>
          {chosenBlock === undefined ? null : getBlockLabel(chosenBlock)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {blocks.map((block) => (
          <SelectItem key={block.id} value={String(block.id)} className="cursor-pointer">
            {getBlockLabel(block)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AreaField({ label, value, errorText, disabled, onChange }: AreaFieldProps) {
  const inputId = useId();
  const errorId = useId();
  const isInvalid = errorText !== null;

  return (
    <Field data-invalid={isInvalid || undefined} className="gap-1.5">
      <FieldLabel htmlFor={inputId} className="text-xs text-muted-foreground">
        {label}
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          {...NO_AUTOFILL_PROPS}
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          spellCheck={false}
          maxLength={DEGREES_MAX_LENGTH}
          disabled={disabled}
          aria-invalid={isInvalid || undefined}
          aria-describedby={isInvalid ? errorId : undefined}
          className={MONO_INPUT_CLASS}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText aria-hidden="true">{DEGREE_SIGN}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {errorText === null ? null : <FieldError id={errorId}>{errorText}</FieldError>}
    </Field>
  );
}

function EngineRunForm({ isPending, onSubmit, onCancel }: EngineRunFormProps) {
  const { t } = useTranslation(["admin", "common"]);
  const edgeLabels = useViewEdgeLabels();
  const kindGroupId = useId();
  const optionsTitleId = useId();
  const [kind, setKind] = useState<StartableRunKind>("refold");
  const [scope, setScope] = useState<RefoldScope>("all");
  const [person, setPerson] = useState<PickerUser | null>(null);
  const [model, setModel] = useState<MeasurementDeviceModel | null>(null);
  const [blockId, setBlockId] = useState<number | null>(null);
  const [gnbLengths, setGnbLengths] = useState(false);
  const [area, setArea] = useState<AreaDraft>(EMPTY_AREA);

  const areaProblems = findViewProblems(area);
  const parsedArea = parseViewDraft(area);
  const isEastBelowWest = parsedArea !== null && parsedArea.west >= parsedArea.east;

  function getAreaErrorText(edge: ViewEdge): string | null {
    if (edge === "east" && isEastBelowWest) return t("measurements.engine.runDialog.eastBelowWest");
    return getAreaProblemText(t, edge, areaProblems[edge]);
  }

  function buildRun(): EngineRunCreate | null {
    if (kind === "refold") {
      if (scope === "all") return { kind, params: {} };
      if (scope === "person") return person === null ? null : { kind, params: { userId: person.id } };
      if (scope === "model") return model === null ? null : { kind, params: { deviceModelId: model.id } };
      return blockId === null ? null : { kind, params: { readingBlockId: blockId } };
    }
    if (kind === "evaluate") return { kind, params: { gnbLengths } };
    if (kind === "rebuildTrails") return parsedArea === null || isEastBelowWest ? null : { kind, params: parsedArea };
    return { kind };
  }

  const run = buildRun();
  const canSubmit = run !== null && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (run !== null && !isPending) onSubmit(run);
  }

  let options: ReactNode = null;
  if (kind === "refold") {
    options = (
      <div className="flex flex-col gap-2">
        <SegmentedControl
          value={scope}
          options={REFOLD_SCOPES.map((value) => ({
            value,
            label: value === "all" ? t("common:status.all") : t(`measurements.engine.runDialog.scopes.${value}`),
          }))}
          onValueChange={setScope}
          ariaLabel={t("measurements.engine.runDialog.scopeLabel")}
          disabled={isPending}
        />
        {scope === "all" ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">{t("measurements.engine.scope.allFiles")}</p>
        ) : (
          <span id={optionsTitleId} className="sr-only">
            {t(PICKED_SCOPE_LABEL_KEYS[scope])}
          </span>
        )}
        {scope === "person" ? (
          <TeamPersonPicker person={person} onPersonChange={setPerson} heldUserIds={NO_HELD_USERS} labelledBy={optionsTitleId} />
        ) : null}
        {scope === "model" ? <DeviceModelPicker value={model} labelledBy={optionsTitleId} disabled={isPending} onChange={setModel} /> : null}
        {scope === "block" ? <RefoldBlockSelect blockId={blockId} labelledBy={optionsTitleId} disabled={isPending} onChange={setBlockId} /> : null}
      </div>
    );
  } else if (kind === "evaluate") {
    options = (
      <DialogCheckbox
        label={t("measurements.engine.runDialog.gnbLengths")}
        checked={gnbLengths}
        disabled={isPending}
        onCheckedChange={setGnbLengths}
      />
    );
  } else if (kind === "rebuildTrails") {
    options = (
      <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <legend className="sr-only">{t("measurements.engine.runDialog.areaLabel")}</legend>
        {AREA_EDGES.map((edge) => (
          <AreaField
            key={edge}
            label={edgeLabels[edge]}
            value={area[edge]}
            errorText={getAreaErrorText(edge)}
            disabled={isPending}
            onChange={(value) => setArea((current) => ({ ...current, [edge]: value }))}
          />
        ))}
      </fieldset>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("measurements.engine.runDialog.title")}</DialogTitle>
        <DialogDescription>{t("measurements.engine.runDialog.description")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <span id={kindGroupId} className="sr-only">
          {t("measurements.engine.runDialog.kindLabel")}
        </span>
        <RadioGroup
          value={kind}
          onValueChange={(value) => {
            const nextKind = STARTABLE_RUN_KINDS.find((candidate) => candidate === value);
            if (nextKind !== undefined) setKind(nextKind);
          }}
          disabled={isPending}
          aria-labelledby={kindGroupId}
        >
          {STARTABLE_RUN_KINDS.map((value) => (
            <FieldLabel key={value} htmlFor={`${kindGroupId}-${value}`} className="cursor-pointer">
              <Field orientation="horizontal">
                <RadioGroupItem id={`${kindGroupId}-${value}`} value={value} />
                <FieldContent>
                  <FieldTitle>{t(`measurements.engine.runDialog.kinds.${value}.title`)}</FieldTitle>
                  <FieldDescription>{t(`measurements.engine.runDialog.kinds.${value}.description`)}</FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
        {options === null ? null : <div className="rounded-lg border p-3">{options}</div>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={!canSubmit}>
          {isPending ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" aria-hidden="true" />}
          {t("measurements.engine.runDialog.start")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EngineRunDialog({ open, onOpenChange }: EngineRunDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);

  const startMutation = useMutation({
    mutationFn: startEngineRun,
    onSuccess: () => {
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.engine() });
      toast.success(t("measurements.engine.runDialog.started"));
    },
    onError: showApiError,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!startMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <EngineRunForm
          key={openingCount}
          isPending={startMutation.isPending}
          onSubmit={(run) => startMutation.mutate(run)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
