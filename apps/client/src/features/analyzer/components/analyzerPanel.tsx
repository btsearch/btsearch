import { BandSection, ConfirmationSection, KindSection, OperatorSection, RatSection, ResultSection } from "./analyzerSections";
import type { AnalyzerPanelProps } from "./analyzerTypes";
import { ListPanelSlot } from "@/features/stations/list/components/panel/listPanelSections";

export function AnalyzerPanel(props: AnalyzerPanelProps) {
  const { filters, panel } = props;
  const hasOperatorSection = panel.operatorLookups === undefined || panel.counts.operators.size > 0 || filters.operatorIds.length > 0;

  return (
    <>
      <ListPanelSlot>
        <ResultSection {...props} />
      </ListPanelSlot>
      <ListPanelSlot>
        <KindSection {...props} />
      </ListPanelSlot>
      <ListPanelSlot>
        <RatSection {...props} />
      </ListPanelSlot>
      <ListPanelSlot isShown={hasOperatorSection}>
        <OperatorSection {...props} />
      </ListPanelSlot>
      <ListPanelSlot>
        <BandSection {...props} />
      </ListPanelSlot>
      <ListPanelSlot>
        <ConfirmationSection {...props} />
      </ListPanelSlot>
    </>
  );
}
