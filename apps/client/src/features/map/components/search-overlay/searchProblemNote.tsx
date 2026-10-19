import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Trans, useTranslation } from "react-i18next";

import type { QueryProblem } from "../../searchAutocomplete";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SearchProblemNoteProps = {
  id?: string;
  problem: QueryProblem;
  onFix: () => void;
  className?: string;
};

const CODE_CLASS = "rounded bg-muted px-1 font-mono font-normal";

export function SearchProblemNote({ id, problem, onFix, className }: SearchProblemNoteProps) {
  const { t } = useTranslation("main");

  return (
    <div id={id} className={cn("flex items-center gap-2 text-xs leading-4 font-medium text-foreground", className)}>
      <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {problem.kind === "unknownKeyword" ? (
          <Trans
            t={t}
            i18nKey="search.unknownKeyword"
            values={{ typed: `${problem.typed}:`, suggestion: `${problem.suggestion}:` }}
            components={{ code: <code className={CODE_CLASS} /> }}
          />
        ) : (
          <Trans
            t={t}
            i18nKey="search.invalidValue"
            values={{ value: problem.value, key: `${problem.key}:` }}
            components={{ code: <code className={CODE_CLASS} /> }}
          />
        )}
      </p>
      {problem.kind === "unknownKeyword" ? (
        <Button variant="outline" size="xs" className="shrink-0" onPointerDown={(event) => event.preventDefault()} onClick={onFix}>
          {t("search.fix")}
        </Button>
      ) : null}
    </div>
  );
}
