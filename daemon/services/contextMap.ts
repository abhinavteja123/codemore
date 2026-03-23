/**
 * Context Map Service
 *
 * Maintains a project-wide context map with dependency graphs.
 * Provides incremental updates on file changes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import {
    FileContext,
    ProjectContext,
    CodeHealthMetrics,
    CodeIssue,
    Severity,
    IssueCategory,
} from '../../shared/protocol';
import { calculateHealthScoreFromTotals, calculateTechnicalDebt } from '../../shared/scoring';
import { createLogger, sanitizeError } from '../lib/logger';

const logger = createLogger('contextMap');

export class ContextMap {
    private files = new Map<string, FileContext>();
    private dependencyGraph = new Map<string, string[]>();
    private reverseDependencyGraph = new Map<string, string[]>();
    private lastFullAnalysis = 0;
    private totalWorkspaceFiles = 0;

    constructor(
        private readonly workspacePath: string,
        private excludePatterns: string[] = [],
        private maxFileSizeKB: number = 500
    ) { }

    /**
     * Scan workspace for all files
     */
    async scanWorkspace(): Promise<{ totalFiles: number; fileTypes: Record<string, number> }> {
        logger.info({ workspacePath: this.workspacePath }, 'Scanning workspace');

        const result = await this.findFilesWithStats(this.workspacePath);
        logger.info({ totalFiles: result.totalFiles, fileTypeCount: Object.keys(result.fileTypes).length }, 'Workspace scan complete');

        this.lastFullAnalysis = Date.now();
        this.totalWorkspaceFiles = result.totalFiles;
        return result;
    }

    /**
     * Get all files in the workspace
     */
    async getAllFiles(): Promise<string[]> {
        const files = await this.findFiles(this.workspacePath);
        this.totalWorkspaceFiles = files.length;
        return files;
    }

    updateConfig(excludePatterns: string[], maxFileSizeKB: number): void {
        this.excludePatterns = excludePatterns;
        this.maxFileSizeKB = maxFileSizeKB;
    }

    /**
     * Find all files and return statistics
     */
    private async findFilesWithStats(dir: string): Promise<{ totalFiles: number; fileTypes: Record<string, number>; files: string[] }> {
        const files = await this.findFiles(dir);
        const fileTypes: Record<string, number> = {};

        for (const filePath of files) {
            const ext = path.extname(filePath).toLowerCase() || path.basename(filePath).toLowerCase();
            const category = this.getFileCategory(ext);
            fileTypes[category] = (fileTypes[category] || 0) + 1;
        }

        return { totalFiles: files.length, fileTypes, files };
    }

    /**
     * Get human-readable file category
     */
    private getFileCategory(ext: string): string {
        const categories: Record<string, string> = {
            '.ts': 'TypeScript',
            '.tsx': 'TypeScript (React)',
            '.js': 'JavaScript',
            '.jsx': 'JavaScript (React)',
            '.mjs': 'JavaScript',
            '.cjs': 'JavaScript',
            '.py': 'Python',
            '.pyw': 'Python',
            '.java': 'Java',
            '.cs': 'C#',
            '.go': 'Go',
            '.rs': 'Rust',
            '.rb': 'Ruby',
            '.php': 'PHP',
            '.cpp': 'C++',
            '.c': 'C',
            '.h': 'C/C++ Header',
            '.hpp': 'C++ Header',
            '.swift': 'Swift',
            '.kt': 'Kotlin',
            '.scala': 'Scala',
            '.html': 'HTML',
            '.htm': 'HTML',
            '.css': 'CSS',
            '.scss': 'SCSS',
            '.sass': 'Sass',
            '.less': 'Less',
            '.vue': 'Vue',
            '.svelte': 'Svelte',
            '.json': 'JSON',
            '.yaml': 'YAML',
            '.yml': 'YAML',
            '.toml': 'TOML',
            '.xml': 'XML',
            '.md': 'Markdown',
            '.mdx': 'MDX',
            '.sh': 'Shell',
            '.bash': 'Shell',
            '.ps1': 'PowerShell',
            '.sql': 'SQL',
            '.graphql': 'GraphQL',
            'dockerfile': 'Docker',
            '.dockerignore': 'Docker',
        };
        return categories[ext] || ext.replace('.', '').toUpperCase() || 'Other';
    }

    /**
     * Find all supported files recursively
     */
    private async findFiles(dir: string): Promise<string[]> {
        const files: string[] = [];

        const supportedExtensions = [
            // JavaScript/TypeScript
            '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
            // Python
            '.py', '.pyw', '.pyx', '.pxd', '.pxi',
            // Other languages
            '.java', '.cs', '.go', '.rs', '.rb', '.php',
            '.cpp', '.c', '.h', '.hpp', '.cc', '.cxx',
            '.swift', '.kt', '.kts', '.scala',
            // Web
            '.html', '.htm', '.css', '.scss', '.sass', '.less',
            '.vue', '.svelte', '.astro',
            // Config/Data
            '.json', '.yaml', '.yml', '.toml', '.xml',
            '.md', '.mdx', '.markdown',
            // Shell/Scripts
            '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
            // Other
            '.sql', '.graphql', '.gql', '.prisma',
        ];

        // Docker files (no extension)
        const specialFiles = [
            'dockerfile', 'dockerfile.dev', 'dockerfile.prod',
            'docker-compose.yml', 'docker-compose.yaml',
            'compose.yml', 'compose.yaml',
            '.dockerignore', 'makefile', 'rakefile', 'gemfile',
            '.gitignore', '.eslintrc', '.prettierrc',
        ];

        const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__', '.venv', 'venv', '.tox', '.pytest_cache'];

        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    if (
                        !excludeDirs.includes(entry.name) &&
                        !entry.name.startsWith('.') &&
                        !this.excludePatterns.some((pattern) => minimatch(fullPath, pattern, { dot: true }))
                    ) {
                        files.push(...await this.findFiles(fullPath));
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    const fileName = entry.name.toLowerCase();
                    const isSupported = supportedExtensions.includes(ext) || specialFiles.includes(fileName);
                    if (!isSupported) {
                        continue;
                    }
                    if (this.excludePatterns.some((pattern) => minimatch(fullPath, pattern, { dot: true }))) {
                        continue;
                    }
                    const stats = await fs.promises.stat(fullPath);
                    if (stats.size > this.maxFileSizeKB * 1024) {
                        continue;
                    }
                    if (isSupported) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (error) {
            logger.error({ err: sanitizeError(error), dir }, 'Error scanning directory');
        }

        return files;
    }

    /**
     * Get file content
     */
    async getFileContent(filePath: string): Promise<string> {
        try {
            return await fs.promises.readFile(filePath, 'utf-8');
        } catch (error) {
            logger.error({ err: sanitizeError(error), filePath }, 'Error reading file');
            return '';
        }
    }

    /**
     * Update file context
     */
    updateFile(filePath: string, context: FileContext): void {
        // Update dependency graph
        const oldContext = this.files.get(filePath);
        if (oldContext) {
            // Remove old dependencies
            for (const dep of oldContext.dependencies) {
                const reverse = this.reverseDependencyGraph.get(dep);
                if (reverse) {
                    const index = reverse.indexOf(filePath);
                    if (index > -1) {
                        reverse.splice(index, 1);
                    }
                }
            }
        }

        // Add new dependencies
        this.dependencyGraph.set(filePath, context.dependencies);
        for (const dep of context.dependencies) {
            const dependents = this.reverseDependencyGraph.get(dep) ?? [];
            dependents.push(filePath);
            this.reverseDependencyGraph.set(dep, dependents);
        }

        // Store context
        this.files.set(filePath, context);
    }

    /**
     * Get file context
     */
    getFileContext(filePath: string): FileContext | null {
        return this.files.get(filePath) || null;
    }

    /**
     * Invalidate file cache
     */
    invalidateFile(filePath: string): void {
        this.files.delete(filePath);
    }

    /**
     * Get files that depend on a given file
     */
    getDependents(filePath: string): string[] {
        return this.reverseDependencyGraph.get(filePath) || [];
    }

    /**
     * Get files that a given file depends on
     */
    getDependencies(filePath: string): string[] {
        return this.dependencyGraph.get(filePath) || [];
    }

    /**
     * Get project context
     * Note: Maps are converted to plain objects for JSON serialization
     */
    getProjectContext(): ProjectContext {
        let totalIssues = 0;
        for (const context of this.files.values()) {
            totalIssues += context.issues.length;
        }

        // Convert Maps to plain objects for JSON serialization
        const filesObj: Record<string, FileContext> = {};
        for (const [key, value] of this.files.entries()) {
            filesObj[key] = value;
        }

        const depGraphObj: Record<string, string[]> = {};
        for (const [key, value] of this.dependencyGraph.entries()) {
            depGraphObj[key] = value;
        }

        return {
            rootPath: this.workspacePath,
            name: path.basename(this.workspacePath),
            files: filesObj as unknown as Map<string, FileContext>,
            dependencyGraph: depGraphObj as unknown as Map<string, string[]>,
            totalIssues,
            lastFullAnalysis: this.lastFullAnalysis,
        };
    }

    /**
     * Get code health metrics
     */
    getHealthMetrics(): CodeHealthMetrics {
        const issuesByCategory: Record<IssueCategory, number> = {
            'bug': 0,
            'code-smell': 0,
            'performance': 0,
            'security': 0,
            'maintainability': 0,
            'accessibility': 0,
            'best-practice': 0,
        };

        const issuesBySeverity: Record<Severity, number> = {
            'BLOCKER': 0,
            'CRITICAL': 0,
            'MAJOR': 0,
            'MINOR': 0,
            'INFO': 0,
        };

        let totalIssues = 0;
        let totalLinesOfCode = 0;
        let totalComplexity = 0;

        for (const context of this.files.values()) {
            for (const issue of context.issues) {
                totalIssues++;
                issuesByCategory[issue.category]++;
                issuesBySeverity[issue.severity]++;
            }

            // Estimate lines of code
            totalLinesOfCode += context.symbols.reduce((acc, symbol) => {
                return acc + (symbol.range.end.line - symbol.range.start.line + 1);
            }, 0);

            // Estimate complexity (simplified)
            totalComplexity += context.symbols.filter(s => s.kind === 'function').length;
        }

        const filesAnalyzed = this.files.size;
        const averageComplexity = filesAnalyzed > 0 ? totalComplexity / filesAnalyzed : 0;

        // Calculate overall score using shared health scoring formula
        // Using the legacy function for backward compatibility (total counts instead of per-file)
        const overallScore = calculateHealthScoreFromTotals(issuesBySeverity, filesAnalyzed);

        // Estimate technical debt using shared formula
        const technicalDebtMinutes = calculateTechnicalDebt(issuesBySeverity);

        return {
            overallScore,
            issuesByCategory,
            issuesBySeverity,
            filesAnalyzed,
            totalFiles: Math.max(this.totalWorkspaceFiles, filesAnalyzed),
            linesOfCode: totalLinesOfCode,
            averageComplexity,
            technicalDebtMinutes,
        };
    }

    /**
     * Get all issues across the project
     */
    getAllIssues(): CodeIssue[] {
        const issues: CodeIssue[] = [];
        for (const context of this.files.values()) {
            issues.push(...context.issues);
        }
        return issues;
    }

    /**
     * Get issues for a specific file
     */
    getFileIssues(filePath: string): CodeIssue[] {
        const context = this.files.get(filePath);
        return context?.issues || [];
    }

    /**
     * Clear all cached data
     */
    clear(): void {
        this.files.clear();
        this.dependencyGraph.clear();
        this.reverseDependencyGraph.clear();
    }
}
