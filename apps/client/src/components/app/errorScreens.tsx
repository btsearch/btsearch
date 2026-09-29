import { DatabaseIcon, MapsIcon, ReloadIcon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ErrorDetails, PageErrorState } from "@/components/ui/error-state";

type LinkButtonProps = {
  variant?: "default" | "outline";
  size?: "default" | "sm";
};

export function MapLinkButton({ variant = "default", size = "default" }: LinkButtonProps) {
  const { t } = useTranslation("common");

  return (
    <Button variant={variant} size={size} nativeButton={false} render={<Link to="/" />}>
      <HugeiconsIcon icon={MapsIcon} data-icon="inline-start" aria-hidden="true" />
      {t("error.goHome")}
    </Button>
  );
}

export function StationsLinkButton({ variant = "outline", size = "default" }: LinkButtonProps) {
  const { t } = useTranslation("common");

  return (
    <Button variant={variant} size={size} nativeButton={false} render={<Link to="/stations" />}>
      <HugeiconsIcon icon={DatabaseIcon} data-icon="inline-start" aria-hidden="true" />
      {t("errorPage.browseStations")}
    </Button>
  );
}

type UnexpectedErrorProps = {
  error: unknown;
  onRetry: () => unknown;
  isRetrying?: boolean;
};

export function UnexpectedError({ error, onRetry, isRetrying }: UnexpectedErrorProps) {
  const { t } = useTranslation("common");

  return (
    <PageErrorState
      title={t("errorPage.crash.title")}
      description={t("errorPage.crash.description")}
      onRetry={onRetry}
      isRetrying={isRetrying}
      retryLabel={t("errorPage.crash.retry")}
      action={
        <Button type="button" variant="ghost" onClick={() => window.location.reload()}>
          <HugeiconsIcon icon={ReloadIcon} data-icon="inline-start" aria-hidden="true" />
          {t("error.reload")}
        </Button>
      }
    >
      <ErrorDetails error={error} />
    </PageErrorState>
  );
}

export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  return <UnexpectedError error={error} onRetry={() => startRetry(() => router.invalidate())} isRetrying={isRetrying} />;
}

export function RouteNotFound() {
  const { t } = useTranslation("common");

  return (
    <PageErrorState
      tone="neutral"
      icon={SearchRemoveIcon}
      title={t("errorPage.notFound.title")}
      description={t("errorPage.notFound.description")}
      action={
        <>
          <MapLinkButton />
          <StationsLinkButton />
        </>
      }
    />
  );
}
