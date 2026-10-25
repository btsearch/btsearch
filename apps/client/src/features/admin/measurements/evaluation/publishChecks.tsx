import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { formatShare, formatSignedChange } from "../utils/format";
import type { PublishCheck } from "./evaluationScores";
import { NO_VALUE } from "./evaluationTable";
import { WARNING_TEXT_CLASS } from "@/features/admin/settings/components/classNames";
import { cn } from "@/lib/utils";

type PublishChecksProps = {
  checks: readonly PublishCheck[];
  candidate: number;
  published: number;
};

function readCheckDetail(t: TFunction, check: PublishCheck, locale: string): string {
  if (check.kind === "radius") return check.share === null ? NO_VALUE : formatShare(check.share, locale);
  if (check.kind === "countries") {
    if (check.worst === null) return t("measurements.evaluation.checks.noCountries");
    return t("measurements.evaluation.checks.worstCountry", {
      country: check.worst.countryCode,
      change: formatSignedChange(check.worst.change, locale),
    });
  }
  return t("measurements.evaluation.checks.compared", {
    candidate: t("measurements.meters", { value: check.candidateMeters }),
    published: t("measurements.meters", { value: check.publishedMeters }),
  });
}

export function PublishChecks({ checks, candidate, published }: PublishChecksProps) {
  const { t, i18n } = useTranslation("admin");

  return (
    <div className="border-t px-4 py-3 text-[13px] leading-[18px]">
      <p className="mb-1.5 font-semibold">{t("measurements.evaluation.checks.title", { candidate, published })}</p>
      <ul>
        {checks.map((check) => (
          <li key={check.kind} className="flex items-start gap-2 py-0.5">
            <HugeiconsIcon
              icon={check.isMet ? CheckmarkCircle02Icon : Alert02Icon}
              aria-hidden="true"
              className={cn("mt-0.5 size-3.5 shrink-0", check.isMet ? "text-emerald-600 dark:text-emerald-400" : WARNING_TEXT_CLASS)}
            />
            <span>
              <span className="sr-only">{`${t(check.isMet ? "measurements.evaluation.checks.met" : "measurements.evaluation.checks.notMet")} `}</span>
              <span className="font-medium">{t(`measurements.evaluation.checks.${check.kind}`)}</span>
              <span className="text-muted-foreground">{`: ${readCheckDetail(t, check, i18n.language)}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
