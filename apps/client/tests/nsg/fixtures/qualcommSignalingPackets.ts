import { bytesFromHex } from "../binary";

export function createLteV27PcchPacket(): Uint8Array {
  return bytesFromHex("2800c0b024938a971f5112011b10100fa0004100670c000029230700000000070040006fb86b8240");
}

export function createLteV30PcchPacket(): Uint8Array {
  return bytesFromHex("2b00c0b08e537be1d55512011e1120118000d000670c0000d9380700000000070000000040005e779a0780");
}

export function createNrV12RadioBearerConfigPacket(): Uint8Array {
  return bytesFromHex("2b0021b8432c6480275112010c0000000fa001ffffffffffff30d20519000000000800140928d7adc00c20");
}

export function createNrV12ReconfigurationCompletePacket(): Uint8Array {
  return bytesFromHex("240021b8b123d680275112010c0000000fa0017103c0ea09000000000a00000000010000");
}

export function createNrV26UlDcchPacket(): Uint8Array {
  return bytesFromHex("3e0021b87058fffad55512011a00000011800110000000000000000000feea0700317c0509000000000f000000000000020874105e8c2ba210b17a70ae80");
}

export function createNrV26RadioBearerConfigPacket(): Uint8Array {
  return bytesFromHex("350021b88c94e3fbd55512011a00000011800110000000000000000000feea070010b6ed24000000000600000000001009288e9026");
}

export function createLteServiceRequestPacket(): Uint8Array {
  return bytesFromHex("1400edb0a13980ea1f51120101090500c73ea40f");
}

export function createLteTauRequestPacket(): Uint8Array {
  return bytesFromHex(
    "6700edb0d27578c125511201010905000748110bf662f020800060c27c86855807f070c0401100805262f020db2e5c0a0057022000310465a03e001362f020db2e1103575886200c61140422918100121e10000040080402600400021f025d0103e0c110025b80",
  );
}

export function createLteTauAcceptPacket(): Uint8Array {
  return bytesFromHex("3e00ecb0059ebac125511201010905000749015a4954080162f020db2edb30570220001362f020db2e3410031f11f2030199f7030499f8030299f9640182");
}
