import type { NsgSignalingDirection } from "../../../model";

export type RrcLayout = Readonly<{
  messageOffset: number;
  messageLengthOffset: number;
  segmentIdOffset: number | null;
}>;

export type RrcPdu = Readonly<{
  direction: NsgSignalingDirection;
  channel: string | null;
  pduType: string | null;
}>;

export type RrcPduMap = Readonly<Partial<Record<number, RrcPdu>>>;

export type RrcProfile<Layout extends RrcLayout> = Readonly<{
  layout: Layout;
  pduMap: RrcPduMap;
}>;

export type VersionedRrcProfile<Layout extends RrcLayout> = RrcProfile<Layout> & Readonly<{ version: number }>;

export const UNKNOWN_RRC_PDU: RrcPdu = Object.freeze({ direction: "unknown", channel: null, pduType: null });

export function nullableIdentity(value: number, unavailable: number): number | null {
  return value === unavailable ? null : value;
}

export function hasValidRrcEnvelope<Layout extends RrcLayout>(
  packetLength: number,
  view: DataView,
  profile: VersionedRrcProfile<Layout> | null,
): profile is VersionedRrcProfile<Layout> {
  const layout = profile?.layout;
  return (
    layout !== undefined &&
    packetLength >= layout.messageOffset &&
    view.byteLength >= layout.messageOffset &&
    layout.messageOffset + view.getUint16(layout.messageLengthOffset, true) === packetLength
  );
}
