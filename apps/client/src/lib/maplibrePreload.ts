const MAPLIBRE_FOLDER = import.meta.env.VITE_MAPLIBRE_FOLDER as string;
const MAPLIBRE_MODULES = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs"];

export function preloadMaplibre(): void {
  if (!import.meta.env.PROD) return;

  for (const file of MAPLIBRE_MODULES) {
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = `${MAPLIBRE_FOLDER}${file}`;
    document.head.append(link);
  }
}
