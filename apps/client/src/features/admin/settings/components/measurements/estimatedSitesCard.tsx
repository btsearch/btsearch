import { ArrowRight01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SettingsMeasurements } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { useMeasurementForm } from "../../hooks/useMeasurementForm";
import type { MeasurementField } from "../../utils/measurementSettings";
import { MeasurementFormCard } from "./measurementFormCard";
import { MeasurementNumberField } from "./measurementNumberField";
import { buttonVariants } from "@/components/ui/button";

const SITE_FIELDS = ["publicRadiusMaxMeters"] as const satisfies readonly MeasurementField[];

function PublishedVersion({ version }: { version: number }) {
  const { t } = useTranslation("admin");
  const labelId = useId();

  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 flex-col gap-2">
      <p id={labelId} className="text-sm leading-snug font-medium">
        {t("settings.measurements.sites.published.label")}
      </p>
      <div className="flex h-8 items-center justify-between gap-2">
        <span className="font-semibold tabular-nums">{t("settings.measurements.sites.published.value", { version })}</span>
        <Link to="/admin/measurements/evaluation" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("measurements.tabs.evaluation")}
          <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" aria-hidden="true" />
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">{t("settings.measurements.sites.published.hint")}</p>
    </div>
  );
}

export function EstimatedSitesCard({ measurements }: { measurements: SettingsMeasurements }) {
  const { t } = useTranslation("admin");
  const form = useMeasurementForm(measurements, SITE_FIELDS);

  return (
    <MeasurementFormCard
      icon={Location01Icon}
      title={t("settings.measurements.sites.title")}
      description={t("settings.measurements.sites.description")}
      isDirty={form.draft.isDirty}
      isSaving={form.isSaving}
      canSave={form.canSave}
      onRevert={form.revert}
      onSubmit={form.saveDraft}
    >
      <MeasurementNumberField
        field="publicRadiusMaxMeters"
        label={t("settings.measurements.sites.radius.label")}
        unit={t("settings.measurements.sites.radius.unit")}
        hint={t("settings.measurements.sites.radius.hint")}
        text={form.readText("publicRadiusMaxMeters")}
        onTextChange={(text) => form.editField("publicRadiusMaxMeters", text)}
      />
      <PublishedVersion version={measurements.publishedAlgorithmVersion} />
    </MeasurementFormCard>
  );
}
