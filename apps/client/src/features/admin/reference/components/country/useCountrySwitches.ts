import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { countryQueryOptions, updateCountry } from "../../api/countries";
import { invalidateCountries } from "../../api/queryKeys";
import type { Country, CountryFeatures, CountryTool } from "../../types";
import { showReferenceError } from "../../utils/errors";

type SwitchChange = { features: Partial<CountryFeatures> } | { tools: CountryTool[] };

function applySwitchChange(country: Country, change: SwitchChange): Country {
  if ("tools" in change) return { ...country, tools: change.tools };
  return { ...country, features: { ...country.features, ...change.features } };
}

function copySwitches(country: Country, source: Country, change: SwitchChange): Country {
  if ("tools" in change) return { ...country, tools: source.tools };
  return { ...country, features: source.features };
}

export function useCountrySwitches(countryCode: string) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const countryKey = countryQueryOptions(countryCode).queryKey;

  return useMutation({
    mutationFn: (change: SwitchChange) => updateCountry(countryCode, change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: countryKey });
      const previousCountry = queryClient.getQueryData(countryKey);
      queryClient.setQueryData(countryKey, (country) => (country ? applySwitchChange(country, change) : country));
      return { previousCountry };
    },
    onError: (error, change, context) => {
      const previousCountry = context?.previousCountry;
      if (previousCountry) queryClient.setQueryData(countryKey, (country) => (country ? copySwitches(country, previousCountry, change) : country));
      showReferenceError(
        error,
        "tools" in change ? "admin:reference.country.general.tools.saveFailed" : "admin:reference.country.general.features.saveFailed",
      );
    },
    onSuccess: (updatedCountry, change) => {
      queryClient.setQueryData(countryKey, (country) => (country ? copySwitches(country, updatedCountry, change) : country));
      toast.success("tools" in change ? t("reference.country.general.tools.savedToast") : t("reference.country.general.features.savedToast"));
    },
    onSettled: () => {
      void invalidateCountries(queryClient);
    },
  });
}
