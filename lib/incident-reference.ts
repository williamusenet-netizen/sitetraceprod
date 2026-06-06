export function formatIncidentReference(id: string) {
  return `FT-${id.slice(0, 8).toUpperCase()}`;
}
