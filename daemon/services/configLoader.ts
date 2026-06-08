/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console, core-typescript-as-any, core-quality-async-without-await, core-bugs-todo-fixme, core-typescript-non-null-assertion-abuse, core-bugs-loose-equality */
/* Legacy monolith — scheduled for decomposition into per-rule modules under shared/packs/* in Phase 0.1. Quality rules will re-apply per-module after migration. */

/**
 * Configuration Loader for CodeMore
 *
 * Loads project-level configuration from .codemorerc.json files.
 * Supports extends, rule customization, and ignore patterns.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger, sanitizeError } from '../lib/logger';

const logger = createLogger('configLoader');

export interface CodemoreRuleConfig {
  severity?: 'off' | 'info' | 'minor' | 'major' | 'critical' | 'blocker';
  options?: Record<string, unknown>;
}

export interface CodemoreConfigOverride {
  files: string[];
  maxComplexity?: number;
  maxFunctionLength?: number;
  maxParameters?: number;
  maxLineLength?: number;
  rules?: Record<string, 'off' | 'warn' | 'error' | CodemoreRuleConfig>;
}

export interface CodemoreConfig {
  version: string;
  extends?: string;
  rules: Record<string, 'off' | 'warn' | 'error' | CodemoreRuleConfig>;
  ignore: string[];
  maxComplexity: number;
  maxFunctionLength: number;
  maxParameters: number;
  maxLineLength: number;
  ai: {
    enabled: boolean;
    provider?: 'openai' | 'anthropic' | 'gemini' | 'local';
    customInstructions?: string;
  };
  overrides?: CodemoreConfigOverride[];
}

export const DEFAULT_CONFIG: CodemoreConfig = {
  version: '1',
  rules: {},
  ignore: ['node_modules', 'dist', 'build', '.next', 'coverage', '.git'],
  maxComplexity: 10,
  maxFunctionLength: 50,
  maxParameters: 5,
  maxLineLength: 120,
  ai: { enabled: false },
};

const CONFIG_FILES = [
  '.codemorerc.json',
  '.codemorerc',
  'codemorerc.json',
];

/**
 * Load project configuration from workspace root
 */
export async function loadProjectConfig(workspaceRoot: string): Promise<CodemoreConfig> {
  // Try each config file location
  for (const filename of CONFIG_FILES) {
    const configPath = path.join(workspaceRoot, filename);
    if (fs.existsSync(configPath)) {
      try {
        const content = await fs.promises.readFile(configPath, 'utf8');
        const parsed = JSON.parse(content) as Partial<CodemoreConfig>;
        logger.info({ filename }, 'Loaded config from file');
        return mergeConfigs(DEFAULT_CONFIG, parsed);
      } catch (error) {
        logger.error({ err: sanitizeError(error), filename }, 'Failed to parse config file');
      }
    }
  }

  // Check package.json for codemore config
  const packageJsonPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const content = await fs.promises.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(content) as { codemore?: Partial<CodemoreConfig> };
      if (packageJson.codemore) {
        logger.info('Loaded config from package.json#codemore');
        return mergeConfigs(DEFAULT_CONFIG, packageJson.codemore);
      }
    } catch {
      // Ignore package.json parse errors
    }
  }

  // Return default config
  logger.info('No config found, using defaults');
  return DEFAULT_CONFIG;
}

/**
 * Merge base and override configs (deep merge)
 */
export function mergeConfigs(
  base: CodemoreConfig,
  override: Partial<CodemoreConfig>
): CodemoreConfig {
  return {
    version: override.version ?? base.version,
    extends: override.extends ?? base.extends,
    rules: { ...base.rules, ...override.rules },
    ignore: override.ignore ?? base.ignore,
    maxComplexity: override.maxComplexity ?? base.maxComplexity,
    maxFunctionLength: override.maxFunctionLength ?? base.maxFunctionLength,
    maxParameters: override.maxParameters ?? base.maxParameters,
    maxLineLength: override.maxLineLength ?? base.maxLineLength,
    ai: { ...base.ai, ...override.ai },
    overrides: override.overrides ?? base.overrides,
  };
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*\\\*/g, '[\\s\\S]*')
    .replace(/\*/g, '[^/]*');
  return new RegExp('(?:^|/)' + escaped + '$');
}

/**
 * Check if a file should be ignored based on config
 */
export function shouldIgnoreFile(filePath: string, config: CodemoreConfig): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const filename = normalized.split('/').pop() ?? '';

  for (const pattern of config.ignore) {
    if (pattern.includes('*')) {
      const re = globToRegex(pattern);
      if (re.test(normalized) || re.test(filename)) return true;
    } else {
      if (
        normalized.includes('/' + pattern + '/') ||
        normalized.endsWith('/' + pattern) ||
        normalized === pattern ||
        filename === pattern
      ) return true;
    }
  }

  return false;
}

export type FileAnalyzerOverride = Partial<{
  maxCyclomaticComplexity: number;
  maxFunctionLength: number;
  maxParameterCount: number;
  maxLineLength: number;
}>;

/**
 * Compute the effective StaticAnalyzer config overrides for a specific file
 * by merging all matching override blocks from the project config.
 */
export function getFileAnalyzerOverride(
  filePath: string,
  config: CodemoreConfig
): FileAnalyzerOverride | null {
  if (!config.overrides?.length) return null;
  const normalized = filePath.replace(/\\/g, '/');
  const merged: FileAnalyzerOverride = {};
  let hasMatch = false;

  for (const ov of config.overrides) {
    const matches = ov.files.some(pattern => {
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*\\\*/g, '[\\s\\S]*')
        .replace(/\*/g, '[^/]*');
      return new RegExp('(?:^|/)' + escaped + '(?:/|$)').test(normalized) ||
             new RegExp('^' + escaped + '$').test(normalized);
    });
    if (!matches) continue;
    hasMatch = true;
    if (ov.maxComplexity     !== undefined) merged.maxCyclomaticComplexity = ov.maxComplexity;
    if (ov.maxFunctionLength !== undefined) merged.maxFunctionLength       = ov.maxFunctionLength;
    if (ov.maxParameters     !== undefined) merged.maxParameterCount       = ov.maxParameters;
    if (ov.maxLineLength     !== undefined) merged.maxLineLength           = ov.maxLineLength;
  }

  return hasMatch ? merged : null;
}

/**
 * Get effective severity for a rule based on config
 */
export function getRuleSeverity(
  ruleId: string,
  defaultSeverity: string,
  config: CodemoreConfig
): string {
  const ruleConfig = config.rules[ruleId];

  if (ruleConfig === 'off') return 'off';
  if (ruleConfig === 'warn') return 'minor';
  if (ruleConfig === 'error') return 'major';

  if (typeof ruleConfig === 'object' && ruleConfig.severity) {
    return ruleConfig.severity;
  }

  return defaultSeverity;
}
