import { Add01Icon, ArrowDown01Icon, Copy01Icon, Download04Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type CLFDescriptionTemplatePlaceholder,
  type CLFDescriptionTemplateRat,
  type CLFDescriptionTemplates,
  CLF_DESCRIPTION_TEMPLATE_DEFAULTS,
  CLF_DESCRIPTION_TEMPLATE_LABELS,
  CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH,
  CLF_DESCRIPTION_TEMPLATE_PLACEHOLDERS_BY_RAT,
  CLF_DESCRIPTION_TEMPLATE_RATS,
  extractTemplatePlaceholders,
  normalizeCLFDescriptionTemplates,
  renderClfTemplatePreview,
} from "@openbts/shared/clfExportTemplates";
import {
  type Band,
  CELL_EXPORT_TEMPLATE_PARAMS,
  CELL_RATS,
  type CellExportQuery,
  type Operator,
  type Region,
  UNKNOWN_BAND,
} from "@openbts/shared/contract";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InlineError } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useNavActionTarget } from "@/contexts/navActions";
import { chooseExportFile, downloadExport, isExportCancelled } from "@/features/clf-export/download";
import { ClfOperatorSelector } from "@/features/clf-export/operatorSelector";
import { bandsQueryOptions, countriesQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { EXTENDED_RAT_OPTIONS } from "@/features/shared/rat";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { toV1OperatorMnc } from "@/features/station-details/station/utils/stations";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useIsMobile } from "@/hooks/useMobile";
import { type CLFExportFormat, areCLFDescriptionTemplatesEqual, type clfExportFilters, usePreferences } from "@/hooks/usePreferences";
import { API_V2_BASE } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { formatDuration, formatFileSize } from "@/lib/format";
import { buildStaticPageHead } from "@/lib/seo";
import { cn, toggleValue } from "@/lib/utils";

const FORMAT_OPTIONS = [
  { value: "2.0", label: "CLF v2.0" },
  { value: "2.1", label: "CLF v2.1" },
  { value: "3.0-dec", label: "CLF v3.0 (dec)" },
  { value: "3.0-hex", label: "CLF v3.0 (hex)" },
  { value: "4.0", label: "CLF v4.0" },
  { value: "ntm", label: "NetMonster (.ntm)" },
  { value: "netmonitor", label: "Netmonitor (.csv)" },
] as const;

type ExportDataset = {
  countryCode: string;
  operatorIds: number[] | undefined;
  operators: number[];
  regions: string[];
  bands: number[];
};

type FormValues = {
  dataset: ExportDataset;
  rat: string[];
  format: CLFExportFormat;
  displayNRSeparately: boolean;
};

type ExportLookups = {
  countryCode: string;
  countryCodes: readonly string[];
  isReady: boolean;
  operators: readonly Operator[];
  regions: readonly Region[];
  bands: readonly Band[];
};

type ExportFilters = {
  operatorIds: number[];
  regionIds: number[];
  bandIds: (number | typeof UNKNOWN_BAND)[];
};

const FORMAT_APP_BY_FORMAT: Record<CLFExportFormat, string> = {
  "2.0": "Netmonitor",
  "2.1": "Netmonitor",
  "3.0-dec": "Netmonitor",
  "3.0-hex": "Netmonitor",
  "4.0": "G-MoN",
  ntm: "NetMonster",
  netmonitor: "Netmonitor",
};

const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";
let desktopMediaQuery: MediaQueryList | undefined;

function getDesktopMediaQuery() {
  if (typeof window === "undefined") return undefined;
  desktopMediaQuery ??= window.matchMedia(DESKTOP_MEDIA_QUERY);
  return desktopMediaQuery;
}

function subscribeToDesktopMediaQuery(callback: () => void) {
  const mediaQuery = getDesktopMediaQuery();
  if (mediaQuery === undefined) return () => {};
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeToDesktopMediaQuery,
    () => getDesktopMediaQuery()?.matches ?? false,
    () => true,
  );
}

function getFormatLabel(format: CLFExportFormat) {
  return FORMAT_OPTIONS.find((option) => option.value === format)?.label ?? format;
}

type DataSourceNoticeProps = {
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  label: string;
  onRetry: () => void;
};

function DataSourceNotice({ isError, isFetching, isLoading, label, onRetry }: DataSourceNoticeProps) {
  const { t } = useTranslation("clfExport");

  if (isLoading)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Spinner className="size-3.5" aria-hidden="true" />
        {t("dataSources.loading", { source: label })}
      </p>
    );

  if (!isError) return null;

  return (
    <InlineError
      title={t("dataSources.errorTitle", { source: label })}
      description={t("dataSources.errorDescription")}
      onRetry={onRetry}
      isRetrying={isFetching}
    />
  );
}

type ExportActionsProps = {
  compact?: boolean;
  copiedApiUrl: boolean;
  elapsed: number;
  finalDuration: number | null;
  isDisabled: boolean;
  isSubmitting: boolean;
  receivedBytes: number;
  onCancel: () => void;
  onCopyApiUrl?: () => void;
};

function ExportActions({
  compact = false,
  copiedApiUrl,
  elapsed,
  finalDuration,
  isDisabled,
  isSubmitting,
  receivedBytes,
  onCancel,
  onCopyApiUrl,
}: ExportActionsProps) {
  const { t } = useTranslation(["clfExport", "common"]);
  const progressLabel = [
    t("form.elapsed", { duration: formatDuration(elapsed) }),
    t("form.receivedBytes", { size: formatFileSize(receivedBytes) }),
  ].join(" · ");

  if (compact)
    return (
      <div className={cn("inline-flex flex-col border bg-background p-1 shadow-sm", isSubmitting ? "rounded-2xl" : "rounded-full")}>
        <div className="inline-flex items-center">
          <Button type="submit" form="clf-export-form" disabled={isDisabled || isSubmitting} aria-busy={isSubmitting} className="shrink-0">
            {isSubmitting ? <Spinner aria-hidden="true" /> : <HugeiconsIcon icon={Download04Icon} aria-hidden="true" />}
            {isSubmitting ? t("form.exporting") : t("form.export")}
          </Button>
          {isSubmitting ? (
            <Button type="button" variant="ghost" className="shrink-0" onClick={onCancel}>
              {t("common:actions.cancel")}
            </Button>
          ) : null}
        </div>
        {isSubmitting ? (
          <p className="px-2 pt-1 pb-0.5 text-center text-xs text-muted-foreground tabular-nums" role="status">
            {progressLabel}
          </p>
        ) : null}
      </div>
    );

  return (
    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
      <Button type="submit" form="clf-export-form" disabled={isDisabled || isSubmitting} aria-busy={isSubmitting} size="lg" className="w-full">
        {isSubmitting ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : (
          <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" aria-hidden="true" />
        )}
        {isSubmitting ? t("form.exporting") : t("form.export")}
      </Button>
      {isSubmitting ? (
        <p className="text-center text-xs text-muted-foreground tabular-nums" role="status">
          {progressLabel}
        </p>
      ) : null}
      {isSubmitting ? (
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
      ) : null}
      {!isSubmitting && finalDuration !== null ? (
        <p className="text-center text-xs text-muted-foreground tabular-nums">
          {t("common:time.completedIn", { duration: formatDuration(finalDuration) })}
        </p>
      ) : null}
      {onCopyApiUrl ? (
        <Button type="button" variant="ghost" disabled={isDisabled} className="w-full text-muted-foreground" onClick={onCopyApiUrl}>
          <HugeiconsIcon icon={copiedApiUrl ? Tick02Icon : Copy01Icon} aria-hidden="true" />
          {copiedApiUrl ? t("common:actions.copied") : t("form.copyApiUrl")}
        </Button>
      ) : null}
    </div>
  );
}

function resolveOperatorIds(dataset: ExportDataset, operators: readonly Operator[]): number[] | null {
  const operatorIds: number[] = [];
  if (dataset.operatorIds !== undefined) {
    for (const id of dataset.operatorIds) {
      const operator = operators.find((operator) => operator.id === id && operator.countryCode === dataset.countryCode);
      if (operator === undefined) return null;
      operatorIds.push(id);
    }
    return operatorIds;
  }
  if (dataset.operators.length > 0 && dataset.countryCode !== "PL") return null;
  for (const mnc of dataset.operators) {
    const operator = operators.find((operator) => operator.countryCode === "PL" && toV1OperatorMnc(operator) === mnc);
    if (operator === undefined) return null;
    operatorIds.push(operator.id);
  }
  return operatorIds;
}

function resolveExportFilters(values: FormValues, lookups: ExportLookups): ExportFilters | null {
  const dataset = values.dataset;
  if (!lookups.isReady || dataset.countryCode !== lookups.countryCode || !lookups.countryCodes.includes(dataset.countryCode)) return null;
  const operatorIds = resolveOperatorIds(dataset, lookups.operators);
  if (operatorIds === null) return null;

  const regionIds: number[] = [];
  for (const code of dataset.regions) {
    const region = lookups.regions.find((region) => region.countryCode === dataset.countryCode && region.code === code);
    if (region === undefined) return null;
    regionIds.push(region.id);
  }

  const bandIds = new Set<number | typeof UNKNOWN_BAND>();
  for (const mhz of dataset.bands) {
    if (mhz === 0) {
      bandIds.add(UNKNOWN_BAND);
      continue;
    }
    const matchingBands = lookups.bands.filter((band) => band.labelMhz === mhz);
    if (matchingBands.length === 0) return null;
    for (const band of matchingBands) bandIds.add(band.id);
  }

  return { operatorIds, regionIds, bandIds: [...bandIds] };
}

function buildExportUrl(values: FormValues, templateDrafts: CLFDescriptionTemplates, lookups: ExportLookups): string | null {
  const filters = resolveExportFilters(values, lookups);
  if (filters === null) return null;

  const query: CellExportQuery = { format: values.format, countryCodes: [values.dataset.countryCode] };
  if (filters.operatorIds.length > 0) query.operatorIds = filters.operatorIds;
  if (filters.regionIds.length > 0) query.regionIds = filters.regionIds;
  if (filters.bandIds.length > 0) query.bandIds = filters.bandIds;

  const rats = CELL_RATS.filter((rat) => values.rat.includes(rat.toUpperCase()));
  if (rats.length > 0) query.rats = rats;
  if (values.rat.includes("IOT")) {
    if (rats.length === 0) {
      query.rats = ["lte", "nr"];
      query.supportsIot = true;
    } else query.includeIot = true;
  }

  const templates = normalizeCLFDescriptionTemplates(templateDrafts);
  for (const rat of CLF_DESCRIPTION_TEMPLATE_RATS) {
    const template = templates[rat];
    if (template) query[CELL_EXPORT_TEMPLATE_PARAMS[rat]] = template;
  }

  if (values.format === "ntm" && values.displayNRSeparately) query.displayNrSeparately = true;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  return `${API_V2_BASE}/cells/export?${params.toString()}`;
}

const INITIAL_VALUES: FormValues = {
  dataset: { countryCode: "PL", operatorIds: undefined, operators: [], regions: [], bands: [] },
  rat: [],
  format: "4.0",
  displayNRSeparately: false,
};

function formValuesFromPreferences(filters: clfExportFilters): FormValues {
  return {
    ...INITIAL_VALUES,
    format: filters.format ?? INITIAL_VALUES.format,
    displayNRSeparately: filters.displayNRSeparately ?? INITIAL_VALUES.displayNRSeparately,
    dataset: {
      countryCode: filters.countryCode ?? "PL",
      operatorIds: filters.operatorIds,
      operators: filters.operators ?? [],
      regions: filters.regions ?? [],
      bands: filters.bands ?? [],
    },
  };
}

function ClfExportPage() {
  const { t } = useTranslation("clfExport");
  const { preferences, updatePreferences, clfDescriptionTemplates, updateClfDescriptionTemplates } = usePreferences();
  const { data: session, isPending: isSessionPending, error: sessionError, refetch: refetchSession } = authClient.useSession();
  const viewerReady = !isSessionPending && !sessionError;
  const viewerId = session?.user.id ?? null;
  const countryCode = preferences.clfExportFilters.countryCode ?? "PL";
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const hasFloatingMobileActions = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const {
    data: allOperators = [],
    isLoadingError: isOperatorsLoadError,
    isFetching: isOperatorsFetching,
    isLoading: isOperatorsLoading,
    refetch: refetchOperators,
  } = useQuery({ ...operatorsQueryOptions({ viewerId }), enabled: viewerReady });

  const {
    data: countries = [],
    isLoadingError: isCountriesLoadError,
    isFetching: isCountriesFetching,
    isLoading: isCountriesLoading,
    refetch: refetchCountries,
  } = useQuery({ ...countriesQueryOptions({ viewerId }), enabled: viewerReady });
  const countryAvailable = viewerReady && countries.some((country) => country.code === countryCode);

  const {
    data: countryRegions = [],
    isLoadingError: isRegionsLoadError,
    isFetching: isRegionsFetching,
    isLoading: isRegionsLoading,
    refetch: refetchRegions,
  } = useQuery({ ...regionsQueryOptions({ countryCode, viewerId }), enabled: countryAvailable });

  const {
    data: countryBands = [],
    isLoadingError: isBandsLoadError,
    isFetching: isBandsFetching,
    isLoading: isBandsLoading,
    refetch: refetchBands,
  } = useQuery({ ...bandsQueryOptions({ countryCode, viewerId }), enabled: countryAvailable });

  const operatorsUnavailable = !viewerReady || isOperatorsLoading || isOperatorsLoadError || isCountriesLoading || isCountriesLoadError;
  const regionsUnavailable = !countryAvailable || isRegionsLoading || isRegionsLoadError;
  const bandsUnavailable = !countryAvailable || isBandsLoading || isBandsLoadError;
  const regions = countryAvailable ? countryRegions : [];
  const bands = countryAvailable ? countryBands : [];
  const uniqueBandValues = bandsUnavailable
    ? []
    : [...new Set([0, ...bands.map((band) => band.labelMhz).filter((mhz) => mhz !== null)])].sort((a, b) => a - b);
  const exportLookups: ExportLookups = {
    countryCode,
    countryCodes: countries.map((country) => country.code),
    isReady: !operatorsUnavailable && !regionsUnavailable && !bandsUnavailable,
    operators: allOperators,
    regions,
    bands,
  };

  const exportStartRef = useRef<number | null>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  const exportIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copiedApiUrlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templateInputRefs = useRef<Partial<Record<CLFDescriptionTemplateRat, HTMLTextAreaElement | null>>>({});
  const [elapsed, setElapsed] = useState(0);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);
  const [templateDrafts, setTemplateDrafts] = useState<CLFDescriptionTemplates>(() => clfDescriptionTemplates);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateSaveState, setTemplateSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [copiedApiUrl, setCopiedApiUrl] = useState(false);
  const [disabledPreviews, setDisabledPreviews] = useState<Partial<Record<CLFDescriptionTemplateRat, Set<string>>>>({});
  const lastSentTemplatesRef = useRef<CLFDescriptionTemplates | null>(null);
  const lastSentFiltersRef = useRef<clfExportFilters | null>(null);

  const debouncedSaveTemplates = useDebouncedCallback((next: CLFDescriptionTemplates) => {
    lastSentTemplatesRef.current = next;
    updateClfDescriptionTemplates(next);
    setTemplateSaveState("saved");
  }, 300);

  useEffect(() => {
    const lastSent = lastSentTemplatesRef.current;
    if (lastSent !== null && areCLFDescriptionTemplatesEqual(lastSent, clfDescriptionTemplates)) return;
    setTemplateDrafts(clfDescriptionTemplates);
  }, [clfDescriptionTemplates]);

  useEffect(() => {
    return () => {
      exportControllerRef.current?.abort();
      exportControllerRef.current = null;
      if (exportIntervalRef.current) clearInterval(exportIntervalRef.current);
      if (copiedApiUrlTimerRef.current) clearTimeout(copiedApiUrlTimerRef.current);
    };
  }, []);

  function updateTemplateDraft(rat: CLFDescriptionTemplateRat, value: string) {
    setTemplateSaveState("saving");
    setTemplateDrafts((current) => {
      const next = { ...current, [rat]: value };
      debouncedSaveTemplates(normalizeCLFDescriptionTemplates(next));
      return next;
    });
  }

  function insertTemplatePlaceholder(rat: CLFDescriptionTemplateRat, placeholder: CLFDescriptionTemplatePlaceholder) {
    const input = templateInputRefs.current[rat];
    const currentValue = templateDrafts[rat] ?? "";
    const token = `{${placeholder}}`;
    const selectionStart = input?.selectionStart ?? currentValue.length;
    const selectionEnd = input?.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, selectionStart)}${token}${currentValue.slice(selectionEnd)}`;
    updateTemplateDraft(rat, nextValue);

    requestAnimationFrame(() => {
      input?.focus();
      const cursor = selectionStart + token.length;
      input?.setSelectionRange(cursor, cursor);
    });
  }

  function togglePreviewPlaceholder(rat: CLFDescriptionTemplateRat, placeholder: string) {
    setDisabledPreviews((current) => {
      const ratSet = new Set(current[rat]);
      if (ratSet.has(placeholder)) ratSet.delete(placeholder);
      else ratSet.add(placeholder);
      return { ...current, [rat]: ratSet };
    });
  }

  const form = useForm({
    defaultValues: formValuesFromPreferences(preferences.clfExportFilters),
    onSubmit: async ({ value }) => {
      const url = buildExportUrl(value, templateDrafts, exportLookups);
      if (url === null) {
        toast.error(t("exportError"));
        return;
      }

      exportControllerRef.current?.abort();
      const controller = new AbortController();
      exportControllerRef.current = controller;
      if (exportIntervalRef.current) clearInterval(exportIntervalRef.current);
      exportIntervalRef.current = null;
      exportStartRef.current = null;
      setElapsed(0);
      setReceivedBytes(0);
      setFinalDuration(null);

      try {
        const destination = await chooseExportFile(value.format);
        if (controller.signal.aborted) return;
        exportStartRef.current = Date.now();
        exportIntervalRef.current = setInterval(() => {
          if (exportStartRef.current) setElapsed(Date.now() - exportStartRef.current);
        }, 500);

        const result = await downloadExport(url, value.format, {
          controller,
          destination,
          onProgress: (bytes) => {
            if (exportControllerRef.current === controller && !controller.signal.aborted) setReceivedBytes(bytes);
          },
        });
        if (exportControllerRef.current !== controller) return;
        if (result === "saved") {
          toast.success(t("exportSuccess"));
          if (exportStartRef.current !== null) setFinalDuration(Date.now() - exportStartRef.current);
        } else if (result === "failed") toast.error(t("exportError"));
      } catch (error) {
        if (exportControllerRef.current === controller && !controller.signal.aborted && !isExportCancelled(error)) toast.error(t("exportError"));
        controller.abort();
      } finally {
        if (exportControllerRef.current === controller) {
          if (exportIntervalRef.current) clearInterval(exportIntervalRef.current);
          exportIntervalRef.current = null;
          exportStartRef.current = null;
          exportControllerRef.current = null;
          setReceivedBytes(0);
        }
      }
    },
  });

  useEffect(() => {
    const lastSent = lastSentFiltersRef.current;
    if (lastSent === preferences.clfExportFilters) {
      lastSentFiltersRef.current = null;
      return;
    }
    lastSentFiltersRef.current = null;
    form.reset({
      ...formValuesFromPreferences(preferences.clfExportFilters),
      rat: form.state.values.rat,
    });
  }, [form, preferences.clfExportFilters]);

  function updateClfExportFilters(update: Partial<clfExportFilters>) {
    const dataset = form.state.values.dataset;
    const operatorIds = exportLookups.isReady ? resolveOperatorIds(dataset, allOperators) : null;
    if (operatorIds !== null && dataset.operatorIds === undefined) form.setFieldValue("dataset", { ...dataset, operatorIds, operators: [] });
    const next = {
      ...preferences.clfExportFilters,
      countryCode: dataset.countryCode,
      ...(operatorIds === null ? {} : { operatorIds, operators: [] }),
      ...update,
    };
    lastSentFiltersRef.current = next;
    updatePreferences({ clfExportFilters: next });
  }

  async function copyApiUrl() {
    const url = buildExportUrl(form.state.values, templateDrafts, exportLookups);
    if (url === null) {
      setCopiedApiUrl(false);
      toast.error(t("copyError"));
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiedApiUrl(true);
      toast.success(t("copySuccess"));
      if (copiedApiUrlTimerRef.current) clearTimeout(copiedApiUrlTimerRef.current);
      copiedApiUrlTimerRef.current = setTimeout(() => setCopiedApiUrl(false), 2000);
    } catch {
      setCopiedApiUrl(false);
      toast.error(t("copyError"));
    }
  }

  const editedTemplateCount = CLF_DESCRIPTION_TEMPLATE_RATS.filter((rat) => (templateDrafts[rat] ?? "").length > 0).length;
  let templateSaveLabel = t("templates.autoSave");
  if (templateSaveState === "saving") templateSaveLabel = t("common:actions.saving");
  else if (templateSaveState === "saved") templateSaveLabel = t("common:actions.saved");

  return (
    <main className="flex-1 overflow-y-auto p-4 pb-24 md:pb-6">
      <div className="max-w-4xl space-y-6 lg:max-w-[100rem]">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("nav:items.clfExport")}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("page.description")}</p>
        </div>

        <div className="space-y-6 lg:grid lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-8 lg:space-y-0">
          <div className="space-y-6">
            <form
              id="clf-export-form"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
              className="space-y-6"
            >
              <section className="space-y-5 rounded-xl border p-4 md:p-5" aria-labelledby="clf-dataset-title">
                <div className="space-y-1">
                  <h2 id="clf-dataset-title" className="text-lg font-semibold">
                    {t("workflow.dataset.title")}
                  </h2>
                  <p className="text-sm text-muted-foreground">{t("workflow.dataset.description")}</p>
                </div>

                <div className="space-y-2">
                  {sessionError && !isSessionPending ? <InlineError size="sm" onRetry={() => void refetchSession()} /> : null}
                  <form.Field name="dataset">
                    {(field) => (
                      <ClfOperatorSelector
                        countries={viewerReady ? countries : []}
                        operators={viewerReady ? allOperators : []}
                        countryCode={field.state.value.countryCode}
                        operatorIds={viewerReady ? resolveOperatorIds(field.state.value, allOperators) : null}
                        disabled={operatorsUnavailable}
                        onChange={(countryCode, operatorIds) => {
                          const current = field.state.value;
                          const dataset = {
                            ...current,
                            countryCode,
                            operatorIds,
                            operators: [],
                            ...(countryCode === current.countryCode ? {} : { regions: [], bands: [] }),
                          };
                          field.handleChange(dataset);
                          updateClfExportFilters(dataset);
                        }}
                      />
                    )}
                  </form.Field>
                  <DataSourceNotice
                    isError={viewerReady && isOperatorsLoadError}
                    isFetching={isOperatorsFetching}
                    isLoading={isSessionPending || isOperatorsLoading}
                    label={t("dataSources.operators")}
                    onRetry={() => {
                      if (viewerReady) void refetchOperators();
                    }}
                  />
                  <DataSourceNotice
                    isError={viewerReady && isCountriesLoadError}
                    isFetching={isCountriesFetching}
                    isLoading={isSessionPending || isCountriesLoading}
                    label={t("dataSources.countries")}
                    onRetry={() => {
                      if (viewerReady) void refetchCountries();
                    }}
                  />
                </div>

                <Separator />

                <fieldset className="space-y-2" disabled={regionsUnavailable}>
                  <legend className="text-sm font-semibold">{t("common:labels.region")}</legend>
                  <form.Field name="dataset.regions">
                    {(field) => (
                      <div className={cn("flex flex-wrap gap-1", regionsUnavailable && "opacity-60")}>
                        {regions.map((region) => (
                          <label
                            htmlFor={`region-${region.code}`}
                            key={region.code}
                            className={cn(
                              "flex min-h-8 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
                              field.state.value.includes(region.code) ? "bg-primary/10" : "hover:bg-muted",
                            )}
                          >
                            <Checkbox
                              id={`region-${region.code}`}
                              checked={field.state.value.includes(region.code)}
                              disabled={regionsUnavailable}
                              onCheckedChange={() => {
                                const regions = toggleValue(field.state.value, region.code);
                                field.handleChange(regions);
                                updateClfExportFilters({ regions });
                              }}
                            />
                            <span className="truncate">{region.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </form.Field>
                </fieldset>
                <DataSourceNotice
                  isError={countryAvailable && isRegionsLoadError}
                  isFetching={isRegionsFetching}
                  isLoading={isRegionsLoading}
                  label={t("dataSources.regions")}
                  onRetry={() => {
                    if (countryAvailable) void refetchRegions();
                  }}
                />

                <Separator />

                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">{t("common:labels.standard")}</legend>
                  <p className="text-xs text-muted-foreground">{t("form.standardHint")}</p>
                  <form.Field name="rat">
                    {(field) => (
                      <div className="flex flex-wrap gap-1">
                        {EXTENDED_RAT_OPTIONS.map((rat) => (
                          <label
                            htmlFor={`rat-${rat.value}`}
                            key={rat.value}
                            className={cn(
                              "flex min-h-8 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
                              field.state.value.includes(rat.value) ? "bg-primary/10" : "hover:bg-muted",
                            )}
                          >
                            <Checkbox
                              id={`rat-${rat.value}`}
                              checked={field.state.value.includes(rat.value)}
                              onCheckedChange={() => field.handleChange(toggleValue(field.state.value, rat.value))}
                            />
                            <GenerationTag>{rat.gen}</GenerationTag>
                            <span>{rat.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </form.Field>
                </fieldset>

                <Separator />

                <fieldset className="space-y-2" disabled={bandsUnavailable}>
                  <legend className="text-sm font-semibold">{t("common:labels.band")} (MHz)</legend>
                  <p className="text-xs text-muted-foreground">{t("form.bandsHint")}</p>
                  <form.Field name="dataset.bands">
                    {(field) => (
                      <div className={cn("flex flex-wrap gap-1", bandsUnavailable && "opacity-60")}>
                        {uniqueBandValues.map((band) => (
                          <label
                            htmlFor={`band-${band}`}
                            key={band}
                            className={cn(
                              "flex min-h-8 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
                              field.state.value.includes(band) ? "bg-primary/10" : "hover:bg-muted",
                            )}
                          >
                            <Checkbox
                              id={`band-${band}`}
                              checked={field.state.value.includes(band)}
                              disabled={bandsUnavailable}
                              onCheckedChange={() => {
                                const bands = toggleValue(field.state.value, band);
                                field.handleChange(bands);
                                updateClfExportFilters({ bands });
                              }}
                            />
                            <span className="font-mono">{band === 0 ? t("stations:cells.unknownBand") : band}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </form.Field>
                </fieldset>
                <DataSourceNotice
                  isError={countryAvailable && isBandsLoadError}
                  isFetching={isBandsFetching}
                  isLoading={isBandsLoading}
                  label={t("dataSources.bands")}
                  onRetry={() => {
                    if (countryAvailable) void refetchBands();
                  }}
                />
              </section>

              <section className="space-y-5 rounded-xl border p-4 md:p-5" aria-labelledby="clf-format-title">
                <div className="space-y-1">
                  <h2 id="clf-format-title" className="text-lg font-semibold">
                    {t("workflow.format.title")}
                  </h2>
                  <p className="text-sm text-muted-foreground">{t("workflow.format.description")}</p>
                </div>

                <fieldset className="space-y-3">
                  <legend className="sr-only">{t("form.outputFormat")}</legend>
                  <form.Field name="format">
                    {(field) => (
                      <>
                        <RadioGroup
                          value={field.state.value}
                          onValueChange={(value) => {
                            const format = value as CLFExportFormat;
                            field.handleChange(format);
                            updateClfExportFilters({ format });
                          }}
                          className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3"
                        >
                          {FORMAT_OPTIONS.map((format) => (
                            <label
                              htmlFor={`format-${format.value}`}
                              key={format.value}
                              className={cn(
                                "flex min-h-9 cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-sm transition-colors",
                                field.state.value === format.value ? "bg-primary/10" : "hover:bg-muted",
                              )}
                            >
                              <RadioGroupItem id={`format-${format.value}`} value={format.value} />
                              <span>{format.label}</span>
                            </label>
                          ))}
                        </RadioGroup>
                        <p className="rounded-lg bg-muted/40 p-3 text-sm">
                          <span className="font-medium">{getFormatLabel(field.state.value)}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {t("form.compatibility", { app: FORMAT_APP_BY_FORMAT[field.state.value] })}
                          </span>
                        </p>
                      </>
                    )}
                  </form.Field>
                  <form.Subscribe selector={(s) => s.values.format}>
                    {(format) =>
                      format === "ntm" ? (
                        <form.Field name="displayNRSeparately">
                          {(field) => (
                            <label htmlFor="display-nr-separately" className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                              <Checkbox
                                id="display-nr-separately"
                                checked={field.state.value}
                                onCheckedChange={(checked) => {
                                  const displayNRSeparately = !!checked;
                                  field.handleChange(displayNRSeparately);
                                  updateClfExportFilters({ displayNRSeparately });
                                }}
                                className="mt-0.5"
                              />
                              <span className="space-y-1">
                                <span className="block font-medium">{t("form.displayNRSeparately.title")}</span>
                                <span className="block text-xs text-muted-foreground">{t("form.displayNRSeparately.description")}</span>
                              </span>
                            </label>
                          )}
                        </form.Field>
                      ) : null
                    }
                  </form.Subscribe>
                </fieldset>

                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    {t("form.formatInfo")}{" "}
                    <a
                      href="http://www.afischer-online.de/sos/celltrack/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      2.x, 3.x
                    </a>
                    {", "}
                    <a
                      href="https://sites.google.com/site/clfgmon/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      4.0
                    </a>
                    {", "}
                    <a
                      href="https://netmonster.app/#docs-user-about-ntm"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      NetMonster
                    </a>{" "}
                    {t("common:and")}{" "}
                    <a
                      href="https://netmonitor.ing/docs/cell-database-default/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Netmonitor
                    </a>
                  </p>
                  <p>{t("info.iosNote")}</p>
                </div>

                <div className="lg:hidden">
                  <form.Subscribe selector={(state) => resolveExportFilters(state.values, exportLookups) === null}>
                    {(isDisabled) => (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isDisabled}
                        className="px-0 text-muted-foreground"
                        onClick={() => void copyApiUrl()}
                      >
                        <HugeiconsIcon icon={copiedApiUrl ? Tick02Icon : Copy01Icon} aria-hidden="true" />
                        {copiedApiUrl ? t("common:actions.copied") : t("form.copyApiUrl")}
                      </Button>
                    )}
                  </form.Subscribe>
                </div>
              </section>
            </form>
          </div>

          <div className="space-y-4">
            {isDesktop ? (
              <div>
                <form.Subscribe selector={(state) => [state.isSubmitting, resolveExportFilters(state.values, exportLookups) === null] as const}>
                  {([isSubmitting, isDisabled]) => (
                    <ExportActions
                      copiedApiUrl={copiedApiUrl}
                      elapsed={elapsed}
                      finalDuration={finalDuration}
                      isDisabled={isDisabled}
                      isSubmitting={isSubmitting}
                      receivedBytes={receivedBytes}
                      onCancel={() => exportControllerRef.current?.abort()}
                      onCopyApiUrl={() => void copyApiUrl()}
                    />
                  )}
                </form.Subscribe>
              </div>
            ) : null}

            <Collapsible open={templatesOpen} onOpenChange={setTemplatesOpen} className="rounded-xl border">
              <CollapsibleTrigger
                type="button"
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold">{t("templates.title")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {editedTemplateCount === 0 ? t("templates.defaultSummary") : t("templates.editedSummary", { count: editedTemplateCount })}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
                  {templateSaveState === "saving" ? <Spinner className="size-3.5" aria-hidden="true" /> : null}
                  {templateSaveState === "saved" ? <HugeiconsIcon icon={Tick02Icon} className="size-3.5" aria-hidden="true" /> : null}
                  {templateSaveLabel}
                </span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  className={cn("size-4 shrink-0 transition-transform", templatesOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t p-4">
                <p className="mb-4 text-sm text-muted-foreground">{t("templates.description")}</p>
                <div className="space-y-4">
                  {CLF_DESCRIPTION_TEMPLATE_RATS.map((rat) => {
                    const usedPlaceholders = extractTemplatePlaceholders(rat, templateDrafts[rat] ?? "");
                    const disabled = disabledPreviews[rat];
                    return (
                      <div key={rat} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor={`template-${rat}`} className="font-mono text-xs font-semibold text-foreground">
                            {CLF_DESCRIPTION_TEMPLATE_LABELS[rat]}
                          </Label>
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("templates.insertPlaceholder")} />}>
                              <HugeiconsIcon icon={Add01Icon} className="size-3.5" aria-hidden="true" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-72 sm:w-80">
                              {CLF_DESCRIPTION_TEMPLATE_PLACEHOLDERS_BY_RAT[rat].map((placeholder) => (
                                <DropdownMenuItem key={placeholder} onClick={() => insertTemplatePlaceholder(rat, placeholder)} className="gap-3">
                                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{`{${placeholder}}`}</span>
                                  <span className="ml-auto truncate text-right text-xs text-muted-foreground">
                                    {t(`templates.placeholders.${placeholder}`)}
                                  </span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <Textarea
                          id={`template-${rat}`}
                          ref={(node) => {
                            templateInputRefs.current[rat] = node;
                          }}
                          value={templateDrafts[rat] ?? ""}
                          onChange={(event) => updateTemplateDraft(rat, event.target.value)}
                          placeholder={CLF_DESCRIPTION_TEMPLATE_DEFAULTS[rat]}
                          maxLength={CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH}
                          rows={2}
                          aria-describedby={"template-preview-" + rat}
                          className="min-h-14 resize-none font-mono text-xs leading-relaxed placeholder:text-muted-foreground"
                        />
                        <span className="block text-[11px] font-medium text-muted-foreground">{t("templates.preview")}</span>
                        <output
                          id={"template-preview-" + rat}
                          className="block font-mono text-[11px] leading-relaxed whitespace-pre-wrap wrap-break-word text-muted-foreground"
                          aria-label={`${CLF_DESCRIPTION_TEMPLATE_LABELS[rat]} ${t("templates.preview")}`}
                        >
                          {renderClfTemplatePreview(rat, templateDrafts[rat] ?? "", disabled)}
                        </output>
                        {usedPlaceholders.length > 0 ? (
                          <div className="flex flex-wrap gap-1" role="group" aria-label={t("templates.toggleHint")}>
                            {usedPlaceholders.map((placeholder) => (
                              <button
                                key={placeholder}
                                type="button"
                                title={t("templates.toggleHint")}
                                aria-pressed={disabled?.has(placeholder) !== true}
                                onClick={() => togglePreviewPlaceholder(rat, placeholder)}
                                className={cn(
                                  "min-h-6 cursor-pointer rounded-full border px-2 py-0.5 font-mono text-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                                  disabled?.has(placeholder)
                                    ? "border-transparent bg-muted text-muted-foreground/60 line-through"
                                    : "border-primary/20 bg-primary/10 text-foreground hover:bg-primary/20",
                                )}
                              >
                                {placeholder}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        {!isDesktop ? (
          <form.Subscribe selector={(state) => [state.isSubmitting, resolveExportFilters(state.values, exportLookups) === null] as const}>
            {([isSubmitting, isDisabled]) => {
              const controls = (
                <ExportActions
                  compact
                  copiedApiUrl={copiedApiUrl}
                  elapsed={elapsed}
                  finalDuration={finalDuration}
                  isDisabled={isDisabled}
                  isSubmitting={isSubmitting}
                  receivedBytes={receivedBytes}
                  onCancel={() => exportControllerRef.current?.abort()}
                />
              );

              return isMobile && hasFloatingMobileActions && navActionTarget ? (
                createPortal(<div className="flex w-[calc(100vw-1.5rem)] min-w-0 justify-center">{controls}</div>, navActionTarget)
              ) : (
                <div className={cn("sticky z-20 -mx-2", isMobile ? "bottom-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]" : "bottom-2 mt-4")}>
                  {controls}
                </div>
              );
            }}
          </form.Subscribe>
        ) : null}
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/clf-export")({
  component: ClfExportPage,
  head: () => buildStaticPageHead("/clf-export"),
  staticData: {
    mainClassName: "overflow-hidden",
    titleKey: "items.clfExport",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
