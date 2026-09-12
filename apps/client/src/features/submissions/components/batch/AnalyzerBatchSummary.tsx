import { useTranslation } from "react-i18next";

import type { AnalyzerBatchDraft } from "../../utils/fromAnalyzer";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  draft: AnalyzerBatchDraft;
  submitterNote: string;
  onSubmitterNoteChange: (value: string) => void;
}

export function AnalyzerBatchSummary({ draft, submitterNote, onSubmitterNoteChange }: Props) {
  const { t } = useTranslation(["submissions"]);
  return (
    <div className="space-y-3">
      <div>
        <h1>{t("batch.fromAnalyzerTitle")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{draft.metadata.fileName}</p>
      </div>

      <div>
        <label htmlFor="submitterNote" className="text-xs font-medium text-muted-foreground">
          {t("batch.submitterNote")}
        </label>
        <Textarea
          id="submitterNote"
          value={submitterNote}
          onChange={(e) => onSubmitterNoteChange(e.target.value)}
          placeholder={t("batch.submitterNotePlaceholder")}
          rows={2}
          className="resize-none text-sm"
        />
      </div>
    </div>
  );
}
