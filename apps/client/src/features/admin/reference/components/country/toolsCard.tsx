import { FileSearchIcon, LockIcon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { COUNTRY_TOOLS } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import type { Country, CountryTool } from "../../types";
import { ReferenceCard, ReferenceCardHeader, ReferenceCardNote } from "../shared/referenceCards";
import { CountrySwitchRow } from "./countrySwitchRow";
import { useCountrySwitches } from "./useCountrySwitches";

const TOOL_ICONS: Record<CountryTool, IconSvgElement> = { analyzer: FileSearchIcon, measurements: SmartPhone01Icon };

function withTool(tools: readonly CountryTool[], tool: CountryTool, isEnabled: boolean): CountryTool[] {
  return COUNTRY_TOOLS.filter((candidate) => (candidate === tool ? isEnabled : tools.includes(candidate)));
}

export function ToolsCard({ country, canEdit }: { country: Country; canEdit: boolean }) {
  const { t } = useTranslation("admin");
  const switches = useCountrySwitches(country.code);

  return (
    <ReferenceCard>
      <ReferenceCardHeader title={t("reference.country.general.tools.title")} description={t("reference.country.general.tools.description")} />
      <div className="border-t">
        {COUNTRY_TOOLS.map((tool) => (
          <CountrySwitchRow
            key={tool}
            icon={TOOL_ICONS[tool]}
            title={t(`reference.country.general.tools.${tool}.title`)}
            description={t(`reference.country.general.tools.${tool}.description`)}
            isEnabled={country.tools.includes(tool)}
            disabled={!canEdit || switches.isPending}
            onEnabledChange={(isEnabled) => switches.mutate({ tools: withTool(country.tools, tool, isEnabled) })}
          />
        ))}
      </div>
      <ReferenceCardNote icon={canEdit ? undefined : LockIcon} className="mt-auto">
        {t(canEdit ? "reference.country.general.tools.note" : "reference.country.general.readOnlyNote")}
      </ReferenceCardNote>
    </ReferenceCard>
  );
}
