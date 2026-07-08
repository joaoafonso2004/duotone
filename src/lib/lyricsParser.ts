export interface LyricLine {
  timeMs: number;
  text: string;
}

export function parseLrc(lrc: string): LyricLine[] {
  if (!lrc) return [];
  const lines = lrc.split('\n');
  const result: LyricLine[] = [];
  for (const line of lines) {
    const match = line.trim().match(/^\[(\d+):(\d+)(?:\.(\d+))?\](.*)/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millisecondsStr = match[3] || '0';
      const milliseconds = parseInt(millisecondsStr.padEnd(3, '0').slice(0, 3), 10);
      const timeMs = minutes * 60 * 1000 + seconds * 1000 + milliseconds;
      const text = match[4].trim();
      result.push({ timeMs, text });
    }
  }
  return result.sort((a, b) => a.timeMs - b.timeMs);
}
