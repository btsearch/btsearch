import { Add01Icon, AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type FormEvent, type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsSave } from "../../hooks/useSettingsSave";
import { type SettingsErrorText, getRouteRefusalText, isRefusal } from "../../utils/errors";
import { ROUTE_ENTRY_PLACEHOLDER, findRouteEntryProblem } from "../../utils/routeEntries";
import { type RouteListName, toRouteListUpdate } from "../../utils/settingsUpdate";
import { SMALL_TEXT_CLASS } from "../classNames";
import { RouteChip } from "./routeChip";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { isSaveShortcut } from "@/lib/dom/keyboard";
import { cn } from "@/lib/utils";

type AdditionConfirmation = {
  title: string;
  confirmLabel: string;
  renderDescription: (entry: string) => ReactNode;
};

type RouteListEditorProps = {
  list: RouteListName;
  entries: string[];
  labelledBy: string;
  fieldLabel: string;
  emptyText: string;
  help: ReactNode;
  additionConfirmation?: AdditionConfirmation;
  className?: string;
};

export function RouteListEditor({ list, entries, labelledBy, fieldLabel, emptyText, help, additionConfirmation, className }: RouteListEditorProps) {
  const { t } = useTranslation("admin");
  const helpId = useId();
  const problemId = useId();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<SettingsErrorText | null>(null);
  const [entryToConfirm, setEntryToConfirm] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const { mutate: saveRemoval } = useSettingsSave();
  const { mutate: saveAddition, isPending: isAdding } = useSettingsSave({ isOptimistic: false, hasInlineRefusal: true });

  function addEntry(entry: string) {
    setProblem(null);
    saveAddition(toRouteListUpdate(list, [...entries, entry]), {
      onSuccess: () => setText(""),
      onError: (error) => {
        if (isRefusal(error)) setProblem(getRouteRefusalText(error, entry));
      },
    });
  }

  function submitEntry() {
    if (isAdding) return;

    const entry = text.trim();
    const entryProblem = findRouteEntryProblem(entry, entries);
    if (entryProblem !== null) {
      setProblem(entryProblem);
      return;
    }
    if (additionConfirmation === undefined) {
      addEntry(entry);
      return;
    }
    setEntryToConfirm(entry);
    setIsConfirmOpen(true);
  }

  function confirmAddition() {
    if (!isConfirmOpen || isAdding) return;

    setIsConfirmOpen(false);
    addEntry(entryToConfirm);
  }

  function removeEntry(entry: string) {
    saveRemoval(
      toRouteListUpdate(
        list,
        entries.filter((candidate) => candidate !== entry),
      ),
    );
  }

  function changeText(nextText: string) {
    setText(nextText);
    setProblem(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitEntry();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isSaveShortcut(event) || text.trim() === "") return;

    event.preventDefault();
    event.stopPropagation();
    submitEntry();
  }

  return (
    <div className={className}>
      {entries.length === 0 ? (
        <p className="text-[0.8125rem] leading-6 text-muted-foreground">{emptyText}</p>
      ) : (
        <ul aria-labelledby={labelledBy} className="flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <RouteChip key={entry} entry={entry} isLocked={isAdding} onRemove={removeEntry} />
          ))}
        </ul>
      )}
      <form noValidate onSubmit={handleSubmit} className="mt-2.5 flex gap-2">
        <Input
          {...NO_AUTOFILL_PROPS}
          value={text}
          onChange={(event) => changeText(event.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={isAdding}
          placeholder={ROUTE_ENTRY_PLACEHOLDER}
          spellCheck={false}
          autoCapitalize="none"
          aria-label={fieldLabel}
          aria-invalid={problem !== null || undefined}
          aria-describedby={problem === null ? helpId : `${problemId} ${helpId}`}
          className="flex-1 font-mono"
        />
        <Button
          type="submit"
          variant="outline"
          className="cursor-pointer data-disabled:pointer-events-none data-disabled:opacity-50"
          disabled={isAdding}
          focusableWhenDisabled
        >
          {isAdding ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />}
          {t("common:actions.add")}
        </Button>
      </form>
      {problem === null ? null : (
        <FieldError id={problemId} className={cn("mt-2 flex items-start gap-1.5", SMALL_TEXT_CLASS)}>
          <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 wrap-anywhere">{t(problem.key, problem.values)}</span>
        </FieldError>
      )}
      <p id={helpId} className="mt-2 text-xs leading-4 text-muted-foreground">
        {help}
      </p>
      {additionConfirmation === undefined ? null : (
        <ConfirmDialog
          open={isConfirmOpen}
          onOpenChange={setIsConfirmOpen}
          title={additionConfirmation.title}
          description={additionConfirmation.renderDescription(entryToConfirm)}
          confirmLabel={additionConfirmation.confirmLabel}
          onConfirm={confirmAddition}
        />
      )}
    </div>
  );
}
