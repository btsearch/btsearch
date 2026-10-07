import type { NsgJsonObject } from "../../../src/lib/nsg-parser/model";
import { bytesFromHex, concatBytes, encodeVarint } from "../binary";

const encoder = new TextEncoder();

export const EPOCH_US = 1_788_614_058_216_807n;

export const B97F_ONE_CELL = bytesFromHex(
  "7c007fb9b571ced62e511201090002000000e130011400001314000002000000" +
    "c0ea09000001b3030001000021c1ffff00b2ffffffffffffffff0000ffffffff" +
    "b3031c020100000082c0ffff9ef6ffff010000000000000000000000ae1534e6" +
    "1e0a400b8bbfffff0ac0ffff82c0ffff9ef6ffff0000000000000000",
);

export const B97F_TWO_CELLS = bytesFromHex(
  "b8007fb97e54ddcb2e511201090002000004f025011400003c14000002000000" +
    "c0ea09000002b30301010000f3c4ffff1ec0ffffffffffffffff0000ffffffff" +
    "9003ec00010000008eb8ffff0af0ffff020000000000000000000000e6bc32f0" +
    "554cea0414c0ffff3ebdffff8eb8ffff0af0ffff0000000000000000b303be00" +
    "0100000091c8ffff74faffff01000000000000000000000046f8d7e41d2aea04" +
    "78c8ffff1bc7ffff91c8ffff74faffff0000000000000000",
);

export const B97F_V2_10_ONE_CELL = bytesFromHex(
  "a4007fb9162fe6936c5412010a0002000080502e0114000063070000e6ffffff" +
    "60c0090000014900000000007ac9ffffd0c4ffffffffffffffff0000ffffffff" +
    "4900ca010100000082c9ffff65faffff0000010000000000000000008555821f" +
    "ffb12a005acaffff55c2ffff9ffafffff1f8ffff000000000000000000000000" +
    "000000000000000000000000000000000000000082c9ffff65faffff54c9ffff" +
    "3cfaffff",
);

export const B97F_V2_10_NO_SERVING = bytesFromHex(
  "a4007fb97a4a37896c5412010a000200008099b5010000005b0700003bc9870a" +
    "60c00900ff01ffffffff00000000000000000000ffffffffffff0000ffffffff" +
    "49006c000100000041c9ffff59faffff00000100000000000000000055680f56" +
    "e891a70c41c9ffffe3c1ffff59fafffff1f8ffff000000000000000000000000" +
    "0000000000000000000000000000000000000000000000000000000041c9ffff" +
    "59faffff",
);

export const B97F_V3_ONE_CELL = bytesFromHex(
  "ac007fb964957efe8a521201000003000084303901140000f903000003000000" +
    "c0ea090000011a000003000006c4ffffd7c1ffff0000000000000000ffffffff" +
    "ffff0000ffffffff1a0026030100000007c2ffffa8f8ffff0300010000000000" +
    "000000005aae9e23eaaf76077ac4ffff37c2ffffb0f9ffffeaf8ffff00000000" +
    "0000000000000000000000000000000000000000000000000000000007c2ffff" +
    "a8f8ffff0000000000000000",
);

export const LTE_SERVICE_REQUEST = bytesFromHex("1400edb0a13980ea1f51120101090500c73ea40f");
export const LTE_RRC_V30 = bytesFromHex("2b00c0b08e537be1d55512011e1120118000d000670c0000d9380700000000070000000040005e779a0780");
export const NR_RRC_V26 = bytesFromHex("350021b88c94e3fbd55512011a00000011800110000000000000000000feea070010b6ed24000000000600000000001009288e9026");
export const B0C2_PLUS = bytesFromHex("2900c2b08f19a9f5d5551201037f004b0500009b4b000064640106a9002ca003000000040102010000");
export const B0C2_T_MOBILE = bytesFromHex("2900c2b0f3069195d6551201031201e1000000314700004b4b190e270256d301000000040102020000");

export function frame(type: number, elapsedUs: number, payload: Uint8Array, streamIndex = 0): Uint8Array {
  return concatBytes(
    encodeVarint(7),
    encodeVarint(streamIndex),
    encodeVarint(elapsedUs),
    encodeVarint(type),
    encodeVarint(99),
    encodeVarint(payload.length),
    payload,
  );
}

export function timeAnchor(): Uint8Array {
  const payload = new Uint8Array(8);
  new DataView(payload.buffer).setBigUint64(0, EPOCH_US, true);
  return frame(0, 0, payload);
}

export function nsgHeader(xml = '<root start="2026-09-05T13:14:18Z"><device name="Synthetic" /></root>'): Uint8Array {
  const encodedXml = encoder.encode(xml);
  return concatBytes(encoder.encode("!NSG"), encodeVarint(encodedXml.length), encodedXml);
}

export function jsonEvent(elapsedUs: number, data: NsgJsonObject, marker = 0x42): Uint8Array {
  const streamIndex = typeof data.slotId === "number" ? data.slotId : 0;
  return frame(53, elapsedUs, concatBytes(Uint8Array.of(marker), encoder.encode(JSON.stringify(data))), streamIndex);
}

export function lteSubscriptionEvent(
  elapsedUs: number,
  subscription: { subId: number; slotId: number; isDefault: boolean; mnc: string; eci: number; earfcn?: number },
): Uint8Array {
  return jsonEvent(elapsedUs, {
    event: "ScheduleCellInfo",
    subId: subscription.subId,
    slotId: subscription.slotId,
    default: subscription.isDefault,
    cells: [
      {
        type: "lte",
        registered: true,
        mcc: "260",
        mnc: subscription.mnc,
        eci: subscription.eci,
        pci: 7,
        earfcn: subscription.earfcn ?? 1300,
        dbm: -90,
      },
    ],
  });
}

export function lteEvent(elapsedUs: number): Uint8Array {
  return lteSubscriptionEvent(elapsedUs, { subId: 2, slotId: 0, isDefault: false, mnc: "03", eci: 123 });
}

export function mixedRecordingBytes(): Uint8Array {
  return concatBytes(
    nsgHeader(),
    timeAnchor(),
    frame(16, 1, Uint8Array.of(0x40, 0xff, 0xff)),
    frame(53, 2, Uint8Array.of(0x39, 0xff)),
    jsonEvent(1234567, {
      event: "ScheduleCellInfo",
      subId: 2,
      slotId: 0,
      default: false,
      cells: [
        {
          type: "lte",
          mcc: "260",
          mnc: "03",
          eci: 0,
          tac: 0,
          pci: 0,
          earfcn: 0,
          rsrp: -90,
          rsrq: -11,
          sinr: 0,
          ta: 0,
          registered: true,
          extra: "Zażółć, test",
        },
        { type: "gsm", mcc: "260", mnc: "02", dbm: -105, registered: false },
        { type: "lte", mcc: "260", mnc: "03", rsrp: 2147483647 },
      ],
    }),
    jsonEvent(1200000, { event: "change", latitude: 0, longitude: 0, provider: "gps", accuracy: 0, altitude: 0, speed: 0, time: 1788614050 }, 0x40),
    jsonEvent(1300000, { event: "geocoder", latitude: 52, longitude: 20 }, 0x40),
  );
}
