import type { MeasurementReadingBlock } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";

import { deviceModelsByIdsQueryOptions, readerVersionsQueryOptions, socsQueryOptions } from "../api/readingBlocks";
import { mapById } from "../utils/mapById";
import type { BlockLookups } from "./blockText";

function listBlockedModelIds(blocks: readonly MeasurementReadingBlock[] | undefined): number[] {
  return (blocks ?? []).flatMap((block) => ("deviceModelId" in block.phones ? [block.phones.deviceModelId] : []));
}

export function useBlockLookups(blocks: readonly MeasurementReadingBlock[] | undefined): BlockLookups {
  const { data: socs } = useQuery(socsQueryOptions());
  const { data: readerVersions } = useQuery(readerVersionsQueryOptions());
  const { data: models } = useQuery(deviceModelsByIdsQueryOptions(listBlockedModelIds(blocks)));

  return { socs: mapById(socs), models: mapById(models), readerVersions: mapById(readerVersions) };
}
