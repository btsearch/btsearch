import type { MeasurementContributor } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { BlockCard } from "./blockCard";
import { PERSON_SECTION_IDS } from "./personSections";
import { VouchCard } from "./vouchCard";
import { WeightCard } from "./weightCard";
import { USER_DETAIL_TWO_COLUMN_CLASS } from "@/features/admin/users/components/detail/userDetailPrimitives";
import { SettingsSection } from "@/features/settings/components/settingsPrimitives";

export function TrustSection({ contributor }: { contributor: MeasurementContributor }) {
  const { t } = useTranslation("admin");

  return (
    <SettingsSection id={PERSON_SECTION_IDS.trust} title={t("measurements.person.trust")}>
      <div className={USER_DETAIL_TWO_COLUMN_CLASS}>
        <WeightCard contributor={contributor} />
        <div className="flex min-w-0 flex-col gap-4">
          <VouchCard contributor={contributor} />
          <BlockCard contributor={contributor} />
        </div>
      </div>
    </SettingsSection>
  );
}
