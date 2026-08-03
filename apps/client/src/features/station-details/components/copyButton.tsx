import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={handleCopy}
        className={cn(
          "p-1 hover:bg-muted rounded transition-[background-color,opacity] cursor-pointer",
          "opacity-0 group-hover/copy:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
          copied && "opacity-100",
        )}
      >
        {copied ? (
          <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-emerald-500" />
        ) : (
          <HugeiconsIcon icon={Copy01Icon} className="size-3.5 text-muted-foreground" />
        )}
      </TooltipTrigger>
      <TooltipContent>{copied ? t("common:actions.copied") : t("common:actions.copy")}</TooltipContent>
    </Tooltip>
  );
}
