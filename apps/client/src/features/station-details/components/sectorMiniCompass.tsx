import { memo } from "react";

import { cn } from "@/lib/utils";
import type { Sector } from "@/types/station";

const DIAGRAM_CENTER = 64;
const DIAGRAM_RADIUS = 55;
const SECTOR_RADIUS = 48;
const LABEL_RADIUS_SCALE = 0.55;
const OMNIDIRECTIONAL_RADIUS_SCALE = 0.5;
const OMNIDIRECTIONAL_AZIMUTH = 360;
const SECTOR_HALF_ANGLE = 20;
const TICK_AZIMUTHS = Array.from({ length: 24 }, (_, index) => index * 15);
const CARDINALS = [
  { label: "N", x: DIAGRAM_CENTER, y: 19 },
  { label: "E", x: 109, y: DIAGRAM_CENTER },
  { label: "S", x: DIAGRAM_CENTER, y: 109 },
  { label: "W", x: 19, y: DIAGRAM_CENTER },
] as const;

type AzimuthDiagramSector = {
  azimuth: number;
};

type AzimuthDiagramProps = {
  sectors: readonly AzimuthDiagramSector[];
  className?: string;
};

function getDiagramPoint(azimuth: number, radius: number) {
  const radians = (azimuth * Math.PI) / 180;
  return {
    x: DIAGRAM_CENTER + Math.sin(radians) * radius,
    y: DIAGRAM_CENTER - Math.cos(radians) * radius,
  };
}

function getSectorPath(azimuth: number) {
  const left = getDiagramPoint(azimuth - SECTOR_HALF_ANGLE, SECTOR_RADIUS);
  const right = getDiagramPoint(azimuth + SECTOR_HALF_ANGLE, SECTOR_RADIUS);
  return `M ${DIAGRAM_CENTER} ${DIAGRAM_CENTER} L ${left.x} ${left.y} A ${SECTOR_RADIUS} ${SECTOR_RADIUS} 0 0 1 ${right.x} ${right.y} Z`;
}

function isOmnidirectionalAzimuth(azimuth: number) {
  return azimuth === OMNIDIRECTIONAL_AZIMUTH;
}

function getPlottedAzimuths(sectors: readonly AzimuthDiagramSector[]) {
  return [...new Set(sectors.map((sector) => sector.azimuth))];
}

export function AzimuthDiagram({ sectors, className }: AzimuthDiagramProps) {
  const plottedAzimuths = getPlottedAzimuths(sectors);

  return (
    <div className={cn("relative aspect-square shrink-0", className)}>
      <svg className="size-full overflow-visible" viewBox="0 0 128 128" aria-hidden="true">
        <circle cx={DIAGRAM_CENTER} cy={DIAGRAM_CENTER} r={DIAGRAM_RADIUS} className="fill-background stroke-border" strokeWidth="1" />
        <circle cx={DIAGRAM_CENTER} cy={DIAGRAM_CENTER} r="41" className="fill-none stroke-border/60" strokeWidth="0.75" />
        <path d="M 64 26 V 102 M 26 64 H 102" className="fill-none stroke-border/60" strokeWidth="0.75" />

        {TICK_AZIMUTHS.map((azimuth) => {
          const isMajorTick = azimuth % 30 === 0;
          const start = getDiagramPoint(azimuth, DIAGRAM_RADIUS);
          const end = getDiagramPoint(azimuth, isMajorTick ? 50 : 52);

          return (
            <line
              key={azimuth}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className={isMajorTick ? "stroke-foreground/45" : "stroke-border"}
              strokeWidth={isMajorTick ? 1.25 : 0.75}
              strokeLinecap="round"
            />
          );
        })}

        {plottedAzimuths.map((azimuth) => {
          const isOmnidirectional = isOmnidirectionalAzimuth(azimuth);
          const renderedRadius = isOmnidirectional ? SECTOR_RADIUS * OMNIDIRECTIONAL_RADIUS_SCALE : SECTOR_RADIUS;
          const label = getDiagramPoint(azimuth, renderedRadius * LABEL_RADIUS_SCALE);

          return (
            <g key={azimuth}>
              {isOmnidirectional ? (
                <circle
                  cx={DIAGRAM_CENTER}
                  cy={DIAGRAM_CENTER}
                  r={SECTOR_RADIUS * OMNIDIRECTIONAL_RADIUS_SCALE}
                  className="fill-primary/15 stroke-primary"
                  strokeWidth="1.25"
                />
              ) : (
                <path d={getSectorPath(azimuth)} className="fill-primary/15 stroke-primary/70" strokeWidth="1" strokeLinejoin="round" />
              )}
              <text
                x={label.x}
                y={label.y}
                fill="#111111"
                stroke="rgba(255, 255, 255, 0.9)"
                strokeWidth="2"
                paintOrder="stroke"
                fontSize="7.5"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {azimuth}°
              </text>
            </g>
          );
        })}

        <circle cx={DIAGRAM_CENTER} cy={DIAGRAM_CENTER} r="3" className="fill-background stroke-primary" strokeWidth="1.25" />
        <circle cx={DIAGRAM_CENTER} cy={DIAGRAM_CENTER} r="0.9" className="fill-primary" />

        {CARDINALS.map((cardinal) => (
          <text
            key={cardinal.label}
            x={cardinal.x}
            y={cardinal.y}
            className="fill-muted-foreground stroke-background"
            strokeWidth="2"
            paintOrder="stroke"
            fontSize="6.5"
            fontWeight="700"
            letterSpacing="0.08em"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {cardinal.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function SectorMiniCompassComponent({ sectors }: { sectors: Sector[] }) {
  return <AzimuthDiagram sectors={sectors} className="size-56 sm:size-60" />;
}

export const SectorMiniCompass = memo(SectorMiniCompassComponent);
