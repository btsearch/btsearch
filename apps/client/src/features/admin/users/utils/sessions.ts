import type { TFunction } from "i18next";

import type { SessionDevice } from "../types";

export function getSessionDeviceLabel(t: TFunction, device: SessionDevice): string {
  return [device.browser, device.os].filter(Boolean).join(", ") || t("settings:sessions.unknownDevice");
}
