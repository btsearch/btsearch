import { describe, expect, it } from "vitest";

import { t } from "../../src/i18n/index.js";

const fallbackLocales = [
  { name: "a missing locale", locale: undefined },
  { name: "a null locale", locale: null },
  { name: "an empty locale", locale: "" },
  { name: "an unsupported locale", locale: "de-DE" },
];

describe("t", () => {
  it.each(fallbackLocales)("uses Polish notification messages for $name", ({ locale }) => {
    expect(t("submissionApproved", locale)).toEqual({
      title: "Zgłoszenie zatwierdzone",
      body: "Twoje zgłoszenie zostało zatwierdzone",
    });
  });
});
