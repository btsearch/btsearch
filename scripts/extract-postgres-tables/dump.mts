export type QualifiedName = {
  schema: string;
  name: string;
};

export type DumpObjectHeader = QualifiedName & {
  type: string;
};

export type BufferedBlock = {
  header: DumpObjectHeader;
  lines: string[];
};

const identifierPattern = String.raw`(?:"((?:[^"]|"")*)"|([A-Za-z_][A-Za-z0-9_$]*))`;
const qualifiedNamePattern = `${identifierPattern}\\.${identifierPattern}`;

export function parseSimpleQualifiedName(value: string, fallbackSchema?: string): QualifiedName {
  const parts = value.split(".");
  if (parts.length === 1 && fallbackSchema !== undefined) {
    const [name] = parts;
    if (name === undefined) throw new Error(`Invalid name: ${value}`);

    return { schema: fallbackSchema, name };
  }

  if (parts.length !== 2) throw new Error(`Expected schema.name, received: ${value}`);

  const [schema, name] = parts;
  if (schema === undefined || name === undefined) throw new Error(`Invalid qualified name: ${value}`);

  return { schema, name };
}

export function qualifiedNameKey(name: QualifiedName): string {
  return `${name.schema}\u0000${name.name}`;
}

export function displayQualifiedName(name: QualifiedName): string {
  return `${name.schema}.${name.name}`;
}

function decodeIdentifier(quoted: string | undefined, bare: string | undefined): string {
  if (bare !== undefined) return bare;
  if (quoted === undefined) throw new Error("Invalid SQL identifier");

  return quoted.replaceAll('""', '"');
}

function qualifiedNameFromMatch(match: RegExpMatchArray, offset = 1): QualifiedName {
  return {
    schema: decodeIdentifier(match[offset], match[offset + 1]),
    name: decodeIdentifier(match[offset + 2], match[offset + 3]),
  };
}

export function parseObjectHeader(line: string): DumpObjectHeader | undefined {
  const match = line.match(/^-- (?:Data for )?Name: (.*); Type: ([^;]+); Schema: ([^;]+); Owner: .*$/);
  if (match === null) return undefined;

  const [, name, type, schema] = match;
  if (name === undefined || type === undefined || schema === undefined) return undefined;

  return { name, type, schema };
}

export function findOwningTable(sql: string): QualifiedName | undefined {
  const patterns = [
    new RegExp(`ALTER\\s+TABLE(?:\\s+ONLY)?\\s+${qualifiedNamePattern}`, "i"),
    new RegExp(`CREATE(?:\\s+UNIQUE)?\\s+INDEX[\\s\\S]*?\\s+ON(?:\\s+ONLY)?\\s+${qualifiedNamePattern}`, "i"),
    new RegExp(`CREATE\\s+TRIGGER[\\s\\S]*?\\s+ON\\s+${qualifiedNamePattern}`, "i"),
    new RegExp(`CREATE\\s+POLICY[\\s\\S]*?\\s+ON\\s+${qualifiedNamePattern}`, "i"),
    new RegExp(`COMMENT\\s+ON\\s+(?:TABLE|COLUMN)\\s+${qualifiedNamePattern}`, "i"),
    new RegExp(`OWNED\\s+BY\\s+${qualifiedNamePattern}\\.${identifierPattern}`, "i"),
  ];

  for (const pattern of patterns) {
    const match = sql.match(pattern);
    if (match !== null) return qualifiedNameFromMatch(match);
  }

  return undefined;
}

export function findReferencedTables(sql: string): QualifiedName[] {
  const pattern = new RegExp(`REFERENCES\\s+${qualifiedNamePattern}`, "gi");
  const references: QualifiedName[] = [];

  for (const match of sql.matchAll(pattern)) references.push(qualifiedNameFromMatch(match));

  return references;
}

export function findIdentitySequences(sql: string): QualifiedName[] {
  const identityPattern = new RegExp(`SEQUENCE\\s+NAME\\s+${qualifiedNamePattern}`, "gi");
  const nextValuePattern = new RegExp(`nextval\\('((?:''|[^'])+)'::regclass\\)`, "gi");
  const sequences: QualifiedName[] = [];

  for (const match of sql.matchAll(identityPattern)) sequences.push(qualifiedNameFromMatch(match));

  for (const match of sql.matchAll(nextValuePattern)) {
    const capturedValue = match[1];
    if (capturedValue === undefined) continue;

    const parts = capturedValue.replaceAll("''", "'").split(".");
    const [schema, name] = parts;
    if (parts.length === 2 && schema !== undefined && name !== undefined)
      sequences.push({ schema: schema.replaceAll('"', ""), name: name.replaceAll('"', "") });
  }

  return sequences;
}

export function sqlMentionsQualifiedName(sql: string, name: QualifiedName): boolean {
  const escapedSchema = name.schema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedName = name.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bare = new RegExp(`\\b${escapedSchema}\\.${escapedName}\\b`);
  const quoted = `"${name.schema.replaceAll('"', '""')}"."${name.name.replaceAll('"', '""')}"`;

  return bare.test(sql) || sql.includes(quoted);
}

export function isOwnerStatement(line: string): boolean {
  return /^ALTER .+ OWNER TO .+;$/.test(line);
}
