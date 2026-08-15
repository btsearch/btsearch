import { Add01Icon, Copy01Icon, Download04Icon, Tick02Icon } from "@hugeicons/core-free-icons";
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
  normalizeCLFDescriptionTemplates,
  renderClfTemplatePreview,
} from "@openbts/shared/clfExportTemplates";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { fetchBands, fetchOperators, fetchRegions } from "@/features/shared/api";
import { EXTENDED_RAT_OPTIONS } from "@/features/shared/rat";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { type CLFExportFormat, type clfExportFilters, usePreferences } from "@/hooks/usePreferences";
import { API_BASE } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { TOP4_MNCS, getOperatorColor } from "@/lib/operatorUtils";
import { cn, toggleValue } from "@/lib/utils";
import type { Operator } from "@/types/station";

async function downloadExport(url: string, format: string): Promise<boolean> {
  const fileExtension = format === "ntm" ? "ntm" : format === "netmonitor" ? "csv" : "clf";
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `cells_export_${format}.${fileExtension}`;
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

  const { data: operators = [] } = useQuery({
    queryKey: ["operators"],
    queryFn: fetchOperators,
    staleTime: 1000 * 60 * 30,
  });

  const { data: regions = [] } = useQuery({
    queryKey: ["regions"],
    queryFn: fetchRegions,
    staleTime: 1000 * 60 * 30,
  });

  const { data: bands = [] } = useQuery({
    queryKey: ["bands"],
    queryFn: fetchBands,
    staleTime: 1000 * 60 * 30,
  });

  const uniqueBandValues = useMemo(() => [...new Set(bands.map((b) => b.value))].sort((a, b) => a - b), [bands]);
  const sortedOperators = useMemo(() => operators.filter((op) => TOP4_MNCS.includes(op.mnc)), [operators]);

  const operatorChipsRef = useRef<HTMLDivElement>(null);
  const exportStartRef = useRef<number | null>(null);
  const exportIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const templateInputRefs = useRef<Partial<Record<CLFDescriptionTemplateRat, HTMLTextAreaElement | null>>>({});
  const [elapsed, setElapsed] = useState(0);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);
  const [templateDrafts, setTemplateDrafts] = useState<CLFDescriptionTemplates>(() => clfDescriptionTemplates);
  const [copiedApiUrl, setCopiedApiUrl] = useState(false);
  const lastSentTemplatesRef = useRef<CLFDescriptionTemplates | null>(null);

  const debouncedSaveTemplates = useDebouncedCallback((next: CLFDescriptionTemplates) => {
    lastSentTemplatesRef.current = next;
    updateClfDescriptionTemplates(next);
  }, 300);

  useEffect(() => {
    const lastSent = lastSentTemplatesRef.current;
    if (lastSent !== null && JSON.stringify(lastSent) === JSON.stringify(clfDescriptionTemplates)) return;
    setTemplateDrafts(clfDescriptionTemplates);
  }, [clfDescriptionTemplates]);

  useEffect(() => {
    return () => {
      if (exportIntervalRef.current) clearInterval(exportIntervalRef.current);
    };
  }, []);

  function updateTemplateDraft(rat: CLFDescriptionTemplateRat, value: string) {
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
    form.reset({
      ...INITIAL_VALUES,
      ...preferences.clfExportFilters,
      rat: form.state.values.rat,
    });
  }, [form, preferences.clfExportFilters]);

  function updateClfExportFilters(update: Partial<clfExportFilters>) {
    updatePreferences({ clfExportFilters: { ...preferences.clfExportFilters, ...update } });
  }

  function copyApiUrl() {
    void navigator.clipboard.writeText(buildExportUrl(form.state.values, templateDrafts));
    setCopiedApiUrl(true);
    setTimeout(() => setCopiedApiUrl(false), 2000);
  }

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="max-w-4xl lg:max-w-[100rem] space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("page.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("page.description")}</p>
        </div>

        <div className="space-y-6 lg:grid lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-8 lg:space-y-0">
          <div className="space-y-6">
            <div className="border rounded-xl p-4 bg-muted/20 space-y-2">
              <h3 className="font-medium text-sm">{t("info.appsTitle")}</h3>
              <div className="text-sm">
                <h4 className="font-medium text-muted-foreground">Android</h4>
                <ul className="list-disc list-inside text-muted-foreground">
                  <li>Netmonitor (CLF v2.0, v2.1, v3.0, .csv)</li>
                  <li>G-MoN (CLF v4.0)</li>
                  <li>NetMonster (.ntm)</li>
                </ul>
              </div>
              <p className="text-sm font-small text-muted-foreground">{t("info.iosNote")}</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
              }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("common:labels.operator")}</Label>
                <form.Field name="operators">
                  {(field) => (
                    <Combobox
                      multiple
                      value={field.state.value.map((mnc) => sortedOperators.find((op) => op.mnc === mnc)).filter(Boolean) as Operator[]}
                      onValueChange={(values) => {
                        const operators = values.map((value) => value.mnc);
                        field.handleChange(operators);
                        updateClfExportFilters({ operators });
                      }}
                      items={sortedOperators}
                    >
                      <ComboboxChips ref={operatorChipsRef} className="min-h-10 max-h-24 overflow-y-auto text-base md:text-sm">
                        {field.state.value.map((mnc) => {
                          const operator = sortedOperators.find((op) => op.mnc === mnc);
                          return operator ? (
                            <ComboboxChip key={mnc}>
                              <div className="size-2 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(mnc) }} />
                              {operator.name}
                            </ComboboxChip>
                          ) : null;
                        })}
                        <ComboboxChipsInput
                          className="text-base md:text-sm"
                          placeholder={field.state.value.length === 0 ? t("common:placeholder.selectOperators") : ""}
                        />
                      </ComboboxChips>
                      <ComboboxContent anchor={operatorChipsRef}>
                        <ComboboxList>
                          <ComboboxEmpty>{t("common:placeholder.noOperatorsFound")}</ComboboxEmpty>
                          {sortedOperators.map((operator) => (
                            <ComboboxItem key={operator.mnc} value={operator}>
                              <div className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                              <span>{operator.name}</span>
                              <span className="text-muted-foreground text-xs ml-auto">{operator.mnc}</span>
                            </ComboboxItem>
                          ))}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  )}
                </form.Field>
                <p className="text-xs text-muted-foreground">{t("form.operatorsHint")}</p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("common:labels.region")}</Label>
                <form.Field name="regions">
                  {(field) => (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {regions.map((region) => (
                        <label
                          htmlFor={`region-${region.code}`}
                          key={region.code}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-sm",
                            field.state.value.includes(region.code) ? "bg-primary/10" : "hover:bg-muted",
                          )}
                        >
                          <Checkbox
                            id={`region-${region.code}`}
                            checked={field.state.value.includes(region.code)}
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
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("common:labels.standard")}</Label>
                <p className="text-xs text-muted-foreground">{t("form.standardHint")}</p>
                <form.Field name="rat">
                  {(field) => (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {EXTENDED_RAT_OPTIONS.map((rat) => (
                        <label
                          htmlFor={`rat-${rat.value}`}
                          key={rat.value}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-sm",
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
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("common:labels.band")} (MHz)</Label>
                <p className="text-xs text-muted-foreground">{t("form.bandsHint")}</p>
                <form.Field name="bands">
                  {(field) => (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {uniqueBandValues.map((band) => (
                        <label
                          htmlFor={`band-${band}`}
                          key={band}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-sm",
                            field.state.value.includes(band) ? "bg-primary/10" : "hover:bg-muted",
                          )}
                        >
                          <Checkbox
                            id={`band-${band}`}
                            checked={field.state.value.includes(band)}
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
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("form.outputFormat")}</Label>
                <form.Field name="format">
                  {(field) => (
                    <RadioGroup
                      value={field.state.value}
                      onValueChange={(value) => {
                        const format = value as CLFExportFormat;
                        field.handleChange(format);
                        updateClfExportFilters({ format });
                      }}
                      className="flex flex-wrap gap-x-4 gap-y-1"
                    >
                      {FORMAT_OPTIONS.map((format) => (
                        <label
                          htmlFor={`format-${format.value}`}
                          key={format.value}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-sm",
                            field.state.value === format.value ? "bg-primary/10" : "hover:bg-muted",
                          )}
                        >
                          <RadioGroupItem id={`format-${format.value}`} value={format.value} />
                          <span>{format.label}</span>
                        </label>
                      ))}
                    </RadioGroup>
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
              </div>

              <Separator />

              <div className="text-sm text-muted-foreground">
                {t("form.formatInfo")}{" "}
                <a
                  href="http://www.afischer-online.de/sos/celltrack/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  2.x, 3.x
                </a>
                {", "}
                <a href="https://sites.google.com/site/clfgmon/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  4.0
                </a>
                {", "}
                <a
                  href="https://netmonster.app/#docs-user-about-ntm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  NetMonster
                </a>{" "}
                {t("common:and")}{" "}
                <a
                  href="https://netmonitor.ing/docs/cell-database-default/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Netmonitor
                </a>
              </div>

              <form.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting })}>
                {({ isSubmitting }) => (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={isSubmitting} size="lg" className="flex-1 md:flex-none">
                      {isSubmitting ? (
                        <>
                          <Spinner data-icon="inline-start" />
                          {t("form.exporting")}
                        </>
                      ) : (
                        <>
                          <HugeiconsIcon icon={Download04Icon} className="size-4" data-icon="inline-start" />
                          {t("form.export")}
                        </>
                      )}
                    </Button>
                    {isSubmitting ? <span className="opacity-70 text-sm tabular-nums shrink-0">{formatDuration(elapsed)}</span> : null}
                    {finalDuration !== null && !isSubmitting ? (
                      <span className="text-sm text-muted-foreground tabular-nums shrink-0">{formatDuration(finalDuration)}</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={copyApiUrl}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <HugeiconsIcon icon={copiedApiUrl ? Tick02Icon : Copy01Icon} className="size-3.5" />
                      {copiedApiUrl ? t("common:actions.copied") : t("form.copyApiUrl")}
                    </button>
                  </div>
                )}
              </form.Subscribe>
            </form>
          </div>

          <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("templates.title")}</h2>
              <p className="text-xs text-muted-foreground">{t("templates.description")}</p>
            </div>

            <div className="space-y-4">
              {CLF_DESCRIPTION_TEMPLATE_RATS.map((rat) => (
                <div key={rat} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`template-${rat}`} className="font-mono text-xs font-semibold text-foreground">
                      {CLF_DESCRIPTION_TEMPLATE_LABELS[rat]}
                    </Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t("templates.insertPlaceholder")} />}>
                        <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
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
                    className="min-h-14 resize-none font-mono text-xs leading-relaxed placeholder:text-muted-foreground"
                  />
                  <output
                    className="block font-mono text-[11px] leading-relaxed whitespace-pre-wrap wrap-break-word text-muted-foreground"
                    aria-label={`${CLF_DESCRIPTION_TEMPLATE_LABELS[rat]} ${t("templates.preview")}`}
                  >
                    {renderClfTemplatePreview(rat, templateDrafts[rat] ?? "")}
                  </output>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/clf-export")({
  component: ClfExportPage,
  staticData: {
    mainClassName: "overflow-hidden",
    titleKey: "items.clfExport",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
