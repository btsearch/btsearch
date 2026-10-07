import { useTranslation } from "react-i18next";

import { useNow } from "@/hooks/useNow";
import { formatRelativeTime } from "@/lib/format";

export function useRelativeTime(date: string): string {
  const { t } = useTranslation("common");
  const now = useNow();

  return formatRelativeTime(date, t, now);
}

export function RelativeTime({ date }: { date: string }) {
  return useRelativeTime(date);
}
