import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiResponseError, BackendUnavailableError, QuotaExceededError, RateLimitError, TwoFactorRequiredError } from "./api";

function onRateLimitError(error: Error): void {
  if (error instanceof RateLimitError || error instanceof QuotaExceededError) toast.error(error.message);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      onRateLimitError(error as Error);
      if (error instanceof TwoFactorRequiredError) {
        void queryClient.cancelQueries();
      }
    },
  }),
  mutationCache: new MutationCache({ onError: onRateLimitError }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof BackendUnavailableError) return failureCount < 2;
        if (error instanceof ApiResponseError && error.status >= 400 && error.status < 500) return false;
        if (error instanceof RateLimitError) return false;
        if (error instanceof QuotaExceededError) return false;
        if (error instanceof TwoFactorRequiredError) return false;
        return failureCount < 3;
      },
      throwOnError: false,
    },
  },
});
