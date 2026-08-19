import { cn } from "@/lib/utils";

const TECHNOLOGY_BAND_PATTERN = /^(.+?)(\d+)$/;

function groupTechnologyBands(bands: readonly string[]): Map<string, string[]> {
  const technologies = new Map<string, string[]>();

  for (const band of bands) {
    const match = band.match(TECHNOLOGY_BAND_PATTERN);
    const technology = match?.[1] ?? band;
    const value = match?.[2];
    const values = technologies.get(technology) ?? [];
    if (value !== undefined) values.push(value);
    technologies.set(technology, values);
  }

  return technologies;
}

type TechnologySummaryProps = {
  bands: readonly string[];
  className?: string;
  detail?: string;
};

export function TechnologySummary({ bands, className, detail }: TechnologySummaryProps) {
  const technologies = groupTechnologyBands(bands);
  if (technologies.size === 0 && detail === undefined) return null;

  return (
    <div className={cn("mt-1 pl-3.5 text-[11px] leading-4 text-muted-foreground", className)}>
      {[...technologies].map(([technology, values], index) => (
        <span key={technology}>
          {index > 0 ? <span className="mx-1 text-muted-foreground/40">/</span> : null}
          <span className="font-bold text-foreground/70">{technology}</span> <span className="font-mono font-medium">{values.join(" ")}</span>
        </span>
      ))}
      {detail !== undefined ? (
        <>
          {technologies.size > 0 ? <span className="mx-1 text-muted-foreground/40">/</span> : null}
          <span>{detail}</span>
        </>
      ) : null}
    </div>
  );
}
