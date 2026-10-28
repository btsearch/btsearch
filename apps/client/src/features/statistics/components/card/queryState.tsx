import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ErrorState } from "@/components/ui/error-state";

type QueryStateProps<T> = {
  query: UseQueryResult<T>;
  skeleton: ReactNode;
  errorClassName?: string;
  children: (data: T) => ReactNode;
};

export function QueryState<T>({ query, skeleton, errorClassName, children }: QueryStateProps<T>) {
  if (query.data !== undefined) return children(query.data);
  if (query.isError) {
    return (
      <div className={errorClassName}>
        <ErrorState onRetry={() => query.refetch()} isRetrying={query.isFetching} />
      </div>
    );
  }
  return skeleton;
}
