import type { NsgCell, NsgEvent, NsgJsonObject } from "./types";

export type NsgResolvedOperator = {
  plmn: string;
  mcc: string;
  mnc: string;
  name: string | null;
  source: "serviceState" | "cell";
};

export type NsgOperatorContext = Pick<NsgCell, "slotId" | "subId" | "rat" | "elapsedUs" | "eventIndex">;
export type NsgOperatorResolver = {
  get: (context: NsgOperatorContext) => NsgResolvedOperator | null;
  resolveCell: (cell: NsgCell) => NsgResolvedOperator | null;
};

type Version = { elapsedUs: number; eventIndex: number };
type OperatorState = Version & { slotId: number; subId: number | null; operators: Map<string, NsgResolvedOperator> };
type StateChange = (state: OperatorState) => void;

const NETWORK_RATS: Record<number, string> = {
  1: "GSM",
  2: "GSM",
  3: "UMTS",
  8: "UMTS",
  9: "UMTS",
  10: "UMTS",
  13: "LTE",
  15: "UMTS",
  16: "GSM",
  19: "LTE",
  20: "NR",
};

function object(value: unknown): value is NsgJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function compareVersion(left: Version, right: Version): number {
  return left.elapsedUs - right.elapsedUs || left.eventIndex - right.eventIndex;
}

function contextKey(slotId: number, subId: number): string {
  return `${slotId}:${subId}`;
}

function cellPlmn(mcc: unknown, mnc: unknown): NsgResolvedOperator | null {
  if (typeof mcc !== "string" || typeof mnc !== "string" || !/^\d{3}$/.test(mcc) || !/^\d{1,3}$/.test(mnc) || mcc === "000") return null;
  const normalizedMnc = mnc.padStart(2, "0");
  return { mcc, mnc: normalizedMnc, plmn: mcc + normalizedMnc, name: null, source: "cell" };
}

function numericPlmn(value: unknown): NsgResolvedOperator | null {
  if (typeof value !== "string" || !/^\d{5,6}$/.test(value)) return null;
  return cellPlmn(value.slice(0, 3), value.slice(3));
}

export function getNsgCellOperator(cell: Pick<NsgCell, "mcc" | "mnc">): NsgResolvedOperator | null {
  return cellPlmn(cell.mcc, cell.mnc);
}

function operatorsFromService(data: NsgJsonObject): Map<string, NsgResolvedOperator> {
  const operators = new Map<string, NsgResolvedOperator>();
  const ambiguous = new Set<string>();
  const root = numericPlmn(data.operator);
  if (!Array.isArray(data.networks)) return operators;
  for (const network of data.networks) {
    if (!object(network) || network.registered !== true || typeof network.rat !== "number") continue;
    const rat = NETWORK_RATS[network.rat];
    if (!rat || ambiguous.has(rat)) continue;
    const operator = numericPlmn(network.registeredPLMN) ?? root;
    if (operator === null) {
      operators.delete(rat);
      ambiguous.add(rat);
      continue;
    }
    const previous = operators.get(rat);
    if (previous && previous.plmn !== operator.plmn) {
      operators.delete(rat);
      ambiguous.add(rat);
      continue;
    }
    operators.set(rat, {
      ...operator,
      source: "serviceState",
      name: root?.plmn === operator.plmn && typeof data["operator-long"] === "string" ? data["operator-long"] : null,
    });
  }
  return operators;
}

function operatorForContext(state: OperatorState | undefined, context: NsgOperatorContext): NsgResolvedOperator | null {
  if (!state || state.subId !== context.subId || compareVersion(state, context) > 0) return null;
  return state.operators.get(context.rat === "WCDMA" ? "UMTS" : context.rat) ?? null;
}

export class NsgStreamingOperatorResolver implements NsgOperatorResolver {
  private readonly slots = new Map<number, OperatorState>();
  private subscriptionHomes: Map<string, string | null> | null = null;
  private subscriptionVersion: Version | null = null;
  private unattributedServiceVersion: Version | null = null;

  constructor(private readonly onChange?: StateChange) {}

  private setSlot(slotId: number, subId: number | null, event: NsgEvent, operators = new Map<string, NsgResolvedOperator>()): void {
    const version = { elapsedUs: event.elapsedUs, eventIndex: event.id };
    const previous = this.slots.get(slotId);
    if (previous && compareVersion(previous, version) > 0) return;
    if (previous && previous.subId !== null && previous.subId !== subId)
      this.onChange?.({ ...version, slotId, subId: previous.subId, operators: new Map() });
    const state = { ...version, slotId, subId, operators };
    this.slots.set(slotId, state);
    if (subId !== null) this.onChange?.(state);
  }

  observe(event: NsgEvent): void {
    const { data } = event;
    if (event.name === "subscriptionsChanged") {
      const version = { elapsedUs: event.elapsedUs, eventIndex: event.id };
      if (this.subscriptionVersion && compareVersion(this.subscriptionVersion, version) > 0) return;
      this.subscriptionVersion = version;
      const next = new Map<string, string | null>();
      if (Array.isArray(data.subscriptions))
        for (const subscription of data.subscriptions) {
          if (!object(subscription) || !identifier(subscription.simSlotIndex) || !identifier(subscription.subscriptionId)) continue;
          next.set(contextKey(subscription.simSlotIndex, subscription.subscriptionId), cellPlmn(subscription.mcc, subscription.mnc)?.plmn ?? null);
        }
      for (const state of this.slots.values()) {
        if (state.subId === null) continue;
        const key = contextKey(state.slotId, state.subId);
        const previousHome = this.subscriptionHomes?.get(key);
        const nextHome = next.get(key);
        if (!next.has(key) || (previousHome !== undefined && previousHome !== null && nextHome !== null && previousHome !== nextHome))
          this.setSlot(state.slotId, null, event);
      }
      this.subscriptionHomes = next;
      return;
    }

    if (event.name !== "serviceState") return;
    const version = { elapsedUs: event.elapsedUs, eventIndex: event.id };
    if (this.subscriptionVersion && compareVersion(this.subscriptionVersion, version) > 0) return;
    if (this.unattributedServiceVersion && compareVersion(this.unattributedServiceVersion, version) > 0) return;
    const slotId = identifier(data.slotId) ? data.slotId : null;
    const subId = identifier(data.subId) ? data.subId : null;
    if (slotId === null || subId === null) {
      if (slotId !== null) {
        this.setSlot(slotId, null, event);
        return;
      }
      this.unattributedServiceVersion = version;
      for (const state of this.slots.values()) if (subId === null || state.subId === subId) this.setSlot(state.slotId, null, event);
      return;
    }
    for (const state of this.slots.values()) if (state.slotId !== slotId && state.subId === subId && compareVersion(state, version) > 0) return;
    for (const state of this.slots.values()) if (state.slotId !== slotId && state.subId === subId) this.setSlot(state.slotId, null, event);
    this.setSlot(slotId, subId, event, operatorsFromService(data));
  }

  get(context: NsgOperatorContext): NsgResolvedOperator | null {
    if (!identifier(context.slotId) || !identifier(context.subId)) return null;
    return operatorForContext(this.slots.get(context.slotId), context);
  }

  resolveCell(cell: NsgCell): NsgResolvedOperator | null {
    return getNsgCellOperator(cell);
  }
}

export function createNsgOperatorResolver(events: readonly NsgEvent[]): NsgOperatorResolver {
  const histories = new Map<string, OperatorState[]>();
  const collector = new NsgStreamingOperatorResolver((state) => {
    if (state.subId === null) return;
    const key = contextKey(state.slotId, state.subId);
    const history = histories.get(key) ?? [];
    history.push(state);
    histories.set(key, history);
  });
  const ordered = events
    .filter((event) => event.name === "serviceState" || event.name === "subscriptionsChanged")
    .sort((left, right) => left.elapsedUs - right.elapsedUs || left.id - right.id);
  for (const event of ordered) collector.observe(event);
  return {
    get(context) {
      if (!identifier(context.slotId) || !identifier(context.subId)) return null;
      const history = histories.get(contextKey(context.slotId, context.subId));
      if (!history) return null;
      let low = 0;
      let high = history.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (compareVersion(history[middle], context) <= 0) low = middle + 1;
        else high = middle;
      }
      return operatorForContext(history[low - 1], context);
    },
    resolveCell: getNsgCellOperator,
  };
}
