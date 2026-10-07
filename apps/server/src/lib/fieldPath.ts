export function toFieldPath(path: readonly PropertyKey[]): string {
  return path.map(String).join("/");
}
