export function isValidLatLng(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}
