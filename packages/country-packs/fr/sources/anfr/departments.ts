const DEPARTMENTS_BY_REGION: Readonly<Record<string, readonly string[]>> = {
  "FR-ARA": ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
  "FR-BFC": ["21", "25", "39", "58", "70", "71", "89", "90"],
  "FR-BRE": ["22", "29", "35", "56"],
  "FR-CVL": ["18", "28", "36", "37", "41", "45"],
  "FR-COR": ["2A", "2B"],
  "FR-GES": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  "FR-HDF": ["02", "59", "60", "62", "80"],
  "FR-IDF": ["75", "77", "78", "91", "92", "93", "94", "95"],
  "FR-NOR": ["14", "27", "50", "61", "76"],
  "FR-NAQ": ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
  "FR-OCC": ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
  "FR-PDL": ["44", "49", "53", "72", "85"],
  "FR-PAC": ["04", "05", "06", "13", "83", "84"],
};

const OVERSEAS_DEPARTMENTS: readonly string[] = ["971", "972", "973", "974", "975", "976", "977", "978", "986", "987", "988"];
export const UNKNOWN_DEPARTMENT_SLICE = "other";

const REGION_BY_DEPARTMENT = new Map(
  Object.entries(DEPARTMENTS_BY_REGION).flatMap(([region, departments]) => departments.map((department) => [department, region] as const)),
);

const METROPOLITAN_DEPARTMENTS: readonly string[] = [...REGION_BY_DEPARTMENT.keys()].sort();
export const DEPARTMENT_SLICES: readonly string[] = [...METROPOLITAN_DEPARTMENTS, ...OVERSEAS_DEPARTMENTS, UNKNOWN_DEPARTMENT_SLICE];

export function departmentOf(published: string): string {
  const code = published.trim().toUpperCase();
  return code.length === 3 && code.startsWith("0") ? code.slice(1) : code;
}

export function regionIsoCodeOf(department: string): string | null {
  return REGION_BY_DEPARTMENT.get(department) ?? null;
}
