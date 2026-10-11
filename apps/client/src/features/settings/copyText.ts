import i18next from "i18next";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function useCopyText() {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimerRef.current), []);

  const copy = (text: string) => {
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => {
          window.clearTimeout(resetTimerRef.current);
          setCopied(true);
          resetTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
        },
        () => toast.error(i18next.t("settings:copyFailed")),
      );
  };

  return { copied, copy };
}
