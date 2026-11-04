import {
  AdvertisimentIcon,
  AirportTowerIcon,
  AntennaIcon,
  BarnsIcon,
  BerlinTowerIcon,
  Building03Icon,
  CaravanIcon,
  CastleIcon,
  ChimneyIcon,
  ChurchIcon,
  Door01Icon,
  ElectricTower01Icon,
  Home03Icon,
  InternetAntenna01Icon,
  PolyTankIcon,
  RadioTowerIcon,
  SpotlightIcon,
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
  buildingTower: CastleIcon,
  facade: Building03Icon,
  chimney: ChimneyIcon,
  church: ChurchIcon,
  waterTower: PolyTankIcon,
  floodlightTower: SpotlightIcon,
  silo: BarnsIcon,
  pole: UtilityPoleIcon,
  advertisingPylon: AdvertisimentIcon,
  relocatableMast: InternetAntenna01Icon,
  mobileMast: CaravanIcon,
  tunnel: TrainFrontTunnelIcon,
  indoor: Door01Icon,
};

export function StructureTypeIcon({ type, className }: StructureTypeIconProps) {
  return <HugeiconsIcon icon={STRUCTURE_TYPE_ICONS[type]} className={className} aria-hidden="true" />;
}
