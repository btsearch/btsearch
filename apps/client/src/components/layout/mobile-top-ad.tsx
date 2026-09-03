import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { GoogleAd } from "@/components/ui/google-ad";

const AD_CONTAINER_CLASS_NAME = "flex shrink-0 flex-col items-center justify-center gap-2 border-b bg-background min-[360px]:flex-row";

interface MobileTopAdProps {
  adSlot: string;
  onDismiss: () => void;
}

export default function MobileTopAd({ adSlot, onDismiss }: MobileTopAdProps) {
  const { t } = useTranslation("main");

  const dismissButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onDismiss}
      aria-label={t("ads.dismiss")}
      className="order-first self-end text-muted-foreground min-[360px]:order-0 min-[360px]:self-auto"
    >
      <HugeiconsIcon icon={Cancel01Icon} />
    </Button>
  );

  return (
    <GoogleAd adSlot={adSlot} adSize="320x50" className={AD_CONTAINER_CLASS_NAME}>
      {dismissButton}
    </GoogleAd>
  );
}
