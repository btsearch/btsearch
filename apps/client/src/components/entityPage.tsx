import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const entityPageChipClassName =
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors";

type EntityPageMessageProps = {
  titleKey: string;
  descriptionKey: string;
};

export function EntityPageMessage({ titleKey, descriptionKey }: EntityPageMessageProps) {
  const { t } = useTranslation(["stationDetails", "nav"]);
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HugeiconsIcon icon={InformationCircleIcon} className="size-6" />
      </div>
      <h1 className="text-base font-semibold">{t(titleKey)}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t(descriptionKey)}</p>
      <Link
        to="/stations"
        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
      >
        {t("nav:items.database")}
      </Link>
    </main>
  );
}
