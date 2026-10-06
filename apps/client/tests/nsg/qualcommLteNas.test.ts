import assert from "node:assert/strict";
import test from "node:test";

import { decodeQualcommSignaling } from "../../src/lib/nsg-parser/internal/qualcomm/signaling/decoder";
import { QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE, QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE } from "../../src/lib/nsg-parser/qualcomm";
import { bytesFromHex as fromHex } from "./binary";
import { createLteServiceRequestPacket, createLteTauAcceptPacket, createLteTauRequestPacket } from "./fixtures/qualcommSignalingPackets";

void test("names only validated plain EPS NAS messages from the real log", () => {
  const serviceRequest = decodeQualcommSignaling(createLteServiceRequestPacket());
  assert.equal(serviceRequest?.logCode, QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE);
  assert.equal(serviceRequest?.version, "1 (9.5.0)");
  assert.equal(serviceRequest?.direction, "UL");
  assert.equal(serviceRequest?.channel, "EMM");
  assert.equal(serviceRequest?.pduType, "Service Request");
  assert.equal(serviceRequest?.payloadBytes, 4);
  assert.deepEqual(serviceRequest?.metadata, {
    packetVersion: 1,
    protocolVersionMajor: 9,
    protocolVersionMinor: 5,
    protocolVersionRevision: 0,
    securityHeaderType: 12,
    protocolDiscriminator: 7,
  });

  const tauRequest = decodeQualcommSignaling(createLteTauRequestPacket());
  assert.equal(tauRequest?.direction, "UL");
  assert.equal(tauRequest?.pduType, "Tracking Area Update Request");
  assert.equal(tauRequest?.metadata.messageType, 0x48);

  const tauAccept = decodeQualcommSignaling(createLteTauAcceptPacket());
  assert.equal(tauAccept?.logCode, QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE);
  assert.equal(tauAccept?.direction, "DL");
  assert.equal(tauAccept?.pduType, "Tracking Area Update Accept");
  assert.equal(tauAccept?.metadata.messageType, 0x49);
});

void test("decodes the exact empty NAS envelope without reading a message byte", () => {
  const packet = fromHex("1000edb0000000000000000001090500");

  assert.deepEqual(decodeQualcommSignaling(packet), {
    packetLength: 16,
    logCode: QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE,
    version: "1 (9.5.0)",
    rat: "LTE",
    layer: "NAS",
    direction: "UL",
    channel: null,
    pduType: null,
    pduId: null,
    pci: null,
    channelNumber: null,
    rbid: null,
    payloadBytes: 0,
    payload: new Uint8Array(),
    metadata: {
      packetVersion: 1,
      protocolVersionMajor: 9,
      protocolVersionMinor: 5,
      protocolVersionRevision: 0,
      securityHeaderType: 0,
      protocolDiscriminator: 0,
    },
  });
});

void test("does not name a NAS message behind a nonzero security header", () => {
  const packet = fromHex("1200edb00000000000000000010905001748");

  assert.deepEqual(decodeQualcommSignaling(packet), {
    packetLength: 18,
    logCode: QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE,
    version: "1 (9.5.0)",
    rat: "LTE",
    layer: "NAS",
    direction: "UL",
    channel: "EMM",
    pduType: null,
    pduId: null,
    pci: null,
    channelNumber: null,
    rbid: null,
    payloadBytes: 2,
    payload: fromHex("1748"),
    metadata: {
      packetVersion: 1,
      protocolVersionMajor: 9,
      protocolVersionMinor: 5,
      protocolVersionRevision: 0,
      securityHeaderType: 1,
      protocolDiscriminator: 7,
    },
  });
});

void test("preserves an unknown plain NAS message without inventing a name", () => {
  const packet = createLteServiceRequestPacket();
  packet[16] = 0x07;
  packet[17] = 0xff;

  const decoded = decodeQualcommSignaling(packet);
  assert.equal(decoded?.channel, "EMM");
  assert.equal(decoded?.pduType, null);
  assert.equal(decoded?.metadata.messageType, 0xff);
});

void test("returns null without throwing for unsupported or truncated NAS envelopes", () => {
  const wrongVersion = createLteServiceRequestPacket();
  wrongVersion[12] = 2;
  assert.equal(decodeQualcommSignaling(wrongVersion), null);

  const packet = createLteServiceRequestPacket();
  for (let length = 0; length < packet.length; length++)
    assert.doesNotThrow(() => assert.equal(decodeQualcommSignaling(packet.subarray(0, length)), null));
});
