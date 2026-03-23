/**
 * External Tool Runner Service
 *
 * Integrates industry-standard static analysis tools for performant,
 * language-specific analysis. These tools provide instant feedback
 * without requiring AI API calls.
 *
 * Bundled Tools:
 * - Semgrep: Security scanning (SAST) for 30+ languages
 * - Biome: Ultra-fast JS/TS linting (100x faster than ESLint)
 * - Ruff: Lightning-fast Python linting
 * - TFLint/Checkov: Infrastructure-as-Code analysis
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
    CodeIssue,
    FileLocation,
    IssueCategory,
    Severity,
} from '../../shared/protocol';
import { createLogger, sanitizeError } from '../lib/logger';

const logger = createLogger('externalToolRunner');

const execFileAsync = promisify(execFile);

// ============================================================================
// Types
// ============================================================================

export type ExternalTool = 'semgrep' | 'biome' | 'ruff' | 'tflint' | 'checkov';

export interface ExternalToolConfig {
    enabled: boolean;
    path?: string; // Custom path to binary
    timeout: number; // ms
    extraArgs?: string[];
}

export interface ExternalToolsConfig {
    semgrep: ExternalToolConfig;
    biome: ExternalToolConfig;
    ruff: ExternalToolConfig;
    tflint: ExternalToolConfig;
    checkov: ExternalToolConfig;
}

export const DEFAULT_EXTERNAL_TOOLS_CONFIG: ExternalToolsConfig = {
    semgrep: { enabled: true, timeout: 30000 },
    biome: { enabled: true, timeout: 10000 },
    ruff: { enabled: true, timeout: 10000 },
    tflint: { enabled: true, timeout: 15000 },
    checkov: { enabled: true, timeout: 30000 },
};

interface ToolResult {
    tool: ExternalTool;
    issues: CodeIssue[];
    executionTimeMs: number;
    success: boolean;
    error?: string;
}

// Language/file type mappings
const LANGUAGE_TOOL_MAP: Record<string, ExternalTool[]> = {
    // Web languages -> Biome + Semgrep
    '.js': ['biome', 'semgrep'],
    '.jsx': ['biome', 'semgrep'],
    '.ts': ['biome', 'semgrep'],
    '.tsx': ['biome', 'semgrep'],
    '.mjs': ['biome', 'semgrep'],
    '.cjs': ['biome', 'semgrep'],
    '.json': ['biome'],
    '.jsonc': ['biome'],

    // Python -> Ruff + Semgrep
    '.py': ['ruff', 'semgrep'],
    '.pyi': ['ruff', 'semgrep'],
    '.pyw': ['ruff', 'semgrep'],

    // Infrastructure as Code -> TFLint/Checkov
    '.tf': ['tflint', 'checkov'],
    '.tfvars': ['tflint', 'checkov'],
    '.yaml': ['checkov'],
    '.yml': ['checkov'],

    // Docker
    'Dockerfile': ['checkov', 'semgrep'],
    '.dockerfile': ['checkov', 'semgrep'],

    // Other languages Semgrep supports
    '.go': ['semgrep'],
    '.rb': ['semgrep'],
    '.java': ['semgrep'],
    '.kt': ['semgrep'],
    '.scala': ['semgrep'],
    '.c': ['semgrep'],
    '.cpp': ['semgrep'],
    '.cc': ['semgrep'],
    '.h': ['semgrep'],
    '.hpp': ['semgrep'],
    '.cs': ['semgrep'],
    '.php': ['semgrep'],
    '.swift': ['semgrep'],
    '.rs': ['semgrep'],
    '.lua': ['semgrep'],
    '.r': ['semgrep'],
    '.R': ['semgrep'],
    '.sql': ['semgrep'],
    '.sh': ['semgrep'],
    '.bash': ['semgrep'],
};

// ============================================================================
// External Tool Runner Class
// ============================================================================

export class ExternalToolRunner {
    private config: ExternalToolsConfig;
    private toolAvailability: Map<ExternalTool, boolean> = new Map();
    private binDir: string;

    constructor(config: Partial<ExternalToolsConfig> = {}) {
        this.config = { ...DEFAULT_EXTERNAL_TOOLS_CONFIG, ...config };
        
        // Determine bin directory (bundled binaries location)
        // In production, binaries would be in extension's bin/ folder
        // __dirname in compiled code is: /path/to/extension/daemon/dist/
        // So we need to go up 2 levels to reach the extension root
        this.binDir = path.join(__dirname, '..', '..', 'bin');
        
        // Note: Don't check availability in constructor
        // Will be checked after binary download in daemon initialization
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<ExternalToolsConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Recheck which tools are available (call after downloading binaries)
     */
    async recheckToolAvailability(): Promise<void> {
        await this.checkToolAvailability();
    }

    /**
     * Check which tools are available on the system
     */
    private async checkToolAvailability(): Promise<void> {
        const tools: ExternalTool[] = ['semgrep', 'biome', 'ruff', 'tflint', 'checkov'];
        
        // Define which tools are bundled vs optional
        const bundledTools = new Set<ExternalTool>(['biome', 'ruff', 'tflint']);
        const optionalTools = new Set<ExternalTool>(['semgrep', 'checkov']);
        
        for (const tool of tools) {
            const available = await this.isToolAvailable(tool);
            this.toolAvailability.set(tool, available);
            
            let status: string;
            if (available) {
                status = 'available';
            } else if (optionalTools.has(tool)) {
                status = 'not found (optional - install separately if needed)';
            } else {
                status = 'not found';
            }
            
            logger.info({ tool, status }, 'External tool status');
        }
    }

    /**
     * Check if a specific tool is available
     */
    private async isToolAvailable(tool: ExternalTool): Promise<boolean> {
        const toolConfig = this.config[tool];
        if (!toolConfig.enabled) return false;

        const binaryPath = toolConfig.path || this.getDefaultBinaryPath(tool);

        try {
            // Try to run --version to check availability using execFileAsync (safe, no shell)
            await execFileAsync(binaryPath, ['--version'], { timeout: 5000 });
            return true;
        } catch {
            // Tool not available, try bundled binary
            const bundledPath = this.getBundledBinaryPath(tool);
            if (bundledPath && fs.existsSync(bundledPath)) {
                try {
                    await execFileAsync(bundledPath, ['--version'], { timeout: 5000 });
                    // Update config to use bundled binary
                    this.config[tool].path = bundledPath;
                    return true;
                } catch {
                    return false;
                }
            }
            return false;
        }
    }

    /**
     * Get default binary path for a tool
     */
    private getDefaultBinaryPath(tool: ExternalTool): string {
        // Check if there's a custom path configured
        const toolConfig = this.config[tool];
        if (toolConfig.path) return toolConfig.path;

        // Otherwise, just use the tool name (assumes it's in PATH)
        return tool;
    }

    /**
     * Get bundled binary path for the current platform
     * Priority: 1) npm package, 2) bundled binary, 3) system PATH
     */
    private getBundledBinaryPath(tool: ExternalTool): string | null {
        // First check for npm package binaries
        if (tool === 'biome') {
            // @biomejs/biome provides binaries in node_modules
            const biomePath = path.join(__dirname, '..', '..', 'node_modules', '@biomejs', 'biome', 'bin', 'biome');
            if (fs.existsSync(biomePath)) {
                return biomePath;
            }
        }

        // Then check bundled binaries
        const platform = os.platform();
        const arch = os.arch();
        
        let platformDir: string;
        if (platform === 'darwin' && arch === 'arm64') {
            platformDir = 'darwin-arm64';
        } else if (platform === 'darwin') {
            platformDir = 'darwin-x64';
        } else if (platform === 'linux') {
            platformDir = 'linux-x64';
        } else if (platform === 'win32') {
            platformDir = 'win32-x64';
        } else {
            return null;
        }

        const binaryName = platform === 'win32' ? `${tool}.exe` : tool;
        const bundledPath = path.join(this.binDir, platformDir, binaryName);
        
        if (fs.existsSync(bundledPath)) {
            return bundledPath;
        }

        return null;
    }

    /**
     * Get the tools applicable for a given file
     */
    getApplicableTools(filePath: string): ExternalTool[] {
        const ext = path.extname(filePath).toLowerCase();
        const basename = path.basename(filePath);
        
        // Check for special filenames first (e.g., Dockerfile)
        const tools = LANGUAGE_TOOL_MAP[basename] || LANGUAGE_TOOL_MAP[ext] || [];
        
        // Filter to only available and enabled tools
        return tools.filter(tool => 
            this.toolAvailability.get(tool) && this.config[tool].enabled
        );
    }

    /**
     * Run all applicable external tools on a file
     */
    async analyzeFile(filePath: string, content: string): Promise<CodeIssue[]> {
        const applicableTools = this.getApplicableTools(filePath);
        
        if (applicableTools.length === 0) {
            return [];
        }

        logger.debug({ filePath, tools: applicableTools }, 'Running external tools');

        // Run tools in parallel for better performance
        const results = await Promise.all(
            applicableTools.map(tool => this.runTool(tool, filePath, content))
        );

        // Collect all issues and deduplicate
        const allIssues: CodeIssue[] = [];
        for (const result of results) {
            if (result.success) {
                logger.debug({ tool: result.tool, issueCount: result.issues.length, executionTimeMs: result.executionTimeMs }, 'Tool completed');
                allIssues.push(...result.issues);
            } else if (result.error) {
                logger.warn({ tool: result.tool, error: result.error }, 'Tool failed');
            }
        }

        return this.deduplicateIssues(allIssues);
    }

    /**
     * Run a specific tool on a file
     */
    private async runTool(
        tool: ExternalTool,
        filePath: string,
        content: string
    ): Promise<ToolResult> {
        const startTime = Date.now();
        
        try {
            let issues: CodeIssue[];
            
            switch (tool) {
                case 'semgrep':
                    issues = await this.runSemgrep(filePath, content);
                    break;
                case 'biome':
                    issues = await this.runBiome(filePath, content);
                    break;
                case 'ruff':
                    issues = await this.runRuff(filePath, content);
                    break;
                case 'tflint':
                    issues = await this.runTFLint(filePath, content);
                    break;
                case 'checkov':
                    issues = await this.runCheckov(filePath, content);
                    break;
                default:
                    issues = [];
            }

            return {
                tool,
                issues,
                executionTimeMs: Date.now() - startTime,
                success: true,
            };
        } catch (error) {
            return {
                tool,
                issues: [],
                executionTimeMs: Date.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    // ========================================================================
    // Semgrep Integration
    // ========================================================================

    private async runSemgrep(filePath: string, content: string): Promise<CodeIssue[]> {
        const binaryPath = this.config.semgrep.path || 'semgrep';
        const timeout = this.config.semgrep.timeout;

        // Create temp file for analysis (semgrep needs a file)
        const tempFile = await this.createTempFile(filePath, content);
        
        try {
            // Run semgrep with auto config (uses community rules)
            const { stdout } = await execFileAsync(binaryPath, [
                'scan',
                '--config', 'auto',
                '--json',
                '--quiet',
                tempFile
            ], {
                timeout,
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });

            return this.parseSemgrepOutput(stdout, filePath);
        } finally {
            // Cleanup temp file
            await this.removeTempFile(tempFile);
        }
    }

    private parseSemgrepOutput(output: string, originalFilePath: string): CodeIssue[] {
        const issues: CodeIssue[] = [];
        
        try {
            const result = JSON.parse(output);
            const findings = result.results || [];

            for (const finding of findings) {
                issues.push({
                    id: `semgrep-${finding.check_id}-${finding.start?.line || 0}`,
                    title: finding.check_id?.split('.').pop() || 'Security Issue',
                    description: finding.extra?.message || finding.message || 'Semgrep security finding',
                    category: this.semgrepCategoryToIssueCategory(finding.extra?.metadata?.category),
                    severity: this.semgrepSeverityToSeverity(finding.extra?.severity || finding.severity),
                    location: {
                        filePath: originalFilePath,
                        range: {
                            start: { line: (finding.start?.line || 1) - 1, column: finding.start?.col || 0 },
                            end: { line: (finding.end?.line || 1) - 1, column: finding.end?.col || 0 },
                        },
                    },
                    codeSnippet: finding.extra?.lines || '',
                    confidence: this.semgrepConfidenceToNumber(finding.extra?.metadata?.confidence),
                    impact: finding.extra?.metadata?.impact === 'HIGH' ? 90 : 
                            finding.extra?.metadata?.impact === 'MEDIUM' ? 60 : 40,
                    createdAt: Date.now(),
                });
            }
        } catch (error) {
            logger.error({ err: sanitizeError(error) }, 'Failed to parse Semgrep output');
        }

        return issues;
    }

    private semgrepCategoryToIssueCategory(category?: string): IssueCategory {
        if (!category) return 'security';
        const lower = category.toLowerCase();
        if (lower.includes('security') || lower.includes('vuln')) return 'security';
        if (lower.includes('performance')) return 'performance';
        if (lower.includes('correctness') || lower.includes('bug')) return 'bug';
        if (lower.includes('best-practice')) return 'best-practice';
        return 'security';
    }

    private semgrepSeverityToSeverity(severity?: string): Severity {
        if (!severity) return 'MAJOR';
        const lower = severity.toLowerCase();
        if (lower === 'error' || lower === 'high') return 'CRITICAL';
        if (lower === 'warning' || lower === 'medium') return 'MAJOR';
        if (lower === 'info' || lower === 'low') return 'MINOR';
        return 'INFO';
    }

    private semgrepConfidenceToNumber(confidence?: string): number {
        if (!confidence) return 70;
        const lower = confidence.toLowerCase();
        if (lower === 'high') return 95;
        if (lower === 'medium') return 75;
        if (lower === 'low') return 50;
        return 70;
    }

    // ========================================================================
    // Biome Integration (JS/TS/JSON)
    // ========================================================================

    private async runBiome(filePath: string, content: string): Promise<CodeIssue[]> {
        const binaryPath = this.config.biome.path || 'biome';
        const timeout = this.config.biome.timeout;

        // Biome can read from stdin for some operations, but lint needs a file
        const tempFile = await this.createTempFile(filePath, content);
        
        try {
            // Run biome lint with JSON output
            const { stdout } = await execFileAsync(binaryPath, [
                'lint',
                '--reporter=json',
                tempFile
            ], {
                timeout,
                maxBuffer: 5 * 1024 * 1024,
            });

            return this.parseBiomeOutput(stdout, filePath);
        } catch (error: any) {
            // Biome exits with non-zero if it finds issues, but still outputs JSON
            if (error.stdout) {
                return this.parseBiomeOutput(error.stdout, filePath);
            }
            throw error;
        } finally {
            await this.removeTempFile(tempFile);
        }
    }

    private parseBiomeOutput(output: string, originalFilePath: string): CodeIssue[] {
        const issues: CodeIssue[] = [];
        
        try {
            const result = JSON.parse(output);
            const diagnostics = result.diagnostics || [];

            for (const diag of diagnostics) {
                const location = diag.location || {};
                const span = location.span || {};

                issues.push({
                    id: `biome-${diag.category || 'lint'}-${span.start || 0}`,
                    title: diag.category || 'Lint Issue',
                    description: diag.description || diag.message || 'Biome lint finding',
                    category: this.biomeCategoryToIssueCategory(diag.category),
                    severity: this.biomeSeverityToSeverity(diag.severity),
                    location: {
                        filePath: originalFilePath,
                        range: {
                            start: { line: location.line_start || 0, column: location.column_start || 0 },
                            end: { line: location.line_end || 0, column: location.column_end || 0 },
                        },
                    },
                    codeSnippet: diag.source?.text || '',
                    confidence: 90,
                    impact: diag.severity === 'error' ? 80 : 50,
                    createdAt: Date.now(),
                });
            }
        } catch (error) {
            logger.error({ err: sanitizeError(error) }, 'Failed to parse Biome output');
        }

        return issues;
    }

    private biomeCategoryToIssueCategory(category?: string): IssueCategory {
        if (!category) return 'code-smell';
        const lower = category.toLowerCase();
        if (lower.includes('suspicious') || lower.includes('correctness')) return 'bug';
        if (lower.includes('security')) return 'security';
        if (lower.includes('performance')) return 'performance';
        if (lower.includes('complexity') || lower.includes('style')) return 'maintainability';
        if (lower.includes('a11y') || lower.includes('accessibility')) return 'accessibility';
        return 'code-smell';
    }

    private biomeSeverityToSeverity(severity?: string): Severity {
        if (!severity) return 'MAJOR';
        const lower = severity.toLowerCase();
        if (lower === 'error') return 'CRITICAL';
        if (lower === 'warning') return 'MAJOR';
        if (lower === 'information' || lower === 'info') return 'MINOR';
        return 'INFO';
    }

    // ========================================================================
    // Ruff Integration (Python)
    // ========================================================================

    private async runRuff(filePath: string, content: string): Promise<CodeIssue[]> {
        const binaryPath = this.config.ruff.path || 'ruff';
        const timeout = this.config.ruff.timeout;

        // Ruff can read from stdin
        const tempFile = await this.createTempFile(filePath, content);
        
        try {
            // Run ruff check with JSON output
            const { stdout } = await execFileAsync(binaryPath, [
                'check',
                '--output-format=json',
                tempFile
            ], {
                timeout,
                maxBuffer: 5 * 1024 * 1024,
            });

            return this.parseRuffOutput(stdout, filePath);
        } catch (error: any) {
            // Ruff exits with non-zero if it finds issues
            if (error.stdout) {
                return this.parseRuffOutput(error.stdout, filePath);
            }
            throw error;
        } finally {
            await this.removeTempFile(tempFile);
        }
    }

    private parseRuffOutput(output: string, originalFilePath: string): CodeIssue[] {
        const issues: CodeIssue[] = [];
        
        try {
            const diagnostics = JSON.parse(output) || [];

            for (const diag of diagnostics) {
                const location = diag.location || {};

                issues.push({
                    id: `ruff-${diag.code || 'check'}-${location.row || 0}`,
                    title: `${diag.code}: ${diag.message?.split('\n')[0] || 'Python Issue'}`,
                    description: diag.message || `Ruff rule ${diag.code} violation`,
                    category: this.ruffCodeToIssueCategory(diag.code),
                    severity: this.ruffCodeToSeverity(diag.code),
                    location: {
                        filePath: originalFilePath,
                        range: {
                            start: { line: (location.row || 1) - 1, column: (location.column || 1) - 1 },
                            end: { line: (diag.end_location?.row || location.row || 1) - 1, column: diag.end_location?.column || 0 },
                        },
                    },
                    codeSnippet: '',
                    confidence: 95,
                    impact: this.ruffCodeToImpact(diag.code),
                    createdAt: Date.now(),
                });
            }
        } catch (error) {
            logger.error({ err: sanitizeError(error) }, 'Failed to parse Ruff output');
        }

        return issues;
    }

    private ruffCodeToIssueCategory(code?: string): IssueCategory {
        if (!code) return 'code-smell';
        const prefix = code.slice(0, 1).toUpperCase();
        
        // Ruff rule prefixes: https://docs.astral.sh/ruff/rules/
        switch (prefix) {
            case 'F': return 'bug'; // Pyflakes
            case 'E': case 'W': return 'code-smell'; // pycodestyle
            case 'S': return 'security'; // flake8-bandit (security)
            case 'B': return 'bug'; // flake8-bugbear
            case 'C': return 'maintainability'; // complexity
            case 'N': return 'best-practice'; // naming conventions
            case 'D': return 'maintainability'; // docstrings
            case 'I': return 'maintainability'; // isort
            case 'PL': return 'code-smell'; // pylint
            case 'UP': return 'best-practice'; // pyupgrade
            case 'PERF': return 'performance'; // performance
            default: return 'code-smell';
        }
    }

    private ruffCodeToSeverity(code?: string): Severity {
        if (!code) return 'MAJOR';
        const prefix = code.slice(0, 1).toUpperCase();
        
        // Security and bugs are more severe
        if (prefix === 'S') return 'CRITICAL'; // Security
        if (prefix === 'F') return 'MAJOR'; // Errors
        if (prefix === 'B') return 'MAJOR'; // Bugbear
        return 'INFO';
    }

    private ruffCodeToImpact(code?: string): number {
        if (!code) return 50;
        const prefix = code.slice(0, 1).toUpperCase();
        if (prefix === 'S') return 90; // Security
        if (prefix === 'F' || prefix === 'B') return 70; // Bugs
        if (prefix === 'PERF') return 60; // Performance
        return 40;
    }

    // ========================================================================
    // TFLint Integration (Terraform)
    // ========================================================================

    private async runTFLint(filePath: string, content: string): Promise<CodeIssue[]> {
        const binaryPath = this.config.tflint.path || 'tflint';
        const timeout = this.config.tflint.timeout;

        // TFLint needs to run in the directory containing .tf files
        const tempDir = path.dirname(filePath);
        const tempFile = await this.createTempFile(filePath, content);
        
        try {
            // Run tflint with JSON output
            const { stdout } = await execFileAsync(binaryPath, [
                '--format=json',
                tempFile
            ], {
                timeout,
                cwd: tempDir,
                maxBuffer: 5 * 1024 * 1024,
            });

            return this.parseTFLintOutput(stdout, filePath);
        } catch (error: any) {
            if (error.stdout) {
                return this.parseTFLintOutput(error.stdout, filePath);
            }
            throw error;
        } finally {
            await this.removeTempFile(tempFile);
        }
    }

    private parseTFLintOutput(output: string, originalFilePath: string): CodeIssue[] {
        const issues: CodeIssue[] = [];
        
        try {
            const result = JSON.parse(output);
            const findings = result.issues || [];

            for (const issue of findings) {
                const range = issue.range || {};

                issues.push({
                    id: `tflint-${issue.rule}-${range.start?.line || 0}`,
                    title: issue.rule || 'Terraform Issue',
                    description: issue.message || 'TFLint finding',
                    category: 'best-practice',
                    severity: this.tflintSeverityToSeverity(issue.severity),
                    location: {
                        filePath: originalFilePath,
                        range: {
                            start: { line: (range.start?.line || 1) - 1, column: range.start?.column || 0 },
                            end: { line: (range.end?.line || 1) - 1, column: range.end?.column || 0 },
                        },
                    },
                    codeSnippet: '',
                    confidence: 85,
                    impact: 60,
                    createdAt: Date.now(),
                });
            }
        } catch (error) {
            logger.error({ err: sanitizeError(error) }, 'Failed to parse TFLint output');
        }

        return issues;
    }

    private tflintSeverityToSeverity(severity?: string): Severity {
        if (!severity) return 'MAJOR';
        const lower = severity.toLowerCase();
        if (lower === 'error') return 'CRITICAL';
        if (lower === 'warning') return 'MAJOR';
        if (lower === 'notice') return 'MINOR';
        return 'INFO';
    }

    // ========================================================================
    // Checkov Integration (IaC - Terraform, CloudFormation, K8s, Docker)
    // ========================================================================

    private async runCheckov(filePath: string, content: string): Promise<CodeIssue[]> {
        const binaryPath = this.config.checkov.path || 'checkov';
        const timeout = this.config.checkov.timeout;

        const tempFile = await this.createTempFile(filePath, content);
        
        try {
            // Run checkov with JSON output
            const { stdout } = await execFileAsync(binaryPath, [
                '-f', tempFile,
                '--output', 'json',
                '--quiet'
            ], {
                timeout,
                maxBuffer: 10 * 1024 * 1024,
            });

            return this.parseCheckovOutput(stdout, filePath);
        } catch (error: any) {
            // Checkov exits non-zero when it finds issues
            if (error.stdout) {
                return this.parseCheckovOutput(error.stdout, filePath);
            }
            throw error;
        } finally {
            await this.removeTempFile(tempFile);
        }
    }

    private parseCheckovOutput(output: string, originalFilePath: string): CodeIssue[] {
        const issues: CodeIssue[] = [];
        
        try {
            const result = JSON.parse(output);
            const checks = result.results?.failed_checks || [];

            for (const check of checks) {
                const lines = check.file_line_range || [1, 1];

                issues.push({
                    id: `checkov-${check.check_id}-${lines[0]}`,
                    title: `${check.check_id}: ${check.check_name || 'IaC Issue'}`,
                    description: check.guideline || check.check_name || 'Checkov security finding',
                    category: 'security',
                    severity: this.checkovSeverityToSeverity(check.severity),
                    location: {
                        filePath: originalFilePath,
                        range: {
                            start: { line: lines[0] - 1, column: 0 },
                            end: { line: lines[1] - 1, column: 0 },
                        },
                    },
                    codeSnippet: check.resource || '',
                    confidence: 90,
                    impact: check.severity === 'CRITICAL' ? 100 : check.severity === 'HIGH' ? 85 : 60,
                    createdAt: Date.now(),
                });
            }
        } catch (error) {
            logger.error({ err: sanitizeError(error) }, 'Failed to parse Checkov output');
        }

        return issues;
    }

    private checkovSeverityToSeverity(severity?: string): Severity {
        if (!severity) return 'MAJOR';
        const upper = severity.toUpperCase();
        if (upper === 'CRITICAL') return 'BLOCKER';
        if (upper === 'HIGH') return 'CRITICAL';
        if (upper === 'MEDIUM') return 'MAJOR';
        if (upper === 'LOW') return 'MINOR';
        return 'INFO';
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Create a temporary file with the content
     */
    private async createTempFile(originalPath: string, content: string): Promise<string> {
        const ext = path.extname(originalPath);
        const basename = path.basename(originalPath, ext);
        const tempDir = os.tmpdir();
        const tempFileName = `codemore-${basename}-${Date.now()}${ext}`;
        const tempPath = path.join(tempDir, tempFileName);
        
        await fs.promises.writeFile(tempPath, content, 'utf-8');
        return tempPath;
    }

    /**
     * Remove a temporary file
     */
    private async removeTempFile(filePath: string): Promise<void> {
        try {
            await fs.promises.unlink(filePath);
        } catch {
            // Ignore cleanup errors
        }
    }

    // Note: Tool execution uses execFileAsync with timeout option, which handles
    // process termination on timeout. A custom executeWithAbort with AbortController
    // was considered for cleaner cleanup (SIGTERM then SIGKILL) but the standard
    // execFileAsync timeout is sufficient for our use case.

    /**
     * Deduplicate issues from multiple tools
     */
    private deduplicateIssues(issues: CodeIssue[]): CodeIssue[] {
        const seen = new Set<string>();
        const result: CodeIssue[] = [];

        for (const issue of issues) {
            // Create a key based on location and issue type
            const key = `${issue.location.range.start.line}:${issue.category}:${issue.title.toLowerCase().slice(0, 30)}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                result.push(issue);
            }
        }

        return result;
    }

    /**
     * Get tool availability status
     */
    getToolStatus(): Record<ExternalTool, boolean> {
        return {
            semgrep: this.toolAvailability.get('semgrep') || false,
            biome: this.toolAvailability.get('biome') || false,
            ruff: this.toolAvailability.get('ruff') || false,
            tflint: this.toolAvailability.get('tflint') || false,
            checkov: this.toolAvailability.get('checkov') || false,
        };
    }

    /**
     * Get information about available tools for AI context
     */
    getAvailableToolsContext(): string {
        const available: string[] = [];
        
        if (this.toolAvailability.get('semgrep')) {
            available.push('Semgrep (security scanning for 30+ languages)');
        }
        if (this.toolAvailability.get('biome')) {
            available.push('Biome (JS/TS linting and formatting)');
        }
        if (this.toolAvailability.get('ruff')) {
            available.push('Ruff (Python linting)');
        }
        if (this.toolAvailability.get('tflint')) {
            available.push('TFLint (Terraform linting)');
        }
        if (this.toolAvailability.get('checkov')) {
            available.push('Checkov (IaC security scanning)');
        }

        if (available.length === 0) {
            return 'No external static analysis tools are available.';
        }

        return `External static analysis tools active: ${available.join(', ')}`;
    }
}
