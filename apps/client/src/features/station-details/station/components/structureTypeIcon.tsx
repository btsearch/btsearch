import {
  AirportTowerIcon,
  AntennaIcon,
  BarnsIcon,
  BerlinTowerIcon,
  CaravanIcon,
  CellularNetworkIcon,
  ChimneyIcon,
  ChurchIcon,
  Door01Icon,
  ElectricTower01Icon,
  Home03Icon,
  PolyTankIcon,
  RadioTowerIcon,
  TrainFrontTunnelIcon,
  UtilityPoleIcon,
  WashingtonMonumentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import type { StructureType } from "../types";

type StructureTypeIconProps = {
  type: StructureType;
  className?: string;
};

const STRUCTURE_TYPE_ICONS: Record<StructureType, IconSvgElement> = {
  latticeTower: ElectricTower01Icon,
  tubularTower: WashingtonMonumentIcon,
  concreteTower: BerlinTowerIcon,
  tower: AirportTowerIcon,
  mast: RadioTowerIcon,
  rooftopMast: AntennaIcon,
  rooftop: Home03Icon,
  chimney: ChimneyIcon,
  church: ChurchIcon,
  waterTower: PolyTankIcon,
  silo: BarnsIcon,
  pole: UtilityPoleIcon,
  mobileMast: CaravanIcon,
  tunnel: TrainFrontTunnelIcon,
  indoor: Door01Icon,
  other: CellularNetworkIcon,
};

export function StructureTypeIcon({ type, className }: StructureTypeIconProps) {
  return <HugeiconsIcon icon={STRUCTURE_TYPE_ICONS[type]} className={className} aria-hidden="true" />;
}
