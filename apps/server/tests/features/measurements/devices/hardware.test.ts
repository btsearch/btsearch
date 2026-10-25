import { describe, expect, it } from "vitest";

import { modemFamilyOf } from "../../../../src/features/measurements/devices/hardware.js";

describe("modemFamilyOf", () => {
  it.each([
    { manufacturer: "QTI", model: "SM8650", family: "qualcomm" },
    { manufacturer: "Mediatek", model: "MT6983", family: "mediatek" },
    { manufacturer: "Samsung", model: "s5e9945", family: "samsung" },
    { manufacturer: "Google", model: "Tensor", family: "samsung" },
    { manufacturer: "Google", model: "Tensor G5", family: "samsung" },
    { manufacturer: "Google", model: "Tensor G6", family: "other" },
    { manufacturer: "Spreadtrum", model: "T606", family: "unisoc" },
    { manufacturer: "Rockchip", model: "RK3588", family: "other" },
  ])("gives $manufacturer $model the family $family", ({ manufacturer, model, family }) => {
    expect(modemFamilyOf(manufacturer, model)).toBe(family);
  });
});
