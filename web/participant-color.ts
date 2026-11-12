const participantPalette = [
  "#67d6ed", "#f28ab9", "#f2c569", "#ad9af2",
  "#8fdbab", "#ffa478", "#92b5fb", "#ef8c89",
];

export function participantColors(ids: readonly string[], room: string): ReadonlyMap<string, string> {
  const participants = [...new Set(ids)].sort();
  const seed = parseInt(room.slice(0, 8), 16) || 0;
  const paletteSize = participantPalette.length;
  return new Map(participants.map((id, index) => {
    const color = participants.length <= paletteSize
      ? participantPalette[(seed + index) % paletteSize]!
      : `hsl(${(seed + index * 360 / participants.length) % 360} 78% 73%)`;
    return [id, color];
  }));
}

export function participantColor(participant: string, colors: ReadonlyMap<string, string>) {
  return colors.get(participant) ?? "var(--text)";
}
