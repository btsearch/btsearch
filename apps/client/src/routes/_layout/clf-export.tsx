import { Add01Icon, AlertCircleIcon, ArrowDown01Icon, Copy01Icon, Download04Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type CLFDescriptionTemplatePlaceholder,
  type CLFDescriptionTemplateRat,
  type CLFDescriptionTemplates,
  CLF_DESCRIPTION_TEMPLATE_DEFAULTS,
  CLF_DESCRIPTION_TEMPLATE_LABELS,
  CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH,
  CLF_DESCRIPTION_TEMPLATE_PARAM_BY_RAT,
  CLF_DESCRIPTION_TEMPLATE_PLACEHOLDERS_BY_RAT,
  CLF_DESCRIPTION_TEMPLATE_RATS,
  DISPLAY_NR_SEPARATELY_PARAM,
  extractTemplatePlaceholders,
  normalizeCLFDescriptionTemplates,
  renderClfTemplatePreview,
} from "@openbts/shared/clfExportTemplates";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useNavActionTarget } from "@/contexts/navActions";
import { fetchBands, fetchOperators, fetchRegions } from "@/features/shared/api";
import { EXTENDED_RAT_OPTIONS } from "@/features/shared/rat";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useIsMobile } from "@/hooks/useMobile";
import { type CLFExportFormat, areCLFDescriptionTemplatesEqual, type clfExportFilters, usePreferences } from "@/hooks/usePreferences";
import { API_BASE } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { TOP4_MNCS, getOperatorColor } from "@/lib/operatorUtils";
import { buildStaticPageHead } from "@/lib/seo";
import { cn, toggleValue } from "@/lib/utils";

const FILE_EXTENSION_BY_FORMAT: Record<CLFExportFormat, string> = {
  "2.0": "clf",
  "2.1": "clf",
  "3.0-dec": "clf",
  "3.0-hex": "clf",
  "4.0": "clf",
  ntm: "ntm",
  netmonitor: "csv",
};

async function downloadExport(url: string, format: CLFExportFormat): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `cells_export_${format}.${FILE_EXTENSION_BY_FORMAT[format]}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
    return true;
  } catch {
    return false;
  }
}

const FORMAT_OPTIONS = [
  { value: "2.0", label: "CLF v2.0" },
  { value: "2.1", label: "CLF v2.1" },
  { value: "3.0-dec", label: "CLF v3.0 (dec)" },
  { value: "3.0-hex", label: "CLF v3.0 (hex)" },
  { value: "4.0", label: "CLF v4.0" },
  { value: "ntm", label: "NetMonster (.ntm)" },
  { value: "netmonitor", label: "Netmonitor (.csv)" },
] as const;

type FormValues = {
  operators: number[];
  regions: string[];
  rat: string[];
  bands: number[];
  format: CLFExportFormat;
  displayNRSeparately: boolean;
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
  const { t } = useTranslation(["clfExport", "common"]);

  if (isLoading)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Spinner className="size-3.5" aria-hidden="true" />
        {t("dataSources.loading", { source: label })}
      </p>
    );

  if (!isError) return null;

  return (
    <Alert variant="destructive" className="pr-20">
      <HugeiconsIcon icon={AlertCircleIcon} className="size-4" aria-hidden="true" />
      <AlertDescription>{t("dataSources.error", { source: label })}</AlertDescription>
      <AlertAction>
        <Button type="button" variant="ghost" size="xs" disabled={isFetching} onClick={onRetry}>
          {isFetching ? t("common:actions.loading") : t("common:actions.retry")}
        </Button>
      </AlertAction>
    </Alert>
  );
}

type ExportActionsProps = {
  compact?: boolean;
  copiedApiUrl: boolean;
  elapsed: number;
  finalDuration: number | null;
  isSubmitting: boolean;
  onCopyApiUrl?: () => void;
};

function ExportActions({ compact = false, copiedApiUrl, elapsed, finalDuration, isSubmitting, onCopyApiUrl }: ExportActionsProps) {
  const { t } = useTranslation(["clfExport", "common"]);

  if (compact)
    return (
      <div className="inline-flex rounded-full border bg-background p-1 shadow-sm">
        <Button type="submit" form="clf-export-form" disabled={isSubmitting} aria-busy={isSubmitting} className="shrink-0">
          {isSubmitting ? <Spinner aria-hidden="true" /> : <HugeiconsIcon icon={Download04Icon} aria-hidden="true" />}
          {isSubmitting ? t("form.exporting") : t("form.export")}
        </Button>
      </div>
    );

  return (
    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
      <Button type="submit" form="clf-export-form" disabled={isSubmitting} aria-busy={isSubmitting} size="lg" className="w-full">
        {isSubmitting ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : (
          <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" aria-hidden="true" />
        )}
        {isSubmitting ? t("form.exporting") : t("form.export")}
      </Button>
      {isSubmitting ? (
        <p className="text-center text-xs text-muted-foreground tabular-nums" role="status">
          {t("form.elapsed", { duration: formatDuration(elapsed) })}
        </p>
      ) : null}
      {!isSubmitting && finalDuration !== null ? (
        <p className="text-center text-xs text-muted-foreground tabular-nums">{t("form.completed", { duration: formatDuration(finalDuration) })}</p>
      ) : null}
      {onCopyApiUrl ? (
        <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={onCopyApiUrl}>
          <HugeiconsIcon icon={copiedApiUrl ? Tick02Icon : Copy01Icon} aria-hidden="true" />
          {copiedApiUrl ? t("common:actions.copied") : t("form.copyApiUrl")}
        </Button>
      ) : null}
    </div>
  );
}

function buildExportUrl(values: FormValues, templateDrafts: CLFDescriptionTemplates) {
  const params = new URLSearchParams();
  params.set("format", values.format);
  if (values.operators.length > 0) params.set("operators", values.operators.join(","));
  if (values.regions.length > 0) params.set("regions", values.regions.join(","));
  if (values.rat.length > 0) params.set("rat", values.rat.join(","));
  if (values.bands.length > 0) params.set("bands", values.bands.join(","));

  const templates = normalizeCLFDescriptionTemplates(templateDrafts);
  for (const rat of CLF_DESCRIPTION_TEMPLATE_RATS) {
    const template = templates[rat];
    if (template) params.set(CLF_DESCRIPTION_TEMPLATE_PARAM_BY_RAT[rat], template);
  }

  if (values.format === "ntm" && values.displayNRSeparately) params.set(DISPLAY_NR_SEPARATELY_PARAM, "true");

  return `${API_BASE}/cells/export?${params.toString()}`;
}

const INITIAL_VALUES: FormValues = {
  operators: [],
  regions: [],
  rat: [],
  bands: [],
  format: "4.0",
  displayNRSeparately: false,
};

function ClfExportPage() {
  const { t } = useTranslation("clfExport");
  const { preferences, updatePreferences, clfDescriptionTemplates, updateClfDescriptionTemplates } = usePreferences();
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const hasFloatingMobileActions = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const {
    data: operators = [],
    isError: isOperatorsError,
    isFetching: isOperatorsFetching,
    isLoading: isOperatorsLoading,
    refetch: refetchOperators,
  } = useQuery({
    queryKey: ["operators"],
    queryFn: fetchOperators,
    staleTime: 1000 * 60 * 30,
  });

  const {
    data: regions = [],
    isError: isRegionsError,
    isFetching: isRegionsFetching,
    isLoading: isRegionsLoading,
    refetch: refetchRegions,
  } = useQuery({
    queryKey: ["regions"],
    queryFn: fetchRegions,
    staleTime: 1000 * 60 * 30,
  });

  const {
    data: bands = [],
    isError: isBandsError,
    isFetching: isBandsFetching,
    isLoading: isBandsLoading,
    refetch: refetchBands,
  } = useQuery({
    queryKey: ["bands"],
    queryFn: fetchBands,
    staleTime: 1000 * 60 * 30,
  });

  const uniqueBandValues = useMemo(() => [...new Set(bands.map((b) => b.value))].sort((a, b) => a - b), [bands]);
  const sortedOperators = useMemo(() => operators.filter((op) => TOP4_MNCS.includes(op.mnc)), [operators]);
  const operatorByMnc = useMemo(() => new Map(sortedOperators.map((operator) => [operator.mnc, operator])), [sortedOperators]);

  const operatorChipsRef = useRef<HTMLDivElement>(null);
  const exportStartRef = useRef<number | null>(null);
  const exportIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copiedApiUrlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templateInputRefs = useRef<Partial<Record<CLFDescriptionTemplateRat, HTMLTextAreaElement | null>>>({});
  const [elapsed, setElapsed] = useState(0);
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
    defaultValues: { ...INITIAL_VALUES, ...preferences.clfExportFilters },
    onSubmit: async ({ value }) => {
      exportStartRef.current = Date.now();
      setElapsed(0);
      setFinalDuration(null);
      exportIntervalRef.current = setInterval(() => {
        if (exportStartRef.current) setElapsed(Date.now() - exportStartRef.current);
      }, 500);

      const url = buildExportUrl(value, templateDrafts);
      const success = await downloadExport(url, value.format);
      if (success) {
        toast.success(t("exportSuccess"));
      } else {
        toast.error(t("exportError"));
      }

      if (exportIntervalRef.current) clearInterval(exportIntervalRef.current);
      exportIntervalRef.current = null;
      if (exportStartRef.current) setFinalDuration(Date.now() - exportStartRef.current);
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
      ...INITIAL_VALUES,
      ...preferences.clfExportFilters,
      rat: form.state.values.rat,
    });
  }, [form, preferences.clfExportFilters]);

  function updateClfExportFilters(update: Partial<clfExportFilters>) {
    const next = { ...preferences.clfExportFilters, ...update };
    lastSentFiltersRef.current = next;
    updatePreferences({ clfExportFilters: next });
  }

  async function copyApiUrl() {
    try {
      await navigator.clipboard.writeText(buildExportUrl(form.state.values, templateDrafts));
      setCopiedApiUrl(true);
      toast.success(t("copySuccess"));
      if (copiedApiUrlTimerRef.current) clearTimeout(copiedApiUrlTimerRef.current);
      copiedApiUrlTimerRef.current = setTimeout(() => setCopiedApiUrl(false), 2000);
    } catch {
      setCopiedApiUrl(false);
      toast.error(t("copyError"));
    }
  }

  const operatorsUnavailable = isOperatorsLoading || (isOperatorsError && operators.length === 0);
  const regionsUnavailable = isRegionsLoading || (isRegionsError && regions.length === 0);
  const bandsUnavailable = isBandsLoading || (isBandsError && bands.length === 0);
  const editedTemplateCount = CLF_DESCRIPTION_TEMPLATE_RATS.filter((rat) => (templateDrafts[rat] ?? "").length > 0).length;
  let templateSaveLabel = t("templates.autoSave");
  if (templateSaveState === "saving") templateSaveLabel = t("templates.saving");
  else if (templateSaveState === "saved") templateSaveLabel = t("templates.saved");

  return (
    <main className="flex-1 overflow-y-auto p-4 pb-24 md:pb-6">
      <div className="max-w-4xl space-y-6 lg:max-w-[100rem]">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("page.title")}</h1>
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
                  <Label htmlFor="clf-operators" className="text-sm font-semibold">
                    {t("common:labels.operator")}
                  </Label>
                  <form.Field name="operators">
                    {(field) => (
                      <Combobox
                        multiple
                        disabled={operatorsUnavailable}
                        value={field.state.value.map((mnc) => operatorByMnc.get(mnc)).filter((operator) => operator !== undefined)}
                        onValueChange={(values) => {
                          const operators = values.map((value) => value.mnc);
                          field.handleChange(operators);
                          updateClfExportFilters({ operators });
                        }}
                        items={sortedOperators}
                      >
                        <ComboboxChips
                          ref={operatorChipsRef}
                          className={cn("min-h-10 max-h-24 overflow-y-auto text-base md:text-sm", operatorsUnavailable && "opacity-60")}
                        >
                          {field.state.value.map((mnc) => {
                            const operator = operatorByMnc.get(mnc);
                            return operator ? (
                              <ComboboxChip key={mnc} className="h-8 rounded-md px-2 text-base font-normal md:text-sm">
                                <span
                                  className="size-2 shrink-0 rounded-[2px]"
                                  style={{ backgroundColor: getOperatorColor(mnc) }}
                                  aria-hidden="true"
                                />
                                {operator.name}
                              </ComboboxChip>
                            ) : null;
                          })}
                          <ComboboxChipsInput
                            id="clf-operators"
                            aria-describedby="clf-operators-hint"
                            disabled={operatorsUnavailable}
                            className="h-8 text-base md:text-sm"
                            placeholder={field.state.value.length === 0 ? t("common:placeholder.selectOperators") : ""}
                          />
                        </ComboboxChips>
                        <ComboboxContent anchor={operatorChipsRef}>
                          <ComboboxList>
                            <ComboboxEmpty>{t("common:placeholder.noOperatorsFound")}</ComboboxEmpty>
                            {sortedOperators.map((operator) => (
                              <ComboboxItem key={operator.mnc} value={operator}>
                                <span
                                  className="size-2.5 shrink-0 rounded-[2px]"
                                  style={{ backgroundColor: getOperatorColor(operator.mnc) }}
                                  aria-hidden="true"
                                />
                                <span>{operator.name}</span>
                                <span className="ml-auto text-xs text-muted-foreground">{operator.mnc}</span>
                              </ComboboxItem>
                            ))}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    )}
                  </form.Field>
                  <p id="clf-operators-hint" className="text-xs text-muted-foreground">
                    {t("form.operatorsHint")}
                  </p>
                  <DataSourceNotice
                    isError={isOperatorsError}
                    isFetching={isOperatorsFetching}
                    isLoading={isOperatorsLoading}
                    label={t("dataSources.operators")}
                    onRetry={() => void refetchOperators()}
                  />
                </div>

                <Separator />

                <fieldset className="space-y-2" disabled={regionsUnavailable}>
                  <legend className="text-sm font-semibold">{t("common:labels.region")}</legend>
                  <form.Field name="regions">
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
                  isError={isRegionsError}
                  isFetching={isRegionsFetching}
                  isLoading={isRegionsLoading}
                  label={t("dataSources.regions")}
                  onRetry={() => void refetchRegions()}
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
                            <span className="text-[10px] text-muted-foreground font-mono">{rat.gen}</span>
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
                  <form.Field name="bands">
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
                  isError={isBandsError}
                  isFetching={isBandsFetching}
                  isLoading={isBandsLoading}
                  label={t("dataSources.bands")}
                  onRetry={() => void refetchBands()}
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
                  <Button type="button" variant="ghost" className="px-0 text-muted-foreground" onClick={() => void copyApiUrl()}>
                    <HugeiconsIcon icon={copiedApiUrl ? Tick02Icon : Copy01Icon} aria-hidden="true" />
                    {copiedApiUrl ? t("common:actions.copied") : t("form.copyApiUrl")}
                  </Button>
                </div>
              </section>
            </form>
          </div>

          <div className="space-y-4">
            {isDesktop ? (
              <div className="sticky top-4">
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <ExportActions
                      copiedApiUrl={copiedApiUrl}
                      elapsed={elapsed}
                      finalDuration={finalDuration}
                      isSubmitting={isSubmitting}
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
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => {
              const controls = (
                <ExportActions compact copiedApiUrl={copiedApiUrl} elapsed={elapsed} finalDuration={finalDuration} isSubmitting={isSubmitting} />
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
