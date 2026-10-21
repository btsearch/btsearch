export const CID_RANGE = 65_536;

export type NodeIds = { enbid: number | null; gnbid: number | null; longCid: number | null; gsmCellKey: number | null };

function toCellPair(key: number): string {
  return `${Math.floor(key / CID_RANGE)}:${key % CID_RANGE}`;
}

export function toNodeName({ enbid, gnbid, longCid, gsmCellKey }: NodeIds): string | null {
  if (enbid !== null) return `4G ${enbid}`;
  if (gnbid !== null) return `5G ${gnbid}`;
  if (longCid !== null) return `3G ${toCellPair(longCid)}`;
  if (gsmCellKey !== null) return `2G ${toCellPair(gsmCellKey)}`;
  return null;
}
