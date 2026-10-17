import { useTranslation } from "react-i18next";

import { useOfficialSourcesOnScreen } from "@/features/official/queries";
import { findSiteSourceName } from "@/features/official/sources";

export function useOfficialLabel(countryCodes: readonly string[]): string {
  const { t } = useTranslation("common");
  const sourcesOnScreen = useOfficialSourcesOnScreen(countryCodes);
  return findSiteSourceName(sourcesOnScreen) ?? t("labels.register");
}
