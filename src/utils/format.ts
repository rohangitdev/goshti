const MARATHI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

export function toMarathiDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => MARATHI_DIGITS[Number(d)]);
}

/** 125 → "२:०५" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = String(s % 60).padStart(2, '0');
  return toMarathiDigits(`${minutes}:${seconds}`);
}

/** Approximate "N मिनिटं" label for lists. */
export function formatMinutes(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  return `${toMarathiDigits(minutes)} ${minutes === 1 ? 'मिनिट' : 'मिनिटं'}`;
}
