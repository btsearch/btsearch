import type { CellRat } from "@openbts/shared/contract";

export const RADIO_FIELD_NAMES = {
  gsm: { lac: "lac", cid: "cid", e_gsm: "isEGsm", bsic: "bsic" },
  umts: { lac: "lac", rnc: "rnc", cid: "cid", arfcn: "uarfcn", psc: "psc" },
  lte: { tac: "tac", enbid: "enbid", clid: "clid", pci: "pci", earfcn: "earfcn", supports_iot: "supportsIot" },
  nr: { type: "mode", nrtac: "tac", gnbid: "gnbid", clid: "clid", pci: "pci", arfcn: "arfcn", supports_nr_redcap: "supportsRedCap" },
} as const satisfies Record<CellRat, Record<string, string>>;
