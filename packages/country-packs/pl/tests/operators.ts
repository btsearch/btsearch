import type { OperatorRef } from "../../core/conventions.ts";

export const PLUS: OperatorRef = { id: 1, primaryPlmn: "26001", sharedNetworkPlmns: [] };
export const TMOBILE: OperatorRef = { id: 2, primaryPlmn: "26002", sharedNetworkPlmns: ["26034"] };
export const ORANGE: OperatorRef = { id: 3, primaryPlmn: "26003", sharedNetworkPlmns: ["26034"] };
export const PLAY: OperatorRef = { id: 4, primaryPlmn: "26006", sharedNetworkPlmns: [] };
export const NETWORKS: OperatorRef = { id: 5, primaryPlmn: "26034", sharedNetworkPlmns: [] };
export const UNRELATED: OperatorRef = { id: 6, primaryPlmn: "26018", sharedNetworkPlmns: [] };
export const FOREIGN_MEMBER: OperatorRef = { id: 7, primaryPlmn: "23003", sharedNetworkPlmns: ["23099"] };
export const WITHOUT_PLMN: OperatorRef = { id: 8, primaryPlmn: null, sharedNetworkPlmns: [] };
