import type { Ref } from "react";

import { cn } from "@/lib/utils";

const VIEW_SIZE = 208;
const CENTER = VIEW_SIZE / 2;
const RIM_RADIUS = 58;
const INNER_RING_RADIUS = RIM_RADIUS / 2;
const CENTER_DOT_RADIUS = 3;
const NORTH_LETTER_RADIUS = RIM_RADIUS + 13;
const NORTH_LETTER_BASELINE_SHIFT = 3.5;
const UNLABELED_VIEW_RADIUS = NORTH_LETTER_RADIUS + 7;
const WEDGE_HALF_ANGLE = 13;
const OMNIDIRECTIONAL_RADIUS = 21;
const OMNIDIRECTIONAL_LABEL_DISTANCE = OMNIDIRECTIONAL_RADIUS + 14;
const TICK_COUNT = 12;
const TICK_LENGTH = 3;
const CARDINAL_TICK_LENGTH = 6;
const CARDINAL_STEP = 90;
const FULL_TURN = 360;
const LABEL_RADIUS = 88;
const LABEL_MIN_GAP = 24;
const LABEL_SPREAD_PASSES = 48;
const MARK_SIZE = 18;
const MARK_WEDGE_PATH = "M9 9L5.95 2.15A7.5 7.5 0 0 1 12.05 2.15Z";

const SHAPE_LOOKS = {
  plain: { fillOpacity: 0.3, strokeOpacity: 1 },
  selected: { fillOpacity: 0.62, strokeOpacity: 0 },
  dimmed: { fillOpacity: 0.12, strokeOpacity: 0.45 },
} as const;

const SHAPE_CLASS = "transition-[fill-opacity,stroke-opacity] duration-150 motion-reduce:transition-none";
const SELECTION_OUTLINE_CLASS = "fill-none stroke-foreground transition-opacity duration-150 motion-reduce:transition-none";
const LABEL_CLASS = cn(
  "absolute inline-flex h-5 min-w-[34px] -translate-x-1/2 -translate-y-1/2 items-center justify-center",
  "rounded-md px-1 text-[11.5px] font-semibold leading-none whitespace-nowrap tabular-nums",
);
const LABEL_BUTTON_CLASS = cn(
  "cursor-pointer outline-none transition-colors motion-reduce:transition-none",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
);
const LABEL_LOOK_CLASSES: Record<ShapeLook, string> = {
  plain: "text-foreground hover:bg-foreground/10",
  selected: "bg-primary text-primary-foreground",
  dimmed: "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
};

const TICKS = Array.from({ length: TICK_COUNT }, (_, index) => {
  const azimuth = (index * FULL_TURN) / TICK_COUNT;
  const length = azimuth % CARDINAL_STEP === 0 ? CARDINAL_TICK_LENGTH : TICK_LENGTH;
  return { azimuth, from: getCompassPoint(azimuth, RIM_RADIUS), to: getCompassPoint(azimuth, RIM_RADIUS + length) };
});
const NORTH_LETTER = getCompassPoint(0, NORTH_LETTER_RADIUS);

type ShapeLook = keyof typeof SHAPE_LOOKS;
type CompassPoint = { x: number; y: number };
type LabelSlot = { index: number; angle: number };

type AzimuthCompassDirection = {
  azimuth: number | null;
  name: string;
  text?: string;
};

type AzimuthCompassProps = {
  directions: readonly AzimuthCompassDirection[];
  color?: string;
  hideLabels?: boolean;
  selectedAzimuth?: number | null;
  onSelectedAzimuthChange?: (azimuth: number | null | undefined) => void;
  selectedLabelRef?: Ref<HTMLButtonElement>;
  className?: string;
};

type AzimuthCompassMarkProps = {
  azimuth?: number | null;
  color: string;
};

type CompassShapeProps = {
  azimuth: number | null;
  color?: string;
  look: ShapeLook;
};

type CompassSelectionOutlineProps = {
  azimuth: number | null;
  isShown: boolean;
};

type CompassEntry = {
  key: string;
  direction: AzimuthCompassDirection;
  text: string;
  look: ShapeLook;
  labelPoint: CompassPoint;
};

type CompassLabelsProps = {
  entries: readonly CompassEntry[];
  onSelectedAzimuthChange?: (azimuth: number | null | undefined) => void;
  selectedLabelRef?: Ref<HTMLButtonElement>;
};

type CompassLabelButtonProps = {
  entry: CompassEntry;
  onSelectedAzimuthChange: (azimuth: number | null | undefined) => void;
  selectedLabelRef?: Ref<HTMLButtonElement>;
};

function getCompassPoint(azimuth: number, radius: number): CompassPoint {
  const radians = (azimuth * Math.PI) / 180;
  return { x: CENTER + Math.sin(radians) * radius, y: CENTER - Math.cos(radians) * radius };
}

function getWedgePath(azimuth: number): string {
  const from = getCompassPoint(azimuth - WEDGE_HALF_ANGLE, RIM_RADIUS);
  const to = getCompassPoint(azimuth + WEDGE_HALF_ANGLE, RIM_RADIUS);
  return `M ${CENTER} ${CENTER} L ${from.x} ${from.y} A ${RIM_RADIUS} ${RIM_RADIUS} 0 0 1 ${to.x} ${to.y} Z`;
}

function normalizeAzimuth(azimuth: number): number {
  return ((azimuth % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

function spreadLabelAngles(azimuths: readonly (number | null)[]): (number | null)[] {
  const slots: LabelSlot[] = azimuths
    .flatMap((azimuth, index) => (azimuth === null ? [] : [{ index, angle: normalizeAzimuth(azimuth) }]))
    .sort((left, right) => left.angle - right.angle);
  const minGap = Math.min(LABEL_MIN_GAP, FULL_TURN / Math.max(slots.length, 1));

  for (let pass = 0; pass < LABEL_SPREAD_PASSES; pass += 1) {
    for (let position = 0; position < slots.length; position += 1) {
      const nextPosition = (position + 1) % slots.length;
      if (nextPosition === position) continue;

      const slot = slots[position];
      const nextSlot = slots[nextPosition];
      const gap = nextSlot.angle + (nextPosition === 0 ? FULL_TURN : 0) - slot.angle;
      if (gap >= minGap) continue;

      const shift = (minGap - gap) / 2;
      slot.angle -= shift;
      nextSlot.angle += shift;
    }
  }

  const angles: (number | null)[] = azimuths.map(() => null);
  for (const slot of slots) angles[slot.index] = slot.angle;
  return angles;
}

function getLabelPoint(angle: number | null): CompassPoint {
  if (angle === null) return { x: CENTER, y: CENTER + OMNIDIRECTIONAL_LABEL_DISTANCE };
  return getCompassPoint(angle, LABEL_RADIUS);
}

function getLabelPosition(point: CompassPoint) {
  return { left: `${(point.x / VIEW_SIZE) * 100}%`, top: `${(point.y / VIEW_SIZE) * 100}%` };
}

function getShapeLook(azimuth: number | null, selectedAzimuth: number | null | undefined): ShapeLook {
  if (selectedAzimuth === undefined) return "plain";
  return azimuth === selectedAzimuth ? "selected" : "dimmed";
}

function getViewBox(radius: number): string {
  const edge = CENTER - radius;
  return `${edge} ${edge} ${radius * 2} ${radius * 2}`;
}

function listDistinctDirections(directions: readonly AzimuthCompassDirection[]): AzimuthCompassDirection[] {
  return directions.filter((direction, index) => directions.findIndex((other) => other.azimuth === direction.azimuth) === index);
}

export function AzimuthCompass({
  directions,
  color,
  hideLabels = false,
  selectedAzimuth,
  onSelectedAzimuthChange,
  selectedLabelRef,
  className,
}: AzimuthCompassProps) {
  const distinctDirections = listDistinctDirections(directions);
  const labelAngles = spreadLabelAngles(distinctDirections.map((direction) => direction.azimuth));
  const entries = distinctDirections.map((direction, index) => ({
    key: String(direction.azimuth ?? "omnidirectional"),
    direction,
    text: direction.text ?? direction.name,
    look: getShapeLook(direction.azimuth, selectedAzimuth),
    labelPoint: getLabelPoint(labelAngles[index]),
  }));
  const drawsSelection = selectedAzimuth !== undefined || onSelectedAzimuthChange !== undefined;

  return (
    <div className={cn("relative size-52 shrink-0", className)}>
      <svg viewBox={getViewBox(hideLabels ? UNLABELED_VIEW_RADIUS : CENTER)} aria-hidden="true" className="block size-full overflow-visible">
        <circle cx={CENTER} cy={CENTER} r={RIM_RADIUS} className="fill-foreground/5 stroke-border" />
        <circle cx={CENTER} cy={CENTER} r={INNER_RING_RADIUS} className="fill-none stroke-border/60" />
        {TICKS.map((tick) => (
          <line key={tick.azimuth} x1={tick.from.x} y1={tick.from.y} x2={tick.to.x} y2={tick.to.y} className="stroke-muted-foreground/70" />
        ))}
        <text
          x={NORTH_LETTER.x}
          y={NORTH_LETTER.y + NORTH_LETTER_BASELINE_SHIFT}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          className="fill-muted-foreground"
        >
          N
        </text>
        {entries.map((entry) => (
          <CompassShape key={entry.key} azimuth={entry.direction.azimuth} color={color} look={entry.look} />
        ))}
        {drawsSelection
          ? entries.map((entry) => <CompassSelectionOutline key={entry.key} azimuth={entry.direction.azimuth} isShown={entry.look === "selected"} />)
          : null}
        <circle cx={CENTER} cy={CENTER} r={CENTER_DOT_RADIUS} className="fill-foreground" />
      </svg>
      {hideLabels ? null : <CompassLabels entries={entries} onSelectedAzimuthChange={onSelectedAzimuthChange} selectedLabelRef={selectedLabelRef} />}
    </div>
  );
}

export function AzimuthCompassMark({ azimuth, color }: AzimuthCompassMarkProps) {
  return (
    <svg width={MARK_SIZE} height={MARK_SIZE} viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`} aria-hidden="true" className="block shrink-0">
      <circle cx="9" cy="9" r="7.5" className="fill-foreground/5 stroke-input" />
      {typeof azimuth === "number" ? <path d={MARK_WEDGE_PATH} fill={color} transform={`rotate(${azimuth} 9 9)`} /> : null}
      {azimuth === null ? <circle cx="9" cy="9" r="4" fill="none" stroke={color} strokeWidth="1.5" /> : null}
      <circle cx="9" cy="9" r="1.25" className="fill-foreground" />
    </svg>
  );
}

function CompassShape({ azimuth, color, look }: CompassShapeProps) {
  const className = cn(SHAPE_CLASS, color === undefined ? "fill-primary stroke-primary" : null);

  if (azimuth === null) {
    return (
      <circle
        cx={CENTER}
        cy={CENTER}
        r={OMNIDIRECTIONAL_RADIUS}
        fill={color}
        stroke={color}
        strokeWidth="1.5"
        style={SHAPE_LOOKS[look]}
        className={className}
      />
    );
  }

  return <path d={getWedgePath(azimuth)} fill={color} stroke={color} strokeLinejoin="round" style={SHAPE_LOOKS[look]} className={className} />;
}

function CompassSelectionOutline({ azimuth, isShown }: CompassSelectionOutlineProps) {
  const className = cn(SELECTION_OUTLINE_CLASS, isShown ? "opacity-100" : "opacity-0");

  if (azimuth === null) return <circle cx={CENTER} cy={CENTER} r={OMNIDIRECTIONAL_RADIUS} strokeWidth="1.5" className={className} />;

  return <path d={getWedgePath(azimuth)} strokeLinejoin="round" className={className} />;
}

function CompassLabels({ entries, onSelectedAzimuthChange, selectedLabelRef }: CompassLabelsProps) {
  if (onSelectedAzimuthChange !== undefined) {
    return (
      <>
        {entries.map((entry) => (
          <CompassLabelButton key={entry.key} entry={entry} onSelectedAzimuthChange={onSelectedAzimuthChange} selectedLabelRef={selectedLabelRef} />
        ))}
      </>
    );
  }

  return (
    <>
      {entries.map((entry) => (
        <span key={entry.key} aria-hidden="true" style={getLabelPosition(entry.labelPoint)} className={cn(LABEL_CLASS, "text-foreground")}>
          {entry.text}
        </span>
      ))}
      <ul className="sr-only">
        {entries.map((entry) => (
          <li key={entry.key}>{entry.direction.name}</li>
        ))}
      </ul>
    </>
  );
}

function CompassLabelButton({ entry, onSelectedAzimuthChange, selectedLabelRef }: CompassLabelButtonProps) {
  const isSelected = entry.look === "selected";

  return (
    <button
      ref={isSelected ? selectedLabelRef : undefined}
      type="button"
      aria-pressed={isSelected}
      aria-label={entry.direction.name}
      style={getLabelPosition(entry.labelPoint)}
      className={cn(LABEL_CLASS, LABEL_BUTTON_CLASS, LABEL_LOOK_CLASSES[entry.look])}
      onClick={() => onSelectedAzimuthChange(isSelected ? undefined : entry.direction.azimuth)}
    >
      {entry.text}
    </button>
  );
}
