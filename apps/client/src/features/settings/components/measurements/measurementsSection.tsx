import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MeasurementTerms } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { SETTINGS_SECTION_IDS } from "../../sections";
import type { SettingsUser } from "../identityBanner";
import { SETTINGS_DESCRIPTION_CLASS, SETTINGS_TWO_COLUMN_CLASS, SettingsSection, SettingsStack } from "../settingsPrimitives";
import { DevicesCard } from "./devicesCard";
import { MeasurementSummaryCard } from "./measurementSummaryCard";
import { MeasurementUploadsCard } from "./measurementUploadsCard";
import { TermsCard } from "./termsCard";
import { UploadLimitCard } from "./uploadLimitCard";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

export function MeasurementsSection({ user, terms }: { user: SettingsUser; terms: MeasurementTerms }) {
  const { t } = useTranslation("settings");
  const { data: settings } = useSettings();
  const isUploadingOff = settings?.features.measurementUploads === false;

  return (
    <SettingsSection id={SETTINGS_SECTION_IDS.measurements} title={t("sections.measurements")}>
      {isUploadingOff ? (
        <p className={cn("mb-4 flex items-center gap-2", SETTINGS_DESCRIPTION_CLASS)}>
          <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="size-3.5 shrink-0" />
          {t("measurements.uploadsOff")}
        </p>
      ) : null}
      <SettingsStack>
        <MeasurementSummaryCard userId={user.id} />
        <div className={SETTINGS_TWO_COLUMN_CLASS}>
          <DevicesCard userId={user.id} />
          <SettingsStack>
            <UploadLimitCard userId={user.id} />
            <TermsCard userId={user.id} terms={terms} canAccept={!isUploadingOff} />
          </SettingsStack>
        </div>
        <MeasurementUploadsCard userId={user.id} />
      </SettingsStack>
    </SettingsSection>
  );
}
