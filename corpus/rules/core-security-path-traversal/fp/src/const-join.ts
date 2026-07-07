/**
 * False-positive fixture for core-security-path-traversal.
 *
 * Every path component is a module-level UPPER_CASE constant or a string
 * literal — no untrusted input, so the rule must NOT fire (v1.3.0
 * constant-only narrowing).
 */
import fs from 'fs';
import path from 'path';

const FIGURES_DIR = 'figures';

export function loadFig3(): string {
  return fs.readFileSync(path.join(FIGURES_DIR, 'fig3_reward_data.json'), 'utf-8');
}
