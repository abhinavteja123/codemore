/**
 * Minimal TTY-aware ANSI colorizer for CLI output. No dependency: hand-rolled
 * because the codebase has no color lib and the need is a handful of codes.
 *
 * Respects NO_COLOR (https://no-color.org) and only colors when stderr is a
 * real terminal, so piped/CI output and --json stdout stay plain.
 */

const supportsColor = Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;

function wrap(code: string): (s: string) => string {
  return supportsColor ? (s: string) => `\x1b[${code}m${s}\x1b[0m` : (s: string) => s;
}

export const color = {
  red: wrap('31'),
  yellow: wrap('33'),
  green: wrap('32'),
  gray: wrap('90'),
  bold: wrap('1'),
  boldRed: wrap('1;31'),
};

export function severityColor(severity: string): (s: string) => string {
  switch (severity) {
    case 'BLOCKER': return color.boldRed;
    case 'CRITICAL': return color.red;
    case 'MAJOR': return color.yellow;
    default: return color.gray;
  }
}

export function scoreColor(score: number): (s: string) => string {
  if (score >= 80) return color.green;
  if (score >= 50) return color.yellow;
  return color.red;
}
