import i18next from "i18next";
import { useState } from "react";
import { toast } from "sonner";

export function useCopyText() {
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        },
        () => toast.error(i18next.t("settings:copyFailed")),
      );
  };

  return { copied, copy };
}
