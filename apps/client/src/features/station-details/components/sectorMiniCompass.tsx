import { memo } from "react";

import type { Sector } from "@/types/station";

const COMPASS_CENTER = 64;
const COMPASS_LINE_RADIUS = 48;
const COMPASS_SECTOR_RADIUS = COMPASS_CENTER;
const COMPASS_LABEL_RADIUS = Math.round(COMPASS_LINE_RADIUS * 0.6);
const OMNIDIRECTIONAL_AZIMUTH = 360;

const COMPASS_HALF_ANGLE = 20;

function getCompassPoint(azimuth: number, radius: number) {
  const radians = (azimuth * Math.PI) / 180;
  return {
    x: COMPASS_CENTER + Math.sin(radians) * radius,
    y: COMPASS_CENTER - Math.cos(radians) * radius,
  };
}

function getSectorPath(azimuth: number) {
  const left = getCompassPoint(azimuth - COMPASS_HALF_ANGLE, COMPASS_SECTOR_RADIUS);
  const right = getCompassPoint(azimuth + COMPASS_HALF_ANGLE, COMPASS_SECTOR_RADIUS);
  return `M ${COMPASS_CENTER} ${COMPASS_CENTER} L ${left.x} ${left.y} A ${COMPASS_SECTOR_RADIUS} ${COMPASS_SECTOR_RADIUS} 0 0 1 ${right.x} ${right.y} Z`;
}

function isOmnidirectionalAzimuth(azimuth: number) {
  return azimuth === OMNIDIRECTIONAL_AZIMUTH;
}

function SectorMiniCompassComponent({ sectors }: { sectors: Sector[] }) {
  return (
    <div className="relative size-64 rounded-full border bg-background shadow-inner">
      <div className="absolute inset-3 rounded-full border border-dashed border-border" />
      <svg className="absolute inset-0 size-full overflow-visible text-primary" viewBox="0 0 128 128" aria-hidden="true">
        {sectors.map((sector) => {
          const label = getCompassPoint(sector.azimuth, COMPASS_LABEL_RADIUS);
          const isOmnidirectional = isOmnidirectionalAzimuth(sector.azimuth);
          return (
            <g key={sector.id}>
              {isOmnidirectional ? (
                <circle
                  cx={COMPASS_CENTER}
                  cy={COMPASS_CENTER}
                  r={COMPASS_SECTOR_RADIUS - 1}
                  fill="currentColor"
                  fillOpacity={0.2}
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              ) : (
                <path
                  d={getSectorPath(sector.azimuth)}
                  fill="currentColor"
                  fillOpacity={0.25}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              )}
              <text
                x={label.x}
                y={label.y}
                fill="currentColor"
                stroke="hsl(var(--background))"
                strokeWidth={3}
                paintOrder="stroke"
                fontSize="9"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {sector.azimuth}°
              </text>
            </g>
          );
        })}
      </svg>
      <div className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-sm" />
      <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-medium text-muted-foreground">N</span>
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground">S</span>
      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">W</span>
      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">E</span>
    </div>
  );
}

export const SectorMiniCompass = memo(SectorMiniCompassComponent);
