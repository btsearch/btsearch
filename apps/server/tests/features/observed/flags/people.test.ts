import { describe, expect, it } from "vitest";

import { type LatestDeviceScore, raiseContributorFlags } from "../../../../src/features/observed/flags/contributors.js";
import { raiseDeviceFlags } from "../../../../src/features/observed/flags/devices.js";
import { isWorthRaisingAgain } from "../../../../src/features/observed/flags/kinds.js";

const DEVICE_ID = "0199f0aa-0000-7000-8000-000000000001";
const ANIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BARTEK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CELINA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("deviceRevoked", () => {
  it("names the listed certificate in lower-case hexadecimal without leading zeros, as Google's list writes it", () => {
    expect(raiseDeviceFlags([{ deviceId: DEVICE_ID, serial: Buffer.from("00c0ffee", "hex"), status: "suspended" }])).toEqual([
      {
        kind: "deviceRevoked",
        subjectKey: `device:${DEVICE_ID}`,
        refs: { deviceId: DEVICE_ID },
        evidence: { serial: "c0ffee", revocationStatus: "suspended" },
        suggestion: null,
        measure: { serial: "c0ffee", revocationStatus: "suspended" },
      },
    ]);
  });

  it("opens again after a dismissal once a suspended certificate is revoked, and not while it stays suspended", () => {
    const dismissed = { measure: { serial: "c0ffee", revocationStatus: "suspended" } };
    const [revoked] = raiseDeviceFlags([{ deviceId: DEVICE_ID, serial: Buffer.from("c0ffee", "hex"), status: "revoked" }]);
    const [suspended] = raiseDeviceFlags([{ deviceId: DEVICE_ID, serial: Buffer.from("c0ffee", "hex"), status: "suspended" }]);

    expect(revoked && isWorthRaisingAgain(dismissed, revoked)).toBe(true);
    expect(suspended && isWorthRaisingAgain(dismissed, suspended)).toBe(false);
  });
});

describe("untrustedContributor", () => {
  function score(
    userId: string | null,
    taOnConfirmed: number,
    taWithinTolerance: number,
    isBlocked = false,
    deviceId = DEVICE_ID,
  ): LatestDeviceScore {
    return { deviceId, userId, isBlocked, taOnConfirmed, taWithinTolerance };
  }
  const everyoneElse = [score(null, 4000, 3600), score(CELINA, 900, 810)];
  const ANIAS_PHONE = "0199f0aa-0000-7000-8000-00000000000a";
  const ANIAS_TABLET = "0199f0aa-0000-7000-8000-00000000000b";
  const aniaBelowEveryone = [score(ANIA, 60, 30, false, ANIAS_TABLET), score(ANIA, 40, 10, false, ANIAS_PHONE)];

  it("opens for a person whose agreement over the latest score of each device is below 0.7 of everyone's, with 100 readings", () => {
    const flags = raiseContributorFlags([...everyoneElse, ...aniaBelowEveryone]);

    expect(flags).toEqual([
      {
        kind: "untrustedContributor",
        subjectKey: `user:${ANIA}`,
        refs: { userId: ANIA },
        evidence: { agreement: 0.4, everyoneAgreement: 0.89, readings: 100 },
        suggestion: null,
        measure: { deviceIds: [ANIAS_PHONE, ANIAS_TABLET] },
      },
    ]);
  });

  it("opens again after a dismissal only for a device that was not scored then, however many readings follow", () => {
    const dismissed = { measure: { deviceIds: [ANIAS_PHONE, ANIAS_TABLET] } };
    const [moreReadings] = raiseContributorFlags([
      ...everyoneElse,
      score(ANIA, 600, 300, false, ANIAS_TABLET),
      score(ANIA, 400, 100, false, ANIAS_PHONE),
    ]);
    const [newPhone] = raiseContributorFlags([...everyoneElse, ...aniaBelowEveryone, score(ANIA, 50, 10, false, DEVICE_ID)]);

    expect(moreReadings && isWorthRaisingAgain(dismissed, moreReadings)).toBe(false);
    expect(newPhone && isWorthRaisingAgain(dismissed, newPhone)).toBe(true);
  });

  it("opens nothing for 99 readings, or for a person who is blocked", () => {
    expect(raiseContributorFlags([...everyoneElse, score(ANIA, 99, 10), score(BARTEK, 300, 20, true)])).toEqual([]);
  });
});
