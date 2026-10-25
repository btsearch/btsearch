import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import type { EvidenceFact, PlaceSummary } from "./evidenceText";
import { CHOICE_ICONS, type PlaceChoice } from "./placeChoices";
import { BrandMark } from "@/components/cellular/brandMark";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getOperatorLook, useMapLookups } from "@/features/map/data/mapLookups";
import { cn } from "@/lib/utils";

type EvidencePanelProps = {
  summary: PlaceSummary;
  showsNotPublic: boolean;
  choices: readonly PlaceChoice[];
  chosenKey: string | null;
  facts: readonly EvidenceFact[];
  isChoosing: boolean;
  footer: ReactNode;
  onChoose: (key: string) => void;
};

type ChoiceRowProps = {
  choice: PlaceChoice;
};

const SECTION_TITLE_CLASS = "text-sm leading-5 font-semibold";

function ChoiceLogos({ operatorIds }: { operatorIds: readonly number[] }) {
  const { lookups } = useMapLookups();

  return operatorIds.map((operatorId) => {
    const { operator, brand } = getOperatorLook(lookups, operatorId);
    return operator === null ? null : <BrandMark key={operatorId} brand={brand} size={12} />;
  });
}

function ChoiceRow({ choice }: ChoiceRowProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 border-b py-2 pr-3 pl-2.5 transition-colors last:border-b-0 hover:bg-muted/50 has-[[data-checked]]:bg-primary/6">
      <RadioGroupItem value={choice.key} className="mt-0.5 cursor-pointer" />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex min-w-0 items-center gap-1.5">
          <HugeiconsIcon icon={CHOICE_ICONS[choice.kind]} aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm leading-5 font-semibold">{choice.title}</span>
          {choice.share === null ? null : (
            <span className={cn("shrink-0 text-[13px] font-bold tabular-nums", choice.isSnap ? "text-emerald-700 dark:text-emerald-400" : null)}>
              {choice.share}
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs leading-4 text-muted-foreground">
          <ChoiceLogos operatorIds={choice.operatorIds} />
          <span className="min-w-0 truncate tabular-nums">{choice.line}</span>
        </span>
      </span>
    </label>
  );
}

export function EvidencePanel({ summary, showsNotPublic, choices, chosenKey, facts, isChoosing, footer, onChoose }: EvidencePanelProps) {
  const { t } = useTranslation("admin");
  const placeTitleId = useId();
  const choiceTitleId = useId();
  const basisTitleId = useId();

  return (
    <aside
      aria-label={t("observationFlags.evidence.panelLabel")}
      className="flex shrink-0 flex-col border-l bg-background md:w-95 max-md:border-t max-md:border-l-0"
    >
      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-4.5 p-4 md:overflow-y-auto">
        <section aria-labelledby={placeTitleId} className="flex flex-col gap-0.5">
          <h2 id={placeTitleId} className="mb-0.5 text-xs leading-4 font-semibold text-muted-foreground">
            {t("observationFlags.evidence.place.title")}
          </h2>
          <p className="text-lg leading-6 font-bold tracking-tight">{summary.title}</p>
          {summary.sub === "" ? null : <p className="text-xs leading-4 text-muted-foreground tabular-nums">{summary.sub}</p>}
          <p className="mt-1.5 text-[13px] leading-[19px] text-foreground/80">{summary.note}</p>
          {showsNotPublic ? (
            <div
              role="status"
              className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/55 bg-amber-500/8 px-2.5 py-2 text-xs leading-4 text-amber-700 dark:text-amber-400"
            >
              <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="mt-px size-4 shrink-0" />
              <span>
                <span className="font-bold">{t("observationFlags.evidence.place.notPublic")}</span> -{" "}
                {t("observationFlags.evidence.place.notPublicAmbiguous")}
              </span>
            </div>
          ) : null}
        </section>

        {isChoosing && choices.length > 0 ? (
          <section aria-labelledby={choiceTitleId} className="flex flex-col gap-2">
            <div>
              <h2 id={choiceTitleId} className={SECTION_TITLE_CLASS}>
                {t("observationFlags.evidence.choices.title")}
              </h2>
              <p className="text-xs leading-4 text-muted-foreground">{t("observationFlags.evidence.choices.hint")}</p>
            </div>
            <RadioGroup
              aria-labelledby={choiceTitleId}
              value={chosenKey}
              onValueChange={(value) => {
                if (typeof value === "string") onChoose(value);
              }}
              className="gap-0 overflow-hidden rounded-lg border"
            >
              {choices.map((choice) => (
                <ChoiceRow key={choice.key} choice={choice} />
              ))}
            </RadioGroup>
          </section>
        ) : null}

        {facts.length === 0 ? null : (
          <section aria-labelledby={basisTitleId} className="flex flex-col gap-2">
            <h2 id={basisTitleId} className={SECTION_TITLE_CLASS}>
              {t("observationFlags.facts.titleSite")}
            </h2>
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
              {facts.map((fact) => (
                <div key={fact.key} className="flex min-w-0 flex-col gap-px bg-background px-2.5 py-1.75">
                  <dt className="truncate text-xs leading-4 text-muted-foreground">{fact.label}</dt>
                  <dd className="truncate text-sm leading-5 font-semibold tabular-nums">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
      {footer === null ? null : (
        <div className="flex shrink-0 flex-col gap-2 border-t bg-background px-4 py-3 max-md:sticky max-md:bottom-0">{footer}</div>
      )}
    </aside>
  );
}
