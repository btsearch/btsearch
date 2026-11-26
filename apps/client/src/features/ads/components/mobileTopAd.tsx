import { useTranslation } from "react-i18next";

import { dismissHouseAds } from "../hooks/useHouseAdsDismissed";
import { GoogleAd } from "./googleAd";
import { CloseButton } from "@/components/ui/close-button";

const AD_CONTAINER_CLASS_NAME = "flex shrink-0 flex-col items-center justify-center gap-2 border-b bg-background min-[360px]:flex-row";

interface MobileTopAdProps {
  adSlot: string;
  onDismiss: () => void;
}

export default function MobileTopAd({ adSlot, onDismiss }: MobileTopAdProps) {
  const { t } = useTranslation("main");

  return (
    <GoogleAd adSlot={adSlot} adSize="320x50" houseAdSize="320x50" className={AD_CONTAINER_CLASS_NAME}>
      <CloseButton
        label={t("ads.dismiss")}
        onClick={() => {
          dismissHouseAds();
          onDismiss();
        }}
        className="order-first self-end min-[360px]:order-0 min-[360px]:self-auto"
      />
    </GoogleAd>
  );
}
