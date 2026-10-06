import { LockIcon, MapsIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { type FormEvent, type ReactNode, Suspense, lazy, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { countryQueryOptions, updateCountry } from "../../api/countries";
import { invalidateCountries } from "../../api/queryKeys";
import type { Country, CountryUpdate, CountryView } from "../../types";
import { hasChanges, pickChanges } from "../../utils/diff";
import { showReferenceError } from "../../utils/errors";
import {
  CenteredCardState,
  REFERENCE_DESCRIPTION_CLASS,
  ReferenceCard,
  ReferenceCardFooter,
  ReferenceCardHeader,
  ReferenceCardNote,
} from "../shared/referenceCards";
import { MONO_INPUT_CLASS, MONO_TEXT_CLASS } from "../shared/values";
import { COUNTRY_DEFAULT_VIEW_CARD_ID } from "./countrySections";
import {
  DEGREES_MAX_LENGTH,
  DEGREE_SIGN,
  VIEW_EDGES,
  type ViewEdge,
  type ViewEdgeProblem,
  findViewProblems,
  formatDegrees,
  isDrawableView,
  isEmptyViewDraft,
  isLongitudeEdge,
  isSameView,
  parseViewDraft,
  roundView,
  toViewDraft,
  useViewEdgeLabels,
} from "./defaultViewDraft";
import { DefaultViewMapDialog } from "./defaultViewMapDialog";
import { ErrorBoundary } from "@/components/app/errorBoundary";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type DefaultViewCardProps = {
  country: Country;
  canEdit: boolean;
};

type DefaultViewChanges = Pick<CountryUpdate, "defaultView">;

type CoordinateFieldProps = {
  label: string;
  value: string;
  errorText: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
};

type DefaultViewPreviewProps = {
  view: CountryView | null;
  isDraftEmpty: boolean;
};

const DefaultViewPreviewMap = lazy(() => import("./defaultViewMap").then((module) => ({ default: module.DefaultViewPreviewMap })));

function getProblemText(t: TFunction, edge: ViewEdge, problem: ViewEdgeProblem | null): string | null {
  if (problem === null) return null;
  if (problem === "northBelowSouth") return t("admin:reference.errors.country.viewNorthBelowSouth");
  return isLongitudeEdge(edge)
    ? t("admin:reference.country.general.defaultView.longitudeRange")
    : t("admin:reference.country.general.defaultView.latitudeRange");
}

function CoordinateField({ label, value, errorText, disabled, onChange }: CoordinateFieldProps) {
  const inputId = useId();
  const errorId = useId();
  const isInvalid = errorText !== null;

  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
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

function PreviewPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1.5 px-4 text-center text-xs leading-4 text-muted-foreground">
      <HugeiconsIcon icon={MapsIcon} aria-hidden="true" className="size-5" />
      {children}
    </div>
  );
}

function PreviewContent({ view }: { view: CountryView | null }) {
  const { t } = useTranslation("admin");

  if (view === null) return <PreviewPlaceholder>{t("reference.country.general.defaultView.preview.empty")}</PreviewPlaceholder>;
  if (!isDrawableView(view)) return <PreviewPlaceholder>{t("reference.country.general.defaultView.preview.unavailable")}</PreviewPlaceholder>;

  return (
    <ErrorBoundary
      resetKey={`${view.west}:${view.south}:${view.east}:${view.north}`}
      fallback={() => (
        <ErrorState
          title={t("reference.country.general.defaultView.preview.failed")}
          description={null}
          className="h-full min-h-0 rounded-none border-0 px-4 py-4"
        />
      )}
    >
      <Suspense fallback={<Skeleton className="size-full rounded-none" />}>
        <DefaultViewPreviewMap west={view.west} south={view.south} east={view.east} north={view.north} />
      </Suspense>
    </ErrorBoundary>
  );
}

function DefaultViewPreview({ view, isDraftEmpty }: DefaultViewPreviewProps) {
  const { t } = useTranslation("admin");
  const [lastView, setLastView] = useState(view);
  if (view !== null && !isSameView(view, lastView)) setLastView(view);

  return (
    <figure
      aria-label={t("reference.country.general.defaultView.preview.label")}
      className="relative h-49 w-full shrink-0 overflow-hidden rounded-lg border bg-muted/50 sm:w-70"
    >
      <PreviewContent view={isDraftEmpty ? null : (view ?? lastView)} />
    </figure>
  );
}

function EditableDefaultViewCard({ country }: { country: Country }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const formId = useId();
  const edgeLabels = useViewEdgeLabels();
  const [baseline, setBaseline] = useState(() => roundView(country.defaultView));
  const [draft, setDraft] = useState(() => toViewDraft(baseline));
  const [isMapOpen, setIsMapOpen] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (changes: DefaultViewChanges) => updateCountry(country.code, changes),
    onSuccess: (updatedCountry) => {
      const savedView = roundView(updatedCountry.defaultView);
      setBaseline(savedView);
      setDraft(toViewDraft(savedView));
      queryClient.setQueryData(countryQueryOptions(country.code).queryKey, (cachedCountry) =>
        cachedCountry ? { ...cachedCountry, defaultView: updatedCountry.defaultView } : cachedCountry,
      );
      void invalidateCountries(queryClient);
      toast.success(
        savedView === null ? t("reference.country.general.defaultView.removeSuccess") : t("reference.country.general.defaultView.saveSuccess"),
      );
    },
    onError: (error) => showReferenceError(error, "admin:reference.country.general.defaultView.saveFailed"),
  });

  const problems = findViewProblems(draft);
  const draftView = parseViewDraft(draft);
  const changes = pickChanges({ defaultView: baseline }, { defaultView: draftView }, ["defaultView"]);
  const isPending = saveMutation.isPending;
  const isRemoving = isPending && saveMutation.variables?.defaultView === null;
  const isSaving = isPending && !isRemoving;
  const canSave = draftView !== null && hasChanges(changes) && !isPending;
  const mapStartView = draftView ?? baseline;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSave) saveMutation.mutate(changes);
  }

  function removeView() {
    saveMutation.mutate({ defaultView: null });
  }

  function changeEdge(edge: ViewEdge, value: string) {
    setDraft((currentDraft) => ({ ...currentDraft, [edge]: value }));
  }

  return (
    <ReferenceCard id={COUNTRY_DEFAULT_VIEW_CARD_ID} className="scroll-mt-4">
      <ReferenceCardHeader
        title={t("reference.country.general.defaultView.title")}
        description={t("reference.country.general.defaultView.description")}
        action={
          <Button type="button" variant="outline" size="sm" className="cursor-pointer" disabled={isPending} onClick={() => setIsMapOpen(true)}>
            <HugeiconsIcon icon={MapsIcon} data-icon="inline-start" aria-hidden="true" />
            {t("reference.country.general.defaultView.setFromMap")}
          </Button>
        }
      />
      <form id={formId} onSubmit={handleSubmit} className="flex flex-wrap gap-5 border-t px-4 py-5 sm:px-5">
        <DefaultViewPreview view={draftView} isDraftEmpty={isEmptyViewDraft(draft)} />
        <div className="grid min-w-0 flex-[1_1_15rem] grid-cols-2 content-start gap-3">
          {VIEW_EDGES.map((edge) => (
            <CoordinateField
              key={edge}
              label={edgeLabels[edge]}
              value={draft[edge]}
              errorText={getProblemText(t, edge, problems[edge])}
              disabled={isPending}
              onChange={(value) => changeEdge(edge, value)}
            />
          ))}
        </div>
      </form>
      <ReferenceCardFooter className="mt-auto">
        {baseline === null ? (
          <p className="text-xs text-muted-foreground">{t("reference.country.general.defaultView.notSet")}</p>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="cursor-pointer text-muted-foreground" disabled={isPending} onClick={removeView}>
            {isRemoving ? <Spinner /> : null}
            {t("reference.country.general.defaultView.remove")}
          </Button>
        )}
        <Button type="submit" form={formId} size="sm" className="cursor-pointer" disabled={!canSave}>
          {isSaving ? <Spinner /> : null}
          {isSaving ? t("common:actions.saving") : t("reference.country.general.defaultView.save")}
        </Button>
      </ReferenceCardFooter>
      <DefaultViewMapDialog
        open={isMapOpen}
        onOpenChange={setIsMapOpen}
        initialView={mapStartView !== null && isDrawableView(mapStartView) ? mapStartView : null}
        onPick={(view) => setDraft(toViewDraft(view))}
      />
    </ReferenceCard>
  );
}

function ReadOnlyDefaultViewCard({ country }: { country: Country }) {
  const { t, i18n } = useTranslation("admin");
  const edgeLabels = useViewEdgeLabels();
  const view = country.defaultView;

  return (
    <ReferenceCard>
      <ReferenceCardHeader
        title={t("reference.country.general.defaultView.title")}
        description={t("reference.country.general.defaultView.description")}
      />
      {view === null ? (
        <CenteredCardState
          icon={MapsIcon}
          title={t("reference.country.general.defaultView.notSet")}
          description={t("reference.country.general.defaultView.notSetDescription")}
        />
      ) : (
        <dl>
          {VIEW_EDGES.map((edge) => (
            <div key={edge} className="flex min-h-11 items-center justify-between gap-4 border-t px-4 py-1.5 sm:px-5">
              <dt className={REFERENCE_DESCRIPTION_CLASS}>{edgeLabels[edge]}</dt>
              <dd className={MONO_TEXT_CLASS}>{formatDegrees(view[edge], i18n.language)}</dd>
            </div>
          ))}
        </dl>
      )}
      <ReferenceCardNote icon={LockIcon} className="mt-auto">
        {t("reference.country.general.readOnlyNote")}
      </ReferenceCardNote>
    </ReferenceCard>
  );
}

export function DefaultViewCard({ country, canEdit }: DefaultViewCardProps) {
  if (canEdit) return <EditableDefaultViewCard country={country} />;
  return <ReadOnlyDefaultViewCard country={country} />;
}
