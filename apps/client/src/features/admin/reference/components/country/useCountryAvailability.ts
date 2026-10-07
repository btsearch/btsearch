import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { countryQueryOptions, updateCountry } from "../../api/countries";
import { invalidateCountries } from "../../api/queryKeys";
import type { ContributionMode, Country } from "../../types";
import { showReferenceError } from "../../utils/errors";

type AvailabilityChange = { isVisible: boolean } | { contributions: ContributionMode };

function applyAvailabilityChange(country: Country, change: AvailabilityChange): Country {
  if ("isVisible" in change) return { ...country, isVisible: change.isVisible };
  return { ...country, contributions: change.contributions };
}

function copyAvailability(country: Country, source: Country): Country {
  return { ...country, isVisible: source.isVisible, contributions: source.contributions };
}

function getAvailabilityToast(t: TFunction, change: AvailabilityChange): string {
  if ("isVisible" in change) {
    return change.isVisible
      ? t("admin:reference.country.general.availability.shownToast")
      : t("admin:reference.country.general.availability.hiddenToast");
  }
  return change.contributions === "open"
    ? t("admin:reference.country.general.availability.openedToast")
    : t("admin:reference.country.general.availability.closedToast");
}

export function useCountryAvailability(countryCode: string) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (change: AvailabilityChange) => updateCountry(countryCode, change),
    onMutate: async (change) => {
      const countryKey = countryQueryOptions(countryCode).queryKey;
      await queryClient.cancelQueries({ queryKey: countryKey });
      const previousCountry = queryClient.getQueryData(countryKey);
      queryClient.setQueryData(countryKey, (country) => (country ? applyAvailabilityChange(country, change) : country));
      return { previousCountry };
    },
    onError: (error, _change, context) => {
      const previousCountry = context?.previousCountry;
      if (previousCountry) {
        queryClient.setQueryData(countryQueryOptions(countryCode).queryKey, (country) =>
          country ? copyAvailability(country, previousCountry) : country,
        );
      }
      showReferenceError(error, "admin:reference.country.general.availability.saveFailed");
    },
    onSuccess: (updatedCountry, change) => {
      queryClient.setQueryData(countryQueryOptions(countryCode).queryKey, (country) =>
        country ? copyAvailability(country, updatedCountry) : country,
      );
      toast.success(getAvailabilityToast(t, change));
    },
    onSettled: () => {
      void invalidateCountries(queryClient);
    },
  });
}
