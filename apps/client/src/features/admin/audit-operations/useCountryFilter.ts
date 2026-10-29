import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { type CountryOption, listCountryOptions } from "@/features/admin/users/utils/grants";
import { countriesQueryOptions } from "@/features/shared/lookups";

export type CountryFilter = {
  options: CountryOption[];
  selected: string[];
  isLoading: boolean;
  hasFailed: boolean;
  isRetrying: boolean;
  retry: () => unknown;
};

const NO_OPTIONS: CountryOption[] = [];

export function useCountryFilter(requestedCodes: string[]): CountryFilter {
  const { i18n } = useTranslation();
  const { data: countries, isPending, isError, isFetching, refetch } = useQuery(countriesQueryOptions());

  return {
    options: countries === undefined ? NO_OPTIONS : listCountryOptions(countries, i18n.language),
    selected: countries === undefined ? requestedCodes : requestedCodes.filter((code) => countries.some((country) => country.code === code)),
    isLoading: isPending,
    hasFailed: isError && countries === undefined,
    isRetrying: isFetching,
    retry: refetch,
  };
}
