import { Share08Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ShareButtonProps = {
  title?: string;
  text?: string;
  url?: string;
  size?: "sm" | "md";
  className?: string;
};

export function ShareButton({ title, text, url, size = "sm", className }: ShareButtonProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const [copied, setCopied] = useState(false);
  const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");

  const handleShare = useCallback(() => {
    if (navigator.share) {
      void navigator
        .share({
          title: title ?? document.title,
          text,
          url: shareUrl,
        })
        .then(() => {})
        .catch((error: unknown) => {
          if ((error as Error).name === "AbortError") return;
        });
      return;
    }

    void navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((error) => {
        console.error("Failed to copy to clipboard:", error);
      });
  }, [title, text, shareUrl]);

  const iconSize = size === "sm" ? "size-3.5" : "size-4";
  const buttonPadding = size === "sm" ? "p-1" : "p-1.5";

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={handleShare}
        className={cn(
          buttonPadding,
          "hover:bg-muted rounded transition-colors cursor-pointer",
          className,
          copied ? "hover:[&_svg]:text-emerald-500" : undefined,
        )}
      >
        {copied ? (
          <HugeiconsIcon icon={Tick02Icon} className={cn(iconSize, "text-emerald-500")} />
        ) : (
          <HugeiconsIcon icon={Share08Icon} className={cn(iconSize, "text-muted-foreground")} />
        )}
      </TooltipTrigger>
      <TooltipContent>{copied ? t("common:actions.copied") : t("common:actions.share")}</TooltipContent>
    </Tooltip>
  );
}
