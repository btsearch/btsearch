import { FullSignalIcon, Globe02Icon, InformationCircleIcon, SmartPhone01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { FlagSubject, FlagSubjectIcon } from "../model/flagText";
import { BrandMark } from "@/components/cellular/brandMark";
import type { Brand, Operator } from "@/features/station-details/station/types";
import { cn } from "@/lib/utils";

type FlagSubjectMarkProps = {
  subject: FlagSubject;
  operator: Operator | null;
  brand: Brand | null;
  size: 16 | 20;
};

const SUBJECT_ICONS: Record<FlagSubjectIcon, IconSvgElement> = {
  device: SmartPhone01Icon,
  person: UserIcon,
  country: Globe02Icon,
  network: FullSignalIcon,
};

export function FlagSubjectMark({ subject, operator, brand, size }: FlagSubjectMarkProps) {
  if (operator !== null) return <BrandMark brand={brand} size={size} />;
  return (
    <HugeiconsIcon
      icon={subject.icon === null ? InformationCircleIcon : SUBJECT_ICONS[subject.icon]}
      aria-hidden="true"
      className={cn("shrink-0 text-muted-foreground", size === 20 ? "size-5" : "size-4")}
    />
  );
}

export function EstimatedLabel() {
  const { t } = useTranslation("admin");

  return <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{t("observationFlags.estimated")}</span>;
}
