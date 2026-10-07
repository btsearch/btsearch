import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { countryQueryOptions, updateCountry } from "../../api/countries";
import { invalidateCountries } from "../../api/queryKeys";
import type { CountryFeatures } from "../../types";
import { showReferenceError } from "../../utils/errors";

type FeatureChange = { feature: keyof CountryFeatures; isEnabled: boolean };

export function useCountryFeatures(countryCode: string) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const countryKey = countryQueryOptions(countryCode).queryKey;

  return useMutation({
    mutationFn: ({ feature, isEnabled }: FeatureChange) => updateCountry(countryCode, { features: { [feature]: isEnabled } }),
    onMutate: async ({ feature, isEnabled }) => {
      await queryClient.cancelQueries({ queryKey: countryKey });
      const previousFeatures = queryClient.getQueryData(countryKey)?.features;
      queryClient.setQueryData(countryKey, (country) =>
        country ? { ...country, features: { ...country.features, [feature]: isEnabled } } : country,
      );
      return { previousFeatures };
    },
    onError: (error, _change, context) => {
      const previousFeatures = context?.previousFeatures;
      if (previousFeatures) queryClient.setQueryData(countryKey, (country) => (country ? { ...country, features: previousFeatures } : country));
      showReferenceError(error, "admin:reference.country.general.features.saveFailed");
    },
    onSuccess: ({ features }) => {
      queryClient.setQueryData(countryKey, (country) => (country ? { ...country, features } : country));
      toast.success(t("reference.country.general.features.savedToast"));
    },
    onSettled: () => {
      void invalidateCountries(queryClient);
    },
  });
}
