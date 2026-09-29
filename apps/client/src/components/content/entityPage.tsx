import type { IconSvgElement } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { useTranslation } from "react-i18next";

import { StationsLinkButton } from "@/components/app/errorScreens";
import { PageErrorState } from "@/components/ui/error-state";

export const entityPageChipClassName =
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors";

type EntityPageStateProps = {
  titleKey: string;
  descriptionKey: string;
};

export function EntityNotFound({ icon, titleKey, descriptionKey }: EntityPageStateProps & { icon: IconSvgElement }) {
  const { t } = useTranslation("stationDetails");

  return (
    <PageErrorState
      tone="neutral"
      icon={icon}
      title={t(titleKey)}
      description={t(descriptionKey)}
      action={<StationsLinkButton variant="default" />}
    />
  );
}

export function EntityRouteError({ titleKey, descriptionKey }: EntityPageStateProps) {
  const { t } = useTranslation("stationDetails");
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  return (
    <PageErrorState
      title={t(titleKey)}
      description={t(descriptionKey)}
      onRetry={() => startRetry(() => router.invalidate())}
      isRetrying={isRetrying}
      action={<StationsLinkButton />}
    />
  );
}
