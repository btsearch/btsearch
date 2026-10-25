import type { MeasurementDeviceTimingAdvance } from "@openbts/shared/contract";
import { TIMING_ADVANCE_RATS, TIMING_ADVANCE_STEP_METERS, type TimingAdvanceRat } from "@openbts/shared/contract/constants";
import { useTranslation } from "react-i18next";

import { SETTINGS_DESCRIPTION_CLASS, StatusBadge } from "../settingsPrimitives";
import { cn } from "@/lib/utils";

const TIMING_ADVANCE_RAT_LABELS: Record<TimingAdvanceRat, string> = { gsm: "GSM", lte: "LTE", nr: "5G NR" };

const EXAMPLE_STEPS: Record<TimingAdvanceRat, number> = { gsm: 2, lte: 10, nr: 50 };

type CalibrationLine = { rat: TimingAdvanceRat; fit: MeasurementDeviceTimingAdvance | null };

function listCalibrationLines(timingAdvance: readonly MeasurementDeviceTimingAdvance[]): CalibrationLine[] {
  return TIMING_ADVANCE_RATS.flatMap((rat): CalibrationLine[] => {
    const fits = timingAdvance.filter((fit) => fit.rat === rat);
    return fits.length === 0 ? [{ rat, fit: null }] : fits.map((fit) => ({ rat, fit }));
  });
}

function readOffsetKind(offsetMeters: number): "" | "Subtract" | "Add" {
  if (Math.round(Math.abs(offsetMeters)) === 0) return "";
  return offsetMeters < 0 ? "Subtract" : "Add";
}

function CalibrationLineItem({ rat, fit }: CalibrationLine) {
  const { t, i18n } = useTranslation("settings");
  const stepFormat = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const meterFormat = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const standardStep = TIMING_ADVANCE_STEP_METERS[rat];

  if (fit === null) {
    return (
      <li className="border-t py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[0.8125rem] leading-[1.125rem] font-semibold">{TIMING_ADVANCE_RAT_LABELS[rat]}</p>
          <StatusBadge tone="muted">{t("measurements.devices.calibration.none")}</StatusBadge>
        </div>
        <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>
          {rat === "nr"
            ? t("measurements.devices.calibration.androidNr")
            : t("measurements.devices.calibration.standardStep", { step: stepFormat.format(standardStep) })}
        </p>
      </li>
    );
  }

  const hasStandardStep = rat !== "nr" || fit.source !== "api";
  const stepKind = hasStandardStep ? "step" : "ownStep";
  const exampleSteps = EXAMPLE_STEPS[rat];
  const values = {
    step: stepFormat.format(fit.metersPerStep),
    standard: stepFormat.format(standardStep),
    offset: meterFormat.format(Math.round(Math.abs(fit.offsetMeters))),
  };
  const example = {
    count: exampleSteps,
    distance: meterFormat.format(Math.round(exampleSteps * fit.metersPerStep + fit.offsetMeters)),
    standard: meterFormat.format(Math.round(exampleSteps * standardStep)),
  };

  return (
    <li className="border-t py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-[0.8125rem] leading-[1.125rem] font-semibold">{TIMING_ADVANCE_RAT_LABELS[rat]}</p>
        <StatusBadge tone="success">{t("measurements.devices.calibration.calibrated")}</StatusBadge>
        <span className="text-xs leading-4 text-muted-foreground">{t(`measurements.devices.calibration.sources.${fit.source}`)}</span>
      </div>
      <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>
        {t(`measurements.devices.calibration.${stepKind}${readOffsetKind(fit.offsetMeters)}`, values)}
      </p>
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground tabular-nums">
        {t(hasStandardStep ? "measurements.devices.calibration.example" : "measurements.devices.calibration.ownExample", example)}
      </p>
    </li>
  );
}

export function DeviceCalibrationSummary({ timingAdvance }: { timingAdvance: readonly MeasurementDeviceTimingAdvance[] }) {
  const { t } = useTranslation("settings");
  const calibratedRats = TIMING_ADVANCE_RATS.filter((rat) => timingAdvance.some((fit) => fit.rat === rat));

  if (calibratedRats.length === 0) return t("measurements.devices.calibration.none");
  return t("measurements.devices.calibration.summary", { rats: calibratedRats.map((rat) => TIMING_ADVANCE_RAT_LABELS[rat]).join(", ") });
}

export function DeviceCalibration({ timingAdvance }: { timingAdvance: readonly MeasurementDeviceTimingAdvance[] }) {
  const { t } = useTranslation("settings");
  const lines = listCalibrationLines(timingAdvance);

  return (
    <>
      <p className="text-[0.8125rem] leading-[1.125rem] font-medium">{t("measurements.devices.calibration.title")}</p>
      <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("measurements.devices.calibration.description")}</p>
      <ul className="mt-2.5">
        {lines.map((line) => (
          <CalibrationLineItem key={`${line.rat}-${line.fit?.source ?? "none"}`} rat={line.rat} fit={line.fit} />
        ))}
      </ul>
      {lines.some((line) => line.fit === null) ? (
        <p className="border-t pt-2.5 text-xs leading-4 text-muted-foreground">{t("measurements.devices.calibration.pending")}</p>
      ) : null}
    </>
  );
}
