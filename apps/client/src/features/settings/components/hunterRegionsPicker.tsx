import { Cancel01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Region } from "@openbts/shared/contract";
import { HUNTER_REGIONS_MAX } from "@openbts/shared/contract/constants";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Combobox, ComboboxChips, ComboboxChipsInput, ComboboxContent } from "@/components/ui/combobox";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { RegionOptionList, groupRegionsByCountry } from "@/features/shared/filterPanel";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type HunterRegionsPickerProps = {
  regions: Region[];
  selectedRegionIds: number[];
  onChange: (regionIds: number[]) => void;
  invalid: boolean;
};

export function HunterRegionsPicker({ regions, selectedRegionIds, onChange, invalid }: HunterRegionsPickerProps) {
  const { t, i18n } = useTranslation("settings");
  const fieldRef = useRef<HTMLDivElement>(null);
  const regionGroups = useMemo(() => groupRegionsByCountry(regions), [regions]);
  const selectedRegions = useMemo(() => regions.filter((region) => selectedRegionIds.includes(region.id)), [regions, selectedRegionIds]);
  const showsCountries = regionGroups.length > 1;

  return (
    <div className="flex flex-col gap-2.5">
      <Combobox
        multiple
        value={selectedRegions}
        onValueChange={(values) => onChange(values.map((region) => region.id))}
        items={showsCountries ? regionGroups : regions}
        itemToStringLabel={(region: Region) => region.name}
      >
        <ComboboxChips ref={fieldRef} className="h-8 min-h-8 flex-nowrap text-sm">
          <HugeiconsIcon icon={Location01Icon} className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
          <ComboboxChipsInput
            aria-label={t("profile.hunters.regionsLabel")}
            aria-invalid={invalid || undefined}
            placeholder={t("profile.hunters.regionsPlaceholder")}
            className="min-w-0"
          />
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              selectedRegionIds.length > HUNTER_REGIONS_MAX ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {t("profile.hunters.regionsCount", { count: selectedRegionIds.length, max: HUNTER_REGIONS_MAX })}
          </span>
        </ComboboxChips>
        <ComboboxContent anchor={fieldRef}>
          <RegionOptionList groups={regionGroups} />
        </ComboboxContent>
      </Combobox>
      {selectedRegions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {groupRegionsByCountry(selectedRegions).map((group) => (
            <div key={group.value} className="flex flex-wrap items-center gap-1">
              {showsCountries ? (
                <CountryCodeTile code={group.value} size="xs" label={getCountryName(group.value, i18n.language)} className="mr-0.5" />
              ) : null}
              {group.items.map((region) => (
                <span
                  key={region.id}
                  className="flex h-[calc(--spacing(5.25))] w-fit items-center gap-1 rounded-sm bg-muted pl-1.5 text-xs font-medium whitespace-nowrap text-foreground"
                >
                  {region.name}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("profile.hunters.removeRegion", { name: region.name })}
                    onClick={() => onChange(selectedRegionIds.filter((regionId) => regionId !== region.id))}
                    className="-ml-1 opacity-50 hover:opacity-100"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                  </Button>
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
