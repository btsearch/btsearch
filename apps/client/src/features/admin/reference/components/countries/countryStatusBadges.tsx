import { LockIcon, SentIcon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import type { ContributionMode } from "../../types";
import { StatusBadge } from "../shared/referenceCards";

type CountryVisibilityBadgeProps = {
  isVisible: boolean;
};

type CountryContributionsBadgeProps = {
  contributions: ContributionMode;
  isLong?: boolean;
};

const SUCCESS_TEXT_CLASS = "text-emerald-700 dark:text-emerald-400";

export function CountryVisibilityBadge({ isVisible }: CountryVisibilityBadgeProps) {
  const { t } = useTranslation("admin");

  if (isVisible) {
    return (
      <StatusBadge tone="success" icon={ViewIcon} className={SUCCESS_TEXT_CLASS}>
        {t("reference.countries.visibility.visible")}
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="muted" icon={ViewOffIcon}>
      {t("reference.countries.visibility.hidden")}
    </StatusBadge>
  );
}

export function CountryContributionsBadge({ contributions, isLong = false }: CountryContributionsBadgeProps) {
  const { t } = useTranslation("admin");

  if (contributions === "open") {
    return (
      <StatusBadge tone="success" icon={SentIcon} className={SUCCESS_TEXT_CLASS}>
        {isLong ? t("reference.countries.contributions.openLong") : t("reference.countries.contributions.open")}
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="muted" icon={LockIcon}>
      {isLong ? t("reference.countries.contributions.closedLong") : t("reference.countries.contributions.closed")}
    </StatusBadge>
  );
}
