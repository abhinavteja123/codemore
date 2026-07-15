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

// NOTE (0.3.0): shouldIgnoreFile / getFileAnalyzerOverride / getRuleSeverity
// were deleted along with the StaticAnalyzer pipeline (their only consumer).
// The registry applies ignore patterns and rule overrides itself via
// daemon/cli/codemorercLoader.ts + ignoreResolver.ts.
