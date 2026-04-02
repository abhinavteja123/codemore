/**
 * Static Analyzer Service
 * 
 * Advanced static code analysis using TypeScript's AST.
 * Provides comprehensive issue detection without requiring AI.
 * 
 * Categories:
 * - Complexity & Maintainability
 * - Dead Code & Unused Elements
 * - Security Vulnerabilities
 * - TypeScript Best Practices
 * - Performance Anti-Patterns
 * - Code Quality & Style
 */

import * as ts from 'typescript';
import * as path from 'path';
import {
    CodeIssue,
    FileContext,
    IssueCategory,
    Severity,
    SymbolInfo,
} from '../../shared/protocol';
import { createLogger } from '../lib/logger';

const logger = createLogger('staticAnalyzer');

// ============================================================================
// Configuration Types
// ============================================================================

export interface StaticAnalyzerConfig {
    // Complexity thresholds
    maxCyclomaticComplexity: number;
    maxCognitiveComplexity: number;
    maxNestingDepth: number;
    maxFunctionLength: number;
    maxParameterCount: number;
    maxLineLength: number;

    // Enable/disable rule categories
    enableComplexityRules: boolean;
    enableDeadCodeRules: boolean;
    enableSecurityRules: boolean;
    enableTypeScriptRules: boolean;
    enablePerformanceRules: boolean;
    enableStyleRules: boolean;
}

export const DEFAULT_ANALYZER_CONFIG: StaticAnalyzerConfig = {
    maxCyclomaticComplexity: 10,
    maxCognitiveComplexity: 15,
    maxNestingDepth: 4,
    maxFunctionLength: 50,
    maxParameterCount: 5,
    maxLineLength: 120,

    enableComplexityRules: true,
    enableDeadCodeRules: true,
    enableSecurityRules: true,
    enableTypeScriptRules: true,
    enablePerformanceRules: true,
    enableStyleRules: true,
};

// ============================================================================
// Issue Utilities
// ============================================================================

interface IssueBuilder {
    id: string;
    title: string;
    description: string;
    category: IssueCategory;
    severity: Severity;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    codeSnippet: string;
    confidence: number;
}

// ============================================================================
// Suppress Comments
// ============================================================================

interface SuppressedRule {
    ruleId: string;
    line: number; // -1 means entire file
}

function extractSuppressComments(content: string): SuppressedRule[] {
    const suppressed: SuppressedRule[] = [];
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
        const lineNumber = idx + 1;

        // Same-line: const x = eval(y); // codemore-ignore: no-eval
        const sameLineMatch = line.match(
            /\/\/\s*codemore-ignore:\s*([a-zA-Z0-9\-_,\s]+)/
        );
        if (sameLineMatch) {
            sameLineMatch[1].split(',').map(r => r.trim()).filter(Boolean).forEach(ruleId => {
                suppressed.push({ ruleId, line: lineNumber });
            });
        }

        // Next-line: // codemore-ignore-next-line: no-eval
        const nextLineMatch = line.match(
            /\/\/\s*codemore-ignore-next-line:\s*([a-zA-Z0-9\-_,\s]+)/
        );
        if (nextLineMatch) {
            nextLineMatch[1].split(',').map(r => r.trim()).filter(Boolean).forEach(ruleId => {
                suppressed.push({ ruleId, line: lineNumber + 1 });
            });
        }

        // File-level: /* codemore-ignore-file: no-eval */
        const fileMatch = line.match(
            /\/\*\s*codemore-ignore-file:\s*([a-zA-Z0-9\-_,\s]+)\s*\*\//
        );
        if (fileMatch) {
            fileMatch[1].split(',').map(r => r.trim()).filter(Boolean).forEach(ruleId => {
                suppressed.push({ ruleId, line: -1 });
            });
        }
    });

    return suppressed;
}

function isIssueSuppressed(issue: CodeIssue, suppressed: SuppressedRule[]): boolean {
    return suppressed.some(s =>
        (s.ruleId === issue.id || s.ruleId === '*') &&
        (s.line === -1 || s.line === issue.location.range.start.line)
    );
}

// ============================================================================
// Static Analyzer Class
// ============================================================================

export class StaticAnalyzer {
    private config: StaticAnalyzerConfig;
    private issueCounter: number = 0;
    private sourceFile: ts.SourceFile | null = null;
    private content: string = '';
    private filePath: string = '';
    private lines: string[] = [];

    constructor(config: Partial<StaticAnalyzerConfig> = {}) {
        this.config = { ...DEFAULT_ANALYZER_CONFIG, ...config };
    }

    /**
     * Update analyzer configuration
     */
    updateConfig(config: Partial<StaticAnalyzerConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Analyze a file and return all detected issues
     */
    analyze(
        filePath: string,
        content: string,
        context: FileContext,
        sourceFile?: ts.SourceFile
    ): CodeIssue[] {
        this.issueCounter = 0;
        this.filePath = filePath;
        this.content = content;
        this.lines = content.split('\n');

        // Extract suppress comments at the start
        const suppressedRules = extractSuppressComments(content);

        const allIssues: CodeIssue[] = [];
        const ext = path.extname(filePath).toLowerCase();

        // Route to specialized analyzers based on file type
        switch (ext) {
            case '.sql':
                allIssues.push(...this.analyzeSQLPatterns());
                break;
            case '.json':
            case '.jsonc':
                allIssues.push(...this.analyzeJSONPatterns());
                break;
            case '.yaml':
            case '.yml':
                allIssues.push(...this.analyzeYAMLPatterns());
                break;
            case '.md':
            case '.markdown':
                // Minimal checks for markdown
                allIssues.push(...this.analyzeMarkdownPatterns());
                break;
            case '.sh':
            case '.bash':
            case '.zsh':
                allIssues.push(...this.analyzeShellPatterns());
                break;
            case '.dockerfile':
            case '': // Dockerfile has no extension
                if (path.basename(filePath).toLowerCase() === 'dockerfile') {
                    allIssues.push(...this.analyzeDockerfilePatterns());
                }
                break;
            case '.ts':
            case '.tsx':
            case '.js':
            case '.jsx':
            case '.mjs':
            case '.cjs':
                // Full TypeScript/JavaScript analysis
                this.sourceFile = sourceFile || this.parseFile(filePath, content);
                allIssues.push(...this.analyzeTypeScriptFile(context, ext));
                break;
            default:
                // Try to parse as TypeScript for unknown JS-like files
                if (content.includes('function ') || content.includes('const ') || content.includes('import ')) {
                    try {
                        this.sourceFile = this.parseFile(filePath, content);
                        allIssues.push(...this.analyzeTypeScriptFile(context, ext));
                    } catch {
                        // Not a valid TS/JS file, skip
                    }
                }
                break;
        }

        // Filter suppressed issues
        const finalIssues = allIssues.filter(issue => !isIssueSuppressed(issue, suppressedRules));
        const suppressedCount = allIssues.length - finalIssues.length;

        if (suppressedCount > 0) {
            logger.debug(
                { filePath, suppressedCount },
                'Some issues suppressed via codemore-ignore comments'
            );
        }

        return finalIssues;
    }

    /**
     * Full TypeScript/JavaScript analysis
     */
    private analyzeTypeScriptFile(context: FileContext, ext: string): CodeIssue[] {
        const issues: CodeIssue[] = [];

        // Run all enabled analysis categories
        if (this.config.enableComplexityRules) {
            issues.push(...this.analyzeComplexity(context));
        }

        if (this.config.enableDeadCodeRules) {
            issues.push(...this.analyzeDeadCode(context));
        }

        if (this.config.enableSecurityRules) {
            issues.push(...this.analyzeSecurityPatterns());
        }

        if (this.config.enableTypeScriptRules) {
            issues.push(...this.analyzeTypeScriptPatterns(context));
        }

        if (this.config.enablePerformanceRules) {
            issues.push(...this.analyzePerformancePatterns());
        }

        if (this.config.enableStyleRules) {
            issues.push(...this.analyzeStylePatterns(context));
        }

        // React-specific checks for TSX/JSX files
        if (ext === '.tsx' || ext === '.jsx') {
            issues.push(...this.analyzeReactPatterns());
        }

        return issues;
    }

    // ========================================================================
    // SQL Analysis
    // ========================================================================

    /**
     * Analyze SQL files for common issues
     */
    private analyzeSQLPatterns(): CodeIssue[] {
        const issues: CodeIssue[] = [];
        const content = this.content.toUpperCase();

        // Check for SELECT *
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];
            const upperLine = line.toUpperCase();

            if (/SELECT\s+\*/.test(upperLine)) {
                issues.push(this.createIssue({
                    id: `sql-select-star-${this.issueCounter++}`,
                    title: 'Avoid SELECT *',
                    description: 'Using SELECT * can impact performance and makes code harder to maintain. Explicitly list the columns you need.',
                    category: 'performance',
                    severity: 'MAJOR',
                    line: i,
                    column: line.search(/SELECT\s+\*/i),
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence: 90,
                }));
            }

            // Check for missing WHERE clause in UPDATE/DELETE
            if (/\b(UPDATE|DELETE)\b/.test(upperLine) && !/WHERE/.test(content.slice(content.indexOf(upperLine)))) {
                // Look ahead a few lines for WHERE
                let hasWhere = false;
                for (let j = i; j < Math.min(i + 5, this.lines.length); j++) {
                    if (/WHERE/i.test(this.lines[j])) {
                        hasWhere = true;
                        break;
                    }
                    if (/;/.test(this.lines[j])) break; // Statement ended
                }

                // Check for UPDATE without WHERE - but exclude ON UPDATE CASCADE/SET NULL (foreign key constraints)
                const isUpdateStatement = /\bUPDATE\b/i.test(upperLine) && !/\bON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)\b/i.test(upperLine);
                if (!hasWhere && isUpdateStatement) {
                    issues.push(this.createIssue({
                        id: `sql-update-no-where-${this.issueCounter++}`,
                        title: 'UPDATE without WHERE clause',
                        description: 'UPDATE statement without WHERE clause will modify all rows. This is usually a mistake.',
                        category: 'bug',
                        severity: 'CRITICAL',
                        line: i,
                        column: 0,
                        endLine: i,
                        endColumn: line.length,
                        codeSnippet: line.trim(),
                        confidence: 85,
                    }));
                }

                // Check for DELETE without WHERE - but exclude ON DELETE CASCADE/SET NULL (foreign key constraints)
                const isDeleteStatement = /\bDELETE\b/i.test(upperLine) && !/\bON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)\b/i.test(upperLine);
                if (!hasWhere && isDeleteStatement) {
                    issues.push(this.createIssue({
                        id: `sql-delete-no-where-${this.issueCounter++}`,
                        title: 'DELETE without WHERE clause',
                        description: 'DELETE statement without WHERE clause will delete all rows. This is usually a mistake.',
                        category: 'bug',
                        severity: 'CRITICAL',
                        line: i,
                        column: 0,
                        endLine: i,
                        endColumn: line.length,
                        codeSnippet: line.trim(),
                        confidence: 85,
                    }));
                }
            }

            // Check for SQL injection-prone patterns in stored procedures
            if (/EXECUTE\s+IMMEDIATE|EXEC\s*\(|sp_executesql/i.test(upperLine)) {
                issues.push(this.createIssue({
                    id: `sql-dynamic-sql-${this.issueCounter++}`,
                    title: 'Dynamic SQL execution',
                    description: 'Dynamic SQL execution can be vulnerable to SQL injection. Ensure proper parameterization.',
                    category: 'security',
                    severity: 'MAJOR',
                    line: i,
                    column: 0,
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence: 75,
                }));
            }

            // Check for ORDER BY without LIMIT (potential performance issue)
            if (/ORDER\s+BY/i.test(upperLine)) {
                let hasLimit = false;
                for (let j = i; j < Math.min(i + 5, this.lines.length); j++) {
                    if (/\b(LIMIT|TOP|FETCH\s+FIRST|ROWNUM)/i.test(this.lines[j])) {
                        hasLimit = true;
                        break;
                    }
                    if (/;/.test(this.lines[j])) break;
                }
                
                if (!hasLimit) {
                    issues.push(this.createIssue({
                        id: `sql-order-no-limit-${this.issueCounter++}`,
                        title: 'ORDER BY without LIMIT',
                        description: 'Ordering large result sets without LIMIT can cause performance issues.',
                        category: 'performance',
                        severity: 'INFO',
                        line: i,
                        column: 0,
                        endLine: i,
                        endColumn: line.length,
                        codeSnippet: line.trim(),
                        confidence: 60,
                    }));
                }
            }

            // Check for missing indexes hints in large queries
            if (/\bJOIN\b.*\bJOIN\b/i.test(line)) {
                issues.push(this.createIssue({
                    id: `sql-multiple-joins-${this.issueCounter++}`,
                    title: 'Multiple JOINs in single query',
                    description: 'Multiple JOINs can cause performance issues. Consider checking indexes on join columns.',
                    category: 'performance',
                    severity: 'INFO',
                    line: i,
                    column: 0,
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence: 50,
                }));
            }
        }

        return issues;
    }

    // ========================================================================
    // JSON Analysis
    // ========================================================================

    private analyzeJSONPatterns(): CodeIssue[] {
        const issues: CodeIssue[] = [];

        try {
            JSON.parse(this.content);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown parse error';
            // Try to extract line number from error
            const lineMatch = errorMessage.match(/line (\d+)/i) || errorMessage.match(/position (\d+)/);
            const line = lineMatch ? parseInt(lineMatch[1], 10) - 1 : 0;

            issues.push(this.createIssue({
                id: `json-parse-error-${this.issueCounter++}`,
                title: 'Invalid JSON',
                description: `JSON parse error: ${errorMessage}`,
                category: 'bug',
                severity: 'CRITICAL',
                line: Math.max(0, line),
                column: 0,
                endLine: Math.max(0, line),
                endColumn: 0,
                codeSnippet: this.lines[Math.max(0, line)]?.trim() || '',
                confidence: 100,
            }));
        }

        // Check for trailing commas (common JSON error)
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];
            if (/,\s*[\]}]/.test(line)) {
                issues.push(this.createIssue({
                    id: `json-trailing-comma-${this.issueCounter++}`,
                    title: 'Trailing comma in JSON',
                    description: 'Trailing commas are not allowed in strict JSON. Remove the comma before the closing bracket.',
                    category: 'bug',
                    severity: 'CRITICAL',
                    line: i,
                    column: line.search(/,\s*[\]}]/),
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence: 95,
                }));
            }
        }

        return issues;
    }

    // ========================================================================
    // YAML Analysis
    // ========================================================================

    private analyzeYAMLPatterns(): CodeIssue[] {
        const issues: CodeIssue[] = [];

        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];

            // Check for tabs (YAML should use spaces)
            if (/\t/.test(line)) {
                issues.push(this.createIssue({
                    id: `yaml-tabs-${this.issueCounter++}`,
                    title: 'Tab character in YAML',
                    description: 'YAML does not allow tabs for indentation. Use spaces instead.',
                    category: 'bug',
                    severity: 'CRITICAL',
                    line: i,
                    column: line.indexOf('\t'),
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence: 100,
                }));
            }

            // Check for inconsistent indentation
            const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
            if (leadingSpaces > 0 && leadingSpaces % 2 !== 0) {
                issues.push(this.createIssue({
                    id: `yaml-indent-${this.issueCounter++}`,
                    title: 'Inconsistent YAML indentation',
                    description: 'YAML indentation should use consistent 2-space increments.',
                    category: 'code-smell',
                    severity: 'MAJOR',
                    line: i,
                    column: 0,
                    endLine: i,
                    endColumn: leadingSpaces,
                    codeSnippet: line.trim(),
                    confidence: 70,
                }));
            }

            // Check for unquoted special values that might cause issues
            if (/:\s*(yes|no|on|off|true|false)\s*$/i.test(line) && !/["']/.test(line)) {
                issues.push(this.createIssue({
                    id: `yaml-boolean-${this.issueCounter++}`,
                    title: 'Unquoted boolean-like value',
                    description: 'Values like yes/no/on/off are interpreted as booleans in YAML. Quote them if you want strings.',
                    category: 'bug',
                    severity: 'INFO',
                    line: i,
                    column: 0,
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence: 65,
                }));
            }
        }

        return issues;
    }

    // ========================================================================
    // Shell Script Analysis
    // ========================================================================

    private analyzeShellPatterns(): CodeIssue[] {
        const issues: CodeIssue[] = [];

        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];

            // Check for unquoted variables
            if (/\$[a-zA-Z_][a-zA-Z0-9_]*(?!\s*["\'])/m.test(line) && !/"\$/.test(line) && !/'\$/.test(line)) {
                const match = line.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/);
                if (match && !line.includes(`"$${match[1]}"`)) {
                    issues.push(this.createIssue({
                        id: `shell-unquoted-var-${this.issueCounter++}`,
                        title: 'Unquoted variable',
                        description: `Variable $${match[1]} should be quoted to prevent word splitting and globbing issues.`,
                        category: 'bug',
                        severity: 'MAJOR',
                        line: i,
                        column: line.indexOf('$'),
                        endLine: i,
                        endColumn: line.length,
                        codeSnippet: line.trim(),
                        confidence: 70,
                    }));
                }
            }

            // Check for useless cat
            if (/cat\s+[^\|]+\|\s*/.test(line)) {
                issues.push(this.createIssue({
                    id: `shell-useless-cat-${this.issueCounter++}`,
                    title: 'Useless use of cat',
                    description: 'This can be simplified by using input redirection instead of piping from cat.',
                    category: 'code-smell',
                    severity: 'INFO',
                    line: i,
                    column: line.indexOf('cat'),
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence: 80,
                }));
            }

            // Check for eval usage
            if (/\beval\s/.test(line)) {
                issues.push(this.createIssue({
                    id: `shell-eval-${this.issueCounter++}`,
                    title: 'Use of eval',
                    description: 'eval can be a security risk if used with untrusted input. Consider alternatives.',
                    category: 'security',
                    severity: 'MAJOR',
                    line: i,
                    column: line.indexOf('eval'),
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence: 85,
                }));
            }

            // Check for missing shebang
            if (i === 0 && !line.startsWith('#!')) {
                issues.push(this.createIssue({
                    id: `shell-no-shebang-${this.issueCounter++}`,
                    title: 'Missing shebang',
                    description: 'Shell scripts should start with a shebang (#!/bin/bash or #!/usr/bin/env bash).',
                    category: 'best-practice',
                    severity: 'INFO',
                    line: 0,
                    column: 0,
                    endLine: 0,
                    endColumn: 0,
                    codeSnippet: line.trim() || '(empty)',
                    confidence: 90,
                }));
            }
        }

        return issues;
    }

    // ========================================================================
    // Dockerfile Analysis
    // ========================================================================

    private analyzeDockerfilePatterns(): CodeIssue[] {
        const issues: CodeIssue[] = [];

        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i].trim();

            // Skip comments and empty lines
            if (line.startsWith('#') || line === '') continue;

            // Check for latest tag
            if (/FROM\s+\S+:latest/i.test(line)) {
                issues.push(this.createIssue({
                    id: `docker-latest-tag-${this.issueCounter++}`,
                    title: 'Using :latest tag',
                    description: 'Using the :latest tag makes builds non-reproducible. Pin to a specific version.',
                    category: 'best-practice',
                    severity: 'MAJOR',
                    line: i,
                    column: 0,
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line,
                    confidence: 95,
                }));
            }

            // Check for apt-get without -y
            if (/apt-get\s+install(?!\s+-y)/i.test(line) && !/--assume-yes/.test(line)) {
                issues.push(this.createIssue({
                    id: `docker-apt-no-y-${this.issueCounter++}`,
                    title: 'apt-get install without -y',
                    description: 'Use apt-get install -y for non-interactive installation.',
                    category: 'bug',
                    severity: 'MAJOR',
                    line: i,
                    column: 0,
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line,
                    confidence: 90,
                }));
            }

            // Check for COPY . . which copies everything
            if (/COPY\s+\.\s+\./.test(line)) {
                issues.push(this.createIssue({
                    id: `docker-copy-all-${this.issueCounter++}`,
                    title: 'COPY . . copies everything',
                    description: 'COPY . . copies all files including .git, node_modules, etc. Use .dockerignore or specific paths.',
                    category: 'performance',
                    severity: 'MAJOR',
                    line: i,
                    column: 0,
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line,
                    confidence: 80,
                }));
            }

            // Check for running as root
            if (/^USER\s+root/i.test(line)) {
                issues.push(this.createIssue({
                    id: `docker-user-root-${this.issueCounter++}`,
                    title: 'Running as root user',
                    description: 'Running containers as root is a security risk. Create and use a non-root user.',
                    category: 'security',
                    severity: 'MAJOR',
                    line: i,
                    column: 0,
                    endLine: i,
                    endColumn: line.length,
                    codeSnippet: line,
                    confidence: 85,
                }));
            }
        }

        return issues;
    }

    // ========================================================================
    // Markdown Analysis
    // ========================================================================

    private analyzeMarkdownPatterns(): CodeIssue[] {
        const issues: CodeIssue[] = [];

        // Minimal checks for markdown
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];

            // Check for broken links
            const linkMatches = Array.from(line.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g));
            for (const match of linkMatches) {
                const url = match[2];
                if (url.startsWith('#') && !this.content.toLowerCase().includes(`# ${url.slice(1).toLowerCase()}`)) {
                    // Internal anchor that might not exist
                    issues.push(this.createIssue({
                        id: `md-broken-anchor-${this.issueCounter++}`,
                        title: 'Potentially broken anchor link',
                        description: `Anchor ${url} may not exist in the document.`,
                        category: 'bug',
                        severity: 'INFO',
                        line: i,
                        column: line.indexOf(url),
                        endLine: i,
                        endColumn: line.indexOf(url) + url.length,
                        codeSnippet: match[0],
                        confidence: 50,
                    }));
                }
            }
        }

        return issues;
    }

    // ========================================================================
    // Complexity Analysis (TypeScript/JavaScript)
    // ========================================================================

    private analyzeComplexity(context: FileContext): CodeIssue[] {
        const issues: CodeIssue[] = [];

        if (!this.sourceFile) return issues;

        // Analyze each function for complexity
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isFunctionDeclaration(node) || 
                ts.isFunctionExpression(node) ||
                ts.isArrowFunction(node) ||
                ts.isMethodDeclaration(node)) {
                
                const funcIssues = this.analyzeFunctionComplexity(node);
                issues.push(...funcIssues);
            }
        });

        return issues;
    }

    private analyzeFunctionComplexity(
        node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration
    ): CodeIssue[] {
        const issues: CodeIssue[] = [];
        const funcName = this.getFunctionName(node);
        const { line } = this.getPosition(node.getStart());

        // Calculate cyclomatic complexity
        const cyclomaticComplexity = this.calculateCyclomaticComplexity(node);
        if (cyclomaticComplexity > this.config.maxCyclomaticComplexity) {
            issues.push(this.createIssue({
                id: `cyclomatic-${this.issueCounter++}`,
                title: `High cyclomatic complexity in '${funcName}'`,
                description: `Cyclomatic complexity is ${cyclomaticComplexity} (threshold: ${this.config.maxCyclomaticComplexity}). ` +
                    `High complexity makes code harder to test and maintain. Consider breaking this function into smaller pieces.`,
                category: 'maintainability',
                severity: cyclomaticComplexity > this.config.maxCyclomaticComplexity * 2 ? 'CRITICAL' : 'MAJOR',
                line,
                column: 0,
                endLine: this.getPosition(node.getEnd()).line,
                endColumn: 0,
                codeSnippet: funcName,
                confidence: 95,
            }));
        }

        // Calculate cognitive complexity
        const cognitiveComplexity = this.calculateCognitiveComplexity(node);
        if (cognitiveComplexity > this.config.maxCognitiveComplexity) {
            issues.push(this.createIssue({
                id: `cognitive-${this.issueCounter++}`,
                title: `High cognitive complexity in '${funcName}'`,
                description: `Cognitive complexity is ${cognitiveComplexity} (threshold: ${this.config.maxCognitiveComplexity}). ` +
                    `This function is difficult to understand. Consider simplifying the control flow.`,
                category: 'maintainability',
                severity: 'MAJOR',
                line,
                column: 0,
                endLine: this.getPosition(node.getEnd()).line,
                endColumn: 0,
                codeSnippet: funcName,
                confidence: 90,
            }));
        }

        // Check nesting depth
        const maxNesting = this.calculateMaxNestingDepth(node);
        if (maxNesting > this.config.maxNestingDepth) {
            issues.push(this.createIssue({
                id: `nesting-${this.issueCounter++}`,
                title: `Deep nesting in '${funcName}'`,
                description: `Maximum nesting depth is ${maxNesting} (threshold: ${this.config.maxNestingDepth}). ` +
                    `Deep nesting reduces readability. Consider using early returns or extracting nested logic.`,
                category: 'code-smell',
                severity: 'MAJOR',
                line,
                column: 0,
                endLine: this.getPosition(node.getEnd()).line,
                endColumn: 0,
                codeSnippet: funcName,
                confidence: 90,
            }));
        }

        // Check parameter count
        const paramCount = this.getParameterCount(node);
        if (paramCount > this.config.maxParameterCount) {
            issues.push(this.createIssue({
                id: `params-${this.issueCounter++}`,
                title: `Too many parameters in '${funcName}'`,
                description: `Function has ${paramCount} parameters (threshold: ${this.config.maxParameterCount}). ` +
                    `Consider using an options object or breaking the function into smaller pieces.`,
                category: 'code-smell',
                severity: 'INFO',
                line,
                column: 0,
                endLine: line,
                endColumn: 0,
                codeSnippet: funcName,
                confidence: 85,
            }));
        }

        // Check function length
        const funcLength = this.getPosition(node.getEnd()).line - line;
        if (funcLength > this.config.maxFunctionLength) {
            issues.push(this.createIssue({
                id: `func-length-${this.issueCounter++}`,
                title: `Function '${funcName}' is too long`,
                description: `Function has ${funcLength} lines (threshold: ${this.config.maxFunctionLength}). ` +
                    `Long functions are harder to understand and test. Consider extracting helper functions.`,
                category: 'maintainability',
                severity: 'MAJOR',
                line,
                column: 0,
                endLine: this.getPosition(node.getEnd()).line,
                endColumn: 0,
                codeSnippet: funcName,
                confidence: 90,
            }));
        }

        return issues;
    }

    private calculateCyclomaticComplexity(node: ts.Node): number {
        let complexity = 1; // Base complexity

        const countComplexity = (n: ts.Node): void => {
            switch (n.kind) {
                case ts.SyntaxKind.IfStatement:
                case ts.SyntaxKind.ConditionalExpression: // ternary
                case ts.SyntaxKind.ForStatement:
                case ts.SyntaxKind.ForInStatement:
                case ts.SyntaxKind.ForOfStatement:
                case ts.SyntaxKind.WhileStatement:
                case ts.SyntaxKind.DoStatement:
                case ts.SyntaxKind.CatchClause:
                case ts.SyntaxKind.CaseClause:
                    complexity++;
                    break;
                case ts.SyntaxKind.BinaryExpression:
                    const binaryExpr = n as ts.BinaryExpression;
                    if (binaryExpr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                        binaryExpr.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
                        binaryExpr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
                        complexity++;
                    }
                    break;
            }
            ts.forEachChild(n, countComplexity);
        };

        ts.forEachChild(node, countComplexity);
        return complexity;
    }

    /**
     * Get the cognitive complexity contribution for a single node
     */
    private getNodeCognitiveContribution(node: ts.Node, nesting: number): { delta: number; addsNesting: boolean } {
        switch (node.kind) {
            case ts.SyntaxKind.IfStatement:
            case ts.SyntaxKind.ForStatement:
            case ts.SyntaxKind.ForInStatement:
            case ts.SyntaxKind.ForOfStatement:
            case ts.SyntaxKind.WhileStatement:
            case ts.SyntaxKind.DoStatement:
            case ts.SyntaxKind.CatchClause:
            case ts.SyntaxKind.SwitchStatement:
                return { delta: 1 + nesting, addsNesting: true };

            case ts.SyntaxKind.ConditionalExpression:
                return { delta: 1 + nesting, addsNesting: false };

            case ts.SyntaxKind.BinaryExpression:
                const binaryExpr = node as ts.BinaryExpression;
                if (binaryExpr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                    binaryExpr.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
                    return { delta: 1, addsNesting: false };
                }
                break;

            case ts.SyntaxKind.BreakStatement:
            case ts.SyntaxKind.ContinueStatement:
                const stmt = node as ts.BreakOrContinueStatement;
                if (stmt.label) {
                    return { delta: 1, addsNesting: false };
                }
                break;
        }
        return { delta: 0, addsNesting: false };
    }

    private calculateCognitiveComplexity(node: ts.Node): number {
        let complexity = 0;

        const countComplexity = (n: ts.Node, nesting: number): void => {
            const { delta, addsNesting } = this.getNodeCognitiveContribution(n, nesting);
            complexity += delta;
            ts.forEachChild(n, (child) => countComplexity(child, addsNesting ? nesting + 1 : nesting));
        };

        ts.forEachChild(node, (child) => countComplexity(child, 0));
        return complexity;
    }

    private calculateMaxNestingDepth(node: ts.Node): number {
        let maxDepth = 0;

        const countDepth = (n: ts.Node, depth: number): void => {
            let newDepth = depth;

            if (ts.isIfStatement(n) || 
                ts.isForStatement(n) || 
                ts.isForInStatement(n) ||
                ts.isForOfStatement(n) ||
                ts.isWhileStatement(n) ||
                ts.isDoStatement(n) ||
                ts.isTryStatement(n) ||
                ts.isSwitchStatement(n)) {
                newDepth = depth + 1;
                maxDepth = Math.max(maxDepth, newDepth);
            }

            ts.forEachChild(n, (child) => countDepth(child, newDepth));
        };

        ts.forEachChild(node, (child) => countDepth(child, 0));
        return maxDepth;
    }

    // ========================================================================
    // Dead Code Analysis
    // ========================================================================

    private analyzeDeadCode(context: FileContext): CodeIssue[] {
        const issues: CodeIssue[] = [];

        if (!this.sourceFile) return issues;

        // Track declared and used identifiers
        const declared = new Map<string, { node: ts.Node; used: boolean }>();
        const used = new Set<string>();

        // First pass: collect all declarations
        this.visitNodes(this.sourceFile, (node) => {
            // Variable declarations
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
                // Skip exported declarations — they are used by consumers
                const parent = node.parent; // VariableDeclarationList
                const grandparent = parent?.parent; // VariableStatement
                const isExported = grandparent &&
                    ts.isVariableStatement(grandparent) &&
                    grandparent.modifiers?.some(
                        m => m.kind === ts.SyntaxKind.ExportKeyword
                    );
                if (isExported) return; // exported = used externally

                const name = node.name.text;
                if (!name.startsWith('_') && !declared.has(name)) {
                    declared.set(name, { node: node.name, used: false });
                }
            }

            // Function declarations
            if (ts.isFunctionDeclaration(node) && node.name) {
                const name = node.name.text;
                // Skip if exported
                if (!this.hasExportModifier(node) && !declared.has(name)) {
                    declared.set(name, { node: node.name, used: false });
                }
            }

            // Enum declarations
            if (ts.isEnumDeclaration(node)) {
                const isExported = node.modifiers?.some(
                    m => m.kind === ts.SyntaxKind.ExportKeyword
                );
                if (isExported) return; // enum members used via enum name
            }

            // Parameters
            if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
                // Skip parameters inside type declarations — they are
                // type annotations, not runtime variables
                let parentNode: ts.Node | undefined = node.parent;
                let isInTypeContext = false;
                while (parentNode) {
                    if (
                        ts.isTypeAliasDeclaration(parentNode) ||
                        ts.isFunctionTypeNode(parentNode) ||
                        ts.isInterfaceDeclaration(parentNode) ||
                        ts.isCallSignatureDeclaration(parentNode) ||
                        ts.isMethodSignature(parentNode) ||
                        ts.isConstructSignatureDeclaration(parentNode) ||
                        ts.isTypeParameterDeclaration(parentNode)
                    ) {
                        isInTypeContext = true;
                        break;
                    }
                    parentNode = parentNode.parent;
                }
                if (isInTypeContext) return;

                const name = node.name.text;
                // Skip underscore-prefixed params (intentionally unused)
                if (!name.startsWith('_') && !declared.has(name)) {
                    declared.set(name, { node: node.name, used: false });
                }
            }
        });

        // Second pass: collect all usages
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isIdentifier(node)) {
                // Skip if this is a declaration - check each type separately for type safety
                const parent = node.parent;
                if (parent && (
                    (ts.isVariableDeclaration(parent) && parent.name === node) ||
                    (ts.isFunctionDeclaration(parent) && parent.name === node) ||
                    (ts.isParameter(parent) && parent.name === node) ||
                    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
                    (ts.isMethodDeclaration(parent) && parent.name === node)
                )) {
                    return; // This is the declaration itself
                }
                used.add(node.text);
            }
        });

        // Find unused declarations
        for (const [name, info] of Array.from(declared.entries())) {
            if (!used.has(name)) {
                const { line, column } = this.getPosition(info.node.getStart());
                issues.push(this.createIssue({
                    id: `unused-${this.issueCounter++}`,
                    title: `Unused variable '${name}'`,
                    description: `The variable '${name}' is declared but never used. Remove it or use an underscore prefix if intentional.`,
                    category: 'code-smell',
                    severity: 'MAJOR',
                    line,
                    column,
                    endLine: line,
                    endColumn: column + name.length,
                    codeSnippet: name,
                    confidence: 85,
                }));
            }
        }

        // Detect unreachable code after return statements
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isBlock(node)) {
                const statements = node.statements;
                for (let i = 0; i < statements.length - 1; i++) {
                    const stmt = statements[i];
                    if (ts.isReturnStatement(stmt) || 
                        ts.isThrowStatement(stmt) ||
                        (ts.isBreakStatement(stmt) && !stmt.label) ||
                        (ts.isContinueStatement(stmt) && !stmt.label)) {
                        
                        const nextStmt = statements[i + 1];
                        const { line } = this.getPosition(nextStmt.getStart());
                        issues.push(this.createIssue({
                            id: `unreachable-${this.issueCounter++}`,
                            title: 'Unreachable code detected',
                            description: 'This code will never be executed because it comes after a return, throw, break, or continue statement.',
                            category: 'bug',
                            severity: 'MAJOR',
                            line,
                            column: 0,
                            endLine: this.getPosition(nextStmt.getEnd()).line,
                            endColumn: 0,
                            codeSnippet: nextStmt.getText().slice(0, 50),
                            confidence: 95,
                        }));
                        break; // Only report once per block
                    }
                }
            }
        });

        // Detect unused imports
        const importedNames = new Set<string>();
        const usedInCode = new Set<string>();

        // Collect all imports
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {
                const clause = node.importClause;
                if (clause) {
                    if (clause.name) {
                        importedNames.add(clause.name.text);
                    }
                    if (clause.namedBindings) {
                        if (ts.isNamedImports(clause.namedBindings)) {
                            clause.namedBindings.elements.forEach(el => {
                                importedNames.add(el.name.text);
                            });
                        } else if (ts.isNamespaceImport(clause.namedBindings)) {
                            importedNames.add(clause.namedBindings.name.text);
                        }
                    }
                }
            }
        });

        // Collect all identifier usages (excluding imports)
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isIdentifier(node)) {
                // Skip import declarations
                let current: ts.Node | undefined = node;
                while (current) {
                    if (ts.isImportDeclaration(current)) {
                        return;
                    }
                    current = current.parent;
                }
                usedInCode.add(node.text);
            }
        });

        // Find unused imports
        for (const name of Array.from(importedNames)) {
            if (!usedInCode.has(name)) {
                // Find the import statement for this name
                this.visitNodes(this.sourceFile, (node) => {
                    if (ts.isImportDeclaration(node)) {
                        const clause = node.importClause;
                        if (clause?.name?.text === name ||
                            (clause?.namedBindings && ts.isNamedImports(clause.namedBindings) &&
                             clause.namedBindings.elements.some(el => el.name.text === name))) {
                            const { line } = this.getPosition(node.getStart());
                            issues.push(this.createIssue({
                                id: `unused-import-${this.issueCounter++}`,
                                title: `Unused import '${name}'`,
                                description: `The import '${name}' is never used in this file. Remove it to clean up dependencies.`,
                                category: 'code-smell',
                                severity: 'INFO',
                                line,
                                column: 0,
                                endLine: line,
                                endColumn: 0,
                                codeSnippet: name,
                                confidence: 80,
                            }));
                        }
                    }
                });
            }
        }

        return issues;
    }

    // ========================================================================
    // Security Pattern Analysis
    // ========================================================================

    private analyzeSecurityPatterns(): CodeIssue[] {
        const issues: CodeIssue[] = [];

        if (!this.sourceFile) return issues;

        // Detect eval() usage
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isCallExpression(node)) {
                const expr = node.expression;
                if (ts.isIdentifier(expr) && expr.text === 'eval') {
                    const { line, column } = this.getPosition(node.getStart());
                    issues.push(this.createIssue({
                        id: `security-eval-${this.issueCounter++}`,
                        title: 'Dangerous eval() usage',
                        description: 'eval() executes arbitrary code and is a major security risk. It can lead to code injection attacks. Use safer alternatives like JSON.parse() or Function constructor with caution.',
                        category: 'security',
                        severity: 'CRITICAL',
                        line,
                        column,
                        endLine: line,
                        endColumn: column + node.getText().length,
                        codeSnippet: node.getText().slice(0, 50),
                        confidence: 100,
                    }));
                }
            }
        });

        // Detect innerHTML usage (XSS risk)
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isPropertyAccessExpression(node) && 
                node.name.text === 'innerHTML') {
                const parent = node.parent;
                if (ts.isBinaryExpression(parent) && 
                    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                    const { line, column } = this.getPosition(node.getStart());
                    issues.push(this.createIssue({
                        id: `security-xss-${this.issueCounter++}`,
                        title: 'Potential XSS vulnerability',
                        description: 'Setting innerHTML directly can lead to Cross-Site Scripting (XSS) attacks. Use textContent, innerText, or sanitize the HTML before insertion.',
                        category: 'security',
                        severity: 'MAJOR',
                        line,
                        column,
                        endLine: line,
                        endColumn: column + node.getText().length,
                        codeSnippet: node.getText(),
                        confidence: 85,
                    }));
                }
            }
        });

        // Detect hardcoded secrets
        const secretPatterns = [
            { pattern: /api[_-]?key/i, name: 'API key' },
            { pattern: /password/i, name: 'password' },
            { pattern: /secret/i, name: 'secret' },
            { pattern: /token/i, name: 'token' },
            { pattern: /private[_-]?key/i, name: 'private key' },
            { pattern: /auth/i, name: 'authentication credential' },
        ];

        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
                const varName = node.name.text;
                const initializer = node.initializer;
                
                if (initializer && ts.isStringLiteral(initializer)) {
                    for (const { pattern, name } of secretPatterns) {
                        if (pattern.test(varName) && initializer.text.length > 0) {
                            const { line, column } = this.getPosition(node.getStart());
                            issues.push(this.createIssue({
                                id: `security-secret-${this.issueCounter++}`,
                                title: `Potential hardcoded ${name}`,
                                description: `Variable '${varName}' appears to contain a hardcoded ${name}. Use environment variables or a secure secrets manager instead.`,
                                category: 'security',
                                severity: 'CRITICAL',
                                line,
                                column,
                                endLine: line,
                                endColumn: column + node.getText().length,
                                codeSnippet: `${varName} = "..."`,
                                confidence: 75,
                            }));
                            break;
                        }
                    }
                }
            }
        });

        // Detect SQL injection risks (template literals in database calls)
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isCallExpression(node)) {
                const expr = node.expression;
                let methodName = '';

                if (ts.isPropertyAccessExpression(expr)) {
                    methodName = expr.name.text;
                } else if (ts.isIdentifier(expr)) {
                    methodName = expr.text;
                }

                // True SQL methods (exact matches only)
                const sqlMethods = ['query', 'execute', 'raw', 'sql'];

                // Shell/process execution methods (exclude from SQL injection)
                const shellMethods = ['exec', 'execSync', 'execAsync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork'];

                // Check if it's a shell command (skip SQL injection check)
                const isShellCommand = shellMethods.some(m => methodName.toLowerCase().includes(m));

                // Only flag actual SQL methods
                const isSqlMethod = sqlMethods.some(m => methodName.toLowerCase() === m || methodName.toLowerCase().endsWith(`.${m}`));

                if (isSqlMethod && !isShellCommand) {
                    const arg = node.arguments[0];
                    if (arg && ts.isTemplateExpression(arg)) {
                        const { line, column } = this.getPosition(node.getStart());
                        issues.push(this.createIssue({
                            id: `security-sql-${this.issueCounter++}`,
                            title: 'Potential SQL injection risk',
                            description: 'Using template literals in SQL queries can lead to SQL injection attacks. Use parameterized queries or prepared statements instead.',
                            category: 'security',
                            severity: 'CRITICAL',
                            line,
                            column,
                            endLine: this.getPosition(node.getEnd()).line,
                            endColumn: 0,
                            codeSnippet: node.getText().slice(0, 60),
                            confidence: 80,
                        }));
                    }
                }
            }
        });

        // Detect new Function() usage
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isNewExpression(node)) {
                const expr = node.expression;
                if (ts.isIdentifier(expr) && expr.text === 'Function') {
                    const { line, column } = this.getPosition(node.getStart());
                    issues.push(this.createIssue({
                        id: `security-func-${this.issueCounter++}`,
                        title: 'Dynamic Function constructor usage',
                        description: 'The Function constructor is similar to eval() and can execute arbitrary code. Avoid using it with user-supplied input.',
                        category: 'security',
                        severity: 'MAJOR',
                        line,
                        column,
                        endLine: line,
                        endColumn: column + node.getText().length,
                        codeSnippet: node.getText().slice(0, 50),
                        confidence: 90,
                    }));
                }
            }
        });

        return issues;
    }

    // ========================================================================
    // TypeScript Pattern Analysis
    // ========================================================================

    private analyzeTypeScriptPatterns(context: FileContext): CodeIssue[] {
        const issues: CodeIssue[] = [];

        if (!this.sourceFile) return issues;

        // Check if file is TypeScript
        const ext = path.extname(this.filePath).toLowerCase();
        if (ext !== '.ts' && ext !== '.tsx') {
            return issues;
        }

        // Detect 'any' type usage
        this.visitNodes(this.sourceFile, (node) => {
            if (node.kind === ts.SyntaxKind.AnyKeyword) {
                const { line, column } = this.getPosition(node.getStart());
                issues.push(this.createIssue({
                    id: `ts-any-${this.issueCounter++}`,
                    title: 'Explicit any type',
                    description: 'Using "any" bypasses TypeScript\'s type checking. Consider using a more specific type, "unknown", or a generic type parameter.',
                    category: 'best-practice',
                    severity: 'MAJOR',
                    line,
                    column,
                    endLine: line,
                    endColumn: column + 3,
                    codeSnippet: 'any',
                    confidence: 90,
                }));
            }
        });

        // Detect 'as any' type assertions
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isAsExpression(node)) {
                const typeNode = node.type;
                if (typeNode.kind === ts.SyntaxKind.AnyKeyword) {
                    const { line, column } = this.getPosition(node.getStart());
                    issues.push(this.createIssue({
                        id: `ts-as-any-${this.issueCounter++}`,
                        title: 'Type assertion to any',
                        description: '"as any" is a type safety escape hatch that disables type checking. Consider fixing the underlying type issue instead.',
                        category: 'best-practice',
                        severity: 'MAJOR',
                        line,
                        column,
                        endLine: line,
                        endColumn: column + node.getText().length,
                        codeSnippet: node.getText().slice(0, 40),
                        confidence: 95,
                    }));
                }
            }
        });

        // Detect non-null assertions (!)
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isNonNullExpression(node)) {
                // Skip if it's part of a chain like a!.b
                const parent = node.parent;
                if (parent && ts.isPropertyAccessExpression(parent) && parent.expression === node) {
                    const { line, column } = this.getPosition(node.getEnd() - 1);
                    issues.push(this.createIssue({
                        id: `ts-non-null-${this.issueCounter++}`,
                        title: 'Non-null assertion operator',
                        description: 'The non-null assertion operator (!) tells TypeScript to ignore potential null/undefined. Consider using optional chaining (?.) or proper null checks.',
                        category: 'best-practice',
                        severity: 'INFO',
                        line,
                        column,
                        endLine: line,
                        endColumn: column + 1,
                        codeSnippet: node.getText(),
                        confidence: 70,
                    }));
                }
            }
        });

        // Detect missing return type annotations on exported functions
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isFunctionDeclaration(node) && node.name) {
                if (this.hasExportModifier(node) && !node.type) {
                    const { line, column } = this.getPosition(node.getStart());
                    issues.push(this.createIssue({
                        id: `ts-return-type-${this.issueCounter++}`,
                        title: `Missing return type on exported function '${node.name.text}'`,
                        description: 'Exported functions should have explicit return types for better API documentation and to catch unintended return type changes.',
                        category: 'best-practice',
                        severity: 'INFO',
                        line,
                        column,
                        endLine: line,
                        endColumn: column + 20,
                        codeSnippet: `function ${node.name.text}`,
                        confidence: 80,
                    }));
                }
            }
        });

        // Detect @ts-ignore comments (using TypeScript comment trivia API)
        this.visitNodes(this.sourceFile, (node) => {
            // Only check statements and declarations that might have leading comments
            if (ts.isStatement(node) || ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
                if (this.hasLeadingTsIgnore(node)) {
                    const { line, column } = this.getPosition(node.getStart());
                    issues.push(this.createIssue({
                        id: `ts-ignore-${this.issueCounter++}`,
                        title: '@ts-ignore comment found',
                        description: '@ts-ignore suppresses TypeScript errors. Consider fixing the underlying issue or using @ts-expect-error with an explanation.',
                        category: 'best-practice',
                        severity: 'MAJOR',
                        line,
                        column,
                        endLine: line,
                        endColumn: column + 20,
                        codeSnippet: node.getText().slice(0, 50),
                        confidence: 100,
                    }));
                }
            }
        });

        return issues;
    }

    // ========================================================================
    // Performance Pattern Analysis
    // ========================================================================

    private analyzePerformancePatterns(): CodeIssue[] {
        const issues: CodeIssue[] = [];

        if (!this.sourceFile) return issues;

        // Detect nested loops
        this.visitNodes(this.sourceFile, (node) => {
            if (this.isLoopStatement(node)) {
                // Check for nested loops
                let hasNestedLoop = false;
                this.visitNodes(node, (child) => {
                    if (child !== node && this.isLoopStatement(child)) {
                        hasNestedLoop = true;
                    }
                });

                if (hasNestedLoop) {
                    const { line, column } = this.getPosition(node.getStart());
                    issues.push(this.createIssue({
                        id: `perf-nested-loop-${this.issueCounter++}`,
                        title: 'Nested loop detected',
                        description: 'Nested loops can cause O(n²) or worse time complexity. Consider using a Map/Set for lookups or restructuring the algorithm.',
                        category: 'performance',
                        severity: 'INFO',
                        line,
                        column,
                        endLine: this.getPosition(node.getEnd()).line,
                        endColumn: 0,
                        codeSnippet: this.getLoopType(node),
                        confidence: 70,
                    }));
                }
            }
        });

        // Detect array operations inside loops that could be moved outside
        this.visitNodes(this.sourceFile, (node) => {
            if (this.isLoopStatement(node)) {
                this.visitNodes(node, (child) => {
                    if (ts.isCallExpression(child)) {
                        const expr = child.expression;
                        if (ts.isPropertyAccessExpression(expr)) {
                            const method = expr.name.text;
                            const expensiveMethods = ['filter', 'map', 'reduce', 'find', 'findIndex', 'some', 'every', 'includes'];
                            
                            if (expensiveMethods.includes(method)) {
                                const { line, column } = this.getPosition(child.getStart());
                                issues.push(this.createIssue({
                                    id: `perf-array-in-loop-${this.issueCounter++}`,
                                    title: `Array method '${method}' inside loop`,
                                    description: `Calling ${method}() inside a loop may cause performance issues. Consider moving the operation outside the loop or using a more efficient data structure.`,
                                    category: 'performance',
                                    severity: 'INFO',
                                    line,
                                    column,
                                    endLine: line,
                                    endColumn: column + child.getText().length,
                                    codeSnippet: child.getText().slice(0, 40),
                                    confidence: 65,
                                }));
                            }
                        }
                    }
                });
            }
        });

        // Detect string concatenation in loops (should use array.join or template)
        this.visitNodes(this.sourceFile, (node) => {
            if (this.isLoopStatement(node)) {
                this.visitNodes(node, (child) => {
                    if (ts.isBinaryExpression(child)) {
                        if (child.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) {
                            // Check if it's string concatenation
                            const left = child.left;
                            if (ts.isIdentifier(left)) {
                                const { line, column } = this.getPosition(child.getStart());
                                issues.push(this.createIssue({
                                    id: `perf-string-concat-${this.issueCounter++}`,
                                    title: 'String concatenation in loop',
                                    description: 'Repeated string concatenation with += is inefficient. Consider using an array and join(), or template literals.',
                                    category: 'performance',
                                    severity: 'INFO',
                                    line,
                                    column,
                                    endLine: line,
                                    endColumn: column + child.getText().length,
                                    codeSnippet: child.getText().slice(0, 40),
                                    confidence: 60,
                                }));
                            }
                        }
                    }
                });
            }
        });

        // Detect synchronous file operations in async context
        // Skip for daemon/build scripts where sync operations are acceptable
        const fileContext = this.getFileContext(this.filePath);
        if (fileContext !==  'daemon-service' && fileContext !== 'build-script') {
            const syncMethods = ['readFileSync', 'writeFileSync', 'existsSync', 'statSync', 'readdirSync'];
            this.visitNodes(this.sourceFile, (node) => {
                if (ts.isCallExpression(node)) {
                    const expr = node.expression;
                    let methodName = '';

                    if (ts.isPropertyAccessExpression(expr)) {
                        methodName = expr.name.text;
                    } else if (ts.isIdentifier(expr)) {
                        methodName = expr.text;
                    }

                    if (syncMethods.includes(methodName)) {
                        const { line, column } = this.getPosition(node.getStart());
                        issues.push(this.createIssue({
                            id: `perf-sync-${this.issueCounter++}`,
                            title: `Synchronous operation: ${methodName}`,
                            description: 'Synchronous file operations block the event loop. Consider using the async version for better performance in production.',
                            category: 'performance',
                            severity: 'INFO',
                            line,
                            column,
                            endLine: line,
                            endColumn: column + node.getText().length,
                            codeSnippet: node.getText().slice(0, 40),
                            confidence: 75,
                        }));
                    }
                }
            });
        }

        // Detect async/await anti-patterns
        issues.push(...this.analyzeAsyncPatterns());

        return issues;
    }

    // ========================================================================
    // Async/Promise Pattern Analysis
    // ========================================================================

    private analyzeAsyncPatterns(): CodeIssue[] {
        const issues: CodeIssue[] = [];

        if (!this.sourceFile) return issues;

        // Detect await inside loops (potential sequential execution)
        this.visitNodes(this.sourceFile, (node) => {
            if (this.isLoopStatement(node)) {
                this.visitNodes(node, (child) => {
                    if (ts.isAwaitExpression(child)) {
                        const { line, column } = this.getPosition(child.getStart());
                        issues.push(this.createIssue({
                            id: `async-await-loop-${this.issueCounter++}`,
                            title: 'Await inside loop',
                            description: 'Using await inside a loop executes promises sequentially. Consider using Promise.all() with map() for parallel execution if operations are independent.',
                            category: 'performance',
                            severity: 'INFO',
                            line,
                            column,
                            endLine: line,
                            endColumn: column + child.getText().length,
                            codeSnippet: child.getText().slice(0, 40),
                            confidence: 70,
                        }));
                    }
                });
            }
        });

        // Detect missing await on async calls
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isCallExpression(node)) {
                const parent = node.parent;

                // Check if the call looks async but isn't awaited
                const expr = node.expression;
                let methodName = '';

                if (ts.isPropertyAccessExpression(expr)) {
                    methodName = expr.name.text;
                } else if (ts.isIdentifier(expr)) {
                    methodName = expr.text;
                }

                // High-confidence async patterns (API/network calls that almost always return Promises)
                const highConfidenceAsync = ['fetch', 'axios', 'request'];
                // Medium-confidence patterns (DB operations that usually return Promises)
                const mediumConfidenceAsync = ['findOne', 'findAll', 'findById', 'findMany', 'createOne', 'createMany'];

                // Exclude common sync patterns that LOOK async but aren't
                const syncExclusions = [
                    'updateState', 'updateConfig', 'updateFile', 'updateUI', 'updateView',
                    'updateCache', 'updateLocal', 'updateCounter', 'updateIndex',
                    'saveLocal', 'saveToCache', 'saveState',
                    'deleteLocal', 'deleteFromCache', 'deleteState',
                    'querySelector', 'querySelectorAll', 'requestAnimationFrame',
                    // Type guards — always synchronous
                    'isJsonRpcRequest', 'isJsonRpcNotification', 'isJsonRpcResponse',
                    'isShutdownMessage', 'isValidRequest', 'isValidMessage',
                    'isTypeGuard', 'hasProperty', 'isInstanceOf',
                ];

                const lowerName = methodName.toLowerCase();

                // Skip sync guard patterns: functions starting with 'is', 'has', 'check', or 'can'
                // These are typically synchronous type guards, validators, or permission checks
                const isSyncGuardPattern = /^(is[A-Z]|has[A-Z]|check[A-Z]|can[A-Z])/.test(methodName);
                if (isSyncGuardPattern) {
                    return;
                }

                // Skip if matches sync exclusion patterns
                if (syncExclusions.some(ex => lowerName === ex.toLowerCase())) {
                    return;
                }

                const isHighConfidence = highConfidenceAsync.some(p => lowerName.includes(p.toLowerCase()));
                const isMediumConfidence = mediumConfidenceAsync.some(p => lowerName.includes(p.toLowerCase()));
                const isLikelyAsync = isHighConfidence || isMediumConfidence;

                if (isLikelyAsync && parent && !ts.isAwaitExpression(parent) && !ts.isReturnStatement(parent)) {
                    // Also skip if result is being assigned (user might handle it later)
                    if (ts.isVariableDeclaration(parent) || ts.isBinaryExpression(parent)) {
                        return;
                    }

                    // Check if we're in an async context
                    let current: ts.Node | undefined = node;
                    let inAsyncContext = false;
                    while (current) {
                        if (ts.isFunctionDeclaration(current) ||
                            ts.isFunctionExpression(current) ||
                            ts.isArrowFunction(current) ||
                            ts.isMethodDeclaration(current)) {
                            const modifiers = ts.canHaveModifiers(current) ? ts.getModifiers(current) : undefined;
                            inAsyncContext = modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
                            break;
                        }
                        current = current.parent;
                    }

                    if (inAsyncContext) {
                        const { line, column } = this.getPosition(node.getStart());
                        const confidence = isHighConfidence ? 85 : 65;
                        issues.push(this.createIssue({
                            id: `async-missing-await-${this.issueCounter++}`,
                            title: `Possibly missing await on '${methodName}'`,
                            description: `The method '${methodName}' appears to be async but is not awaited. This may cause the promise to be ignored or create race conditions.`,
                            category: 'bug',
                            severity: 'MAJOR',
                            line,
                            column,
                            endLine: line,
                            endColumn: column + node.getText().length,
                            codeSnippet: node.getText().slice(0, 50),
                            confidence,
                        }));
                    }
                }
            }
        });

        // Detect Promise constructor anti-pattern
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isNewExpression(node)) {
                const expr = node.expression;
                if (ts.isIdentifier(expr) && expr.text === 'Promise') {
                    // Check if the executor uses async/await (anti-pattern)
                    const args = node.arguments;
                    if (args && args.length > 0) {
                        const executor = args[0];
                        if ((ts.isArrowFunction(executor) || ts.isFunctionExpression(executor))) {
                            const modifiers = ts.canHaveModifiers(executor) ? ts.getModifiers(executor) : undefined;
                            const isAsync = modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
                            
                            if (isAsync) {
                                const { line, column } = this.getPosition(node.getStart());
                                issues.push(this.createIssue({
                                    id: `async-promise-executor-${this.issueCounter++}`,
                                    title: 'Async function as Promise executor',
                                    description: 'Using an async function as a Promise executor is an anti-pattern. The async function already returns a promise, so the outer Promise is unnecessary.',
                                    category: 'bug',
                                    severity: 'MAJOR',
                                    line,
                                    column,
                                    endLine: this.getPosition(node.getEnd()).line,
                                    endColumn: 0,
                                    codeSnippet: 'new Promise(async (...) => {...})',
                                    confidence: 95,
                                }));
                            }
                        }
                    }
                }
            }
        });

        // Detect .then().catch() that could be async/await
        let thenCatchCount = 0;
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isCallExpression(node)) {
                const expr = node.expression;
                if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'catch') {
                    const thenCall = expr.expression;
                    if (ts.isCallExpression(thenCall)) {
                        const thenExpr = thenCall.expression;
                        if (ts.isPropertyAccessExpression(thenExpr) && thenExpr.name.text === 'then') {
                            thenCatchCount++;
                            // Only report if there are many (suggests refactoring opportunity)
                            if (thenCatchCount === 3) {
                                const { line, column } = this.getPosition(node.getStart());
                                issues.push(this.createIssue({
                                    id: `async-then-catch-${this.issueCounter++}`,
                                    title: 'Multiple .then().catch() chains',
                                    description: 'This file has multiple Promise chains. Consider using async/await for cleaner, more readable code.',
                                    category: 'maintainability',
                                    severity: 'INFO',
                                    line,
                                    column,
                                    endLine: line,
                                    endColumn: column + 30,
                                    codeSnippet: '.then().catch()',
                                    confidence: 65,
                                }));
                            }
                        }
                    }
                }
            }
        });

        // Detect floating promises (promise not handled)
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isExpressionStatement(node)) {
                const expr = node.expression;
                if (ts.isCallExpression(expr)) {
                    const callExpr = expr.expression;
                    if (ts.isPropertyAccessExpression(callExpr)) {
                        const method = callExpr.name.text;
                        // Check if it's an async method that's not being handled
                        if (method === 'then' || method === 'catch' || method === 'finally') {
                            // This is handled
                            return;
                        }
                    }

                    // Check if the expression is likely a promise that's being ignored
                    let methodName = '';
                    if (ts.isPropertyAccessExpression(callExpr)) {
                        methodName = callExpr.name.text;
                    } else if (ts.isIdentifier(callExpr)) {
                        methodName = callExpr.text;
                    }

                    // Only flag high-confidence async DB/API methods, not generic sync methods
                    const highConfidenceAsync = ['saveToDb', 'saveAsync', 'deleteAsync', 'insertAsync', 'removeAsync', 'sendAsync', 'emitAsync'];
                    const mediumConfidenceAsync = ['sendMessage', 'sendEmail', 'sendNotification'];

                    const lowerName = methodName.toLowerCase();
                    const isHighConfidence = highConfidenceAsync.some(p => lowerName === p.toLowerCase());
                    const isMediumConfidence = mediumConfidenceAsync.some(p => lowerName === p.toLowerCase());

                    if (isHighConfidence || isMediumConfidence) {
                        const { line, column } = this.getPosition(node.getStart());
                        issues.push(this.createIssue({
                            id: `async-floating-promise-${this.issueCounter++}`,
                            title: `Unhandled promise from '${methodName}'`,
                            description: `The promise returned by '${methodName}' is not being awaited or handled. This may cause silent failures.`,
                            category: 'bug',
                            severity: 'MAJOR',
                            line,
                            column,
                            endLine: line,
                            endColumn: column + node.getText().length,
                            codeSnippet: node.getText().slice(0, 50),
                            confidence: isHighConfidence ? 80 : 60,
                        }));
                    }
                }
            }
        });

        return issues;
    }

    // ========================================================================
    // React Pattern Analysis
    // ========================================================================

    private analyzeReactPatterns(): CodeIssue[] {
        const issues: CodeIssue[] = [];

        if (!this.sourceFile) return issues;

        // Detect missing keys in list rendering
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isCallExpression(node)) {
                const expr = node.expression;
                if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'map') {
                    // Check if it's likely a JSX render map
                    const callback = node.arguments[0];
                    if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
                        const body = callback.body;
                        // Check if the body contains JSX
                        let hasJsx = false;
                        let hasKey = false;

                        this.visitNodes(body, (child) => {
                            if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
                                hasJsx = true;
                                // Check for key prop
                                const attributes = ts.isJsxElement(child) 
                                    ? child.openingElement.attributes 
                                    : child.attributes;
                                
                                attributes.properties.forEach(prop => {
                                    if (ts.isJsxAttribute(prop) && 
                                        ts.isIdentifier(prop.name) && 
                                        prop.name.text === 'key') {
                                        hasKey = true;
                                    }
                                });
                            }
                        });

                        if (hasJsx && !hasKey) {
                            const { line, column } = this.getPosition(node.getStart());
                            issues.push(this.createIssue({
                                id: `react-missing-key-${this.issueCounter++}`,
                                title: 'Missing key prop in list rendering',
                                description: 'Elements in a list should have a unique "key" prop for efficient reconciliation. Use a stable ID, not the array index.',
                                category: 'bug',
                                severity: 'MAJOR',
                                line,
                                column,
                                endLine: this.getPosition(node.getEnd()).line,
                                endColumn: 0,
                                codeSnippet: '.map(...)',
                                confidence: 80,
                            }));
                        }
                    }
                }
            }
        });

        // Detect useEffect without dependency array
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isCallExpression(node)) {
                const expr = node.expression;
                if (ts.isIdentifier(expr) && expr.text === 'useEffect') {
                    if (node.arguments.length === 1) {
                        const { line, column } = this.getPosition(node.getStart());
                        issues.push(this.createIssue({
                            id: `react-useeffect-deps-${this.issueCounter++}`,
                            title: 'useEffect missing dependency array',
                            description: 'useEffect without a dependency array runs on every render. Add an empty array [] for mount-only or list dependencies.',
                            category: 'bug',
                            severity: 'MAJOR',
                            line,
                            column,
                            endLine: this.getPosition(node.getEnd()).line,
                            endColumn: 0,
                            codeSnippet: 'useEffect(() => {...})',
                            confidence: 90,
                        }));
                    }
                }
            }
        });

        // Detect useState with object/array without proper initialization
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isCallExpression(node)) {
                const expr = node.expression;
                if (ts.isIdentifier(expr) && expr.text === 'useState') {
                    if (node.arguments.length === 0) {
                        const { line, column } = this.getPosition(node.getStart());
                        issues.push(this.createIssue({
                            id: `react-usestate-init-${this.issueCounter++}`,
                            title: 'useState without initial value',
                            description: 'useState called without an initial value will be undefined. Consider providing a sensible default.',
                            category: 'best-practice',
                            severity: 'INFO',
                            line,
                            column,
                            endLine: line,
                            endColumn: column + node.getText().length,
                            codeSnippet: 'useState()',
                            confidence: 70,
                        }));
                    }
                }
            }
        });

        // Detect direct state mutation patterns
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isBinaryExpression(node) && 
                node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                const left = node.left;
                if (ts.isPropertyAccessExpression(left)) {
                    const text = left.getText();
                    // Common state mutation patterns
                    if (text.includes('.push') || text.includes('.pop') || 
                        text.includes('.splice') || text.includes('.sort') ||
                        text.includes('[') && text.includes('] =')) {
                        const { line, column } = this.getPosition(node.getStart());
                        issues.push(this.createIssue({
                            id: `react-state-mutation-${this.issueCounter++}`,
                            title: 'Possible direct state mutation',
                            description: 'Direct mutation of state or props can cause bugs in React. Use setState with a new object/array reference.',
                            category: 'bug',
                            severity: 'MAJOR',
                            line,
                            column,
                            endLine: line,
                            endColumn: column + node.getText().length,
                            codeSnippet: node.getText().slice(0, 40),
                            confidence: 60,
                        }));
                    }
                }
            }
        });

        // Detect inline function definitions in JSX props (minor performance concern in modern React)
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
                const propName = node.name.text;
                // Common callback props
                if (propName.startsWith('on') && node.initializer) {
                    if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
                        const expr = node.initializer.expression;
                        if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
                            const { line, column } = this.getPosition(node.getStart());
                            issues.push(this.createIssue({
                                id: `react-inline-handler-${this.issueCounter++}`,
                                title: 'Inline function in JSX prop',
                                description: `Inline function in "${propName}" creates a new function on each render. With modern React and proper memoization, this is often acceptable. Consider useCallback only if performance issues are observed.`,
                                category: 'performance',
                                severity: 'INFO',
                                line,
                                column,
                                endLine: line,
                                endColumn: column + node.getText().length,
                                codeSnippet: `${propName}={() => ...}`,
                                confidence: 50, // Reduced from 65
                            }));
                        }
                    }
                }
            }
        });

        // Detect conditional hook calls
        this.visitNodes(this.sourceFile, (node) => {
            if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) {
                this.visitNodes(node, (child) => {
                    if (ts.isCallExpression(child)) {
                        const expr = child.expression;
                        if (ts.isIdentifier(expr)) {
                            const hookNames = ['useState', 'useEffect', 'useContext', 'useReducer', 
                                             'useCallback', 'useMemo', 'useRef', 'useLayoutEffect'];
                            if (hookNames.includes(expr.text)) {
                                const { line, column } = this.getPosition(child.getStart());
                                issues.push(this.createIssue({
                                    id: `react-conditional-hook-${this.issueCounter++}`,
                                    title: `Conditional hook call: ${expr.text}`,
                                    description: 'React hooks must be called in the same order on every render. Calling hooks conditionally breaks the Rules of Hooks.',
                                    category: 'bug',
                                    severity: 'CRITICAL',
                                    line,
                                    column,
                                    endLine: line,
                                    endColumn: column + child.getText().length,
                                    codeSnippet: child.getText().slice(0, 30),
                                    confidence: 95,
                                }));
                            }
                        }
                    }
                });
            }
        });

        return issues;
    }

    // ========================================================================
    // Style Pattern Analysis
    // ========================================================================

    private analyzeStylePatterns(context: FileContext): CodeIssue[] {
        const issues: CodeIssue[] = [];

        // Line-based style checks
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];
            const lineNumber = i;

            // Long lines (with exclusions for imports/exports and URLs)
            if (line.length > this.config.maxLineLength) {
                const trimmed = line.trim();

                // Skip import/export statements
                if (trimmed.startsWith('import ') || trimmed.startsWith('export ') || trimmed.startsWith('import{') || trimmed.startsWith('export{')) {
                    continue;
                }

                // Skip URLs
                if (/(https?:\/\/|www\.)/.test(line)) {
                    continue;
                }

                issues.push(this.createIssue({
                    id: `style-long-line-${this.issueCounter++}`,
                    title: 'Line exceeds maximum length',
                    description: `Line has ${line.length} characters (max: ${this.config.maxLineLength}). Consider breaking it into multiple lines.`,
                    category: 'code-smell',
                    severity: 'INFO',
                    line: lineNumber,
                    column: this.config.maxLineLength,
                    endLine: lineNumber,
                    endColumn: line.length,
                    codeSnippet: `${line.slice(0, 50)}...`,
                    confidence: 60, // Reduced from 100
                }));
            }

            // TODO/FIXME/HACK comments
            const todoMatch = line.match(/\/\/\s*(TODO|FIXME|HACK|XXX)[\s:]*(.*)/i);
            if (todoMatch) {
                const [, type, message] = todoMatch;
                const severity: Severity = type.toUpperCase() === 'FIXME' ? 'MAJOR' : 'MINOR';
                issues.push(this.createIssue({
                    id: `style-${type.toLowerCase()}-${this.issueCounter++}`,
                    title: `${type.toUpperCase()} comment`,
                    description: message.trim() || 'Consider addressing this comment or creating a tracked issue.',
                    category: 'maintainability',
                    severity,
                    line: lineNumber,
                    column: 0,
                    endLine: lineNumber,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence: 100,
                }));
            }

            // Console statements (context-aware)
            if (/console\.(log|debug|info|warn|error|trace)\s*\(/.test(line)) {
                // Skip console checks in script files — they're CLI tools
                const isScript = this.filePath.includes('/scripts/') ||
                                 this.filePath.includes('\\scripts\\') ||
                                 this.filePath.endsWith('.config.js') ||
                                 this.filePath.endsWith('.config.ts');
                if (isScript) {
                    continue; // console.log is acceptable in CLI scripts
                }

                const fileContext = this.getFileContext(this.filePath);
                const isError = /console\.error/.test(line);

                // Determine severity based on context
                let severity: Severity = 'MAJOR';
                let confidence = 95;

                if (fileContext === 'daemon-service' || fileContext === 'build-script') {
                    // Console statements are acceptable in daemon/scripts
                    severity = 'INFO';
                    confidence = 70;
                }

                // console.error is more acceptable than console.log
                if (isError && fileContext !== 'production-web') {
                    continue; // Skip console.error in non-production code
                }

                issues.push(this.createIssue({
                    id: `style-console-${this.issueCounter++}`,
                    title: 'Console statement',
                    description: fileContext === 'production-web'
                        ? 'Console statements should be removed before production. Consider using a proper logging library.'
                        : 'Consider using a structured logging library instead of console statements.',
                    category: 'best-practice',
                    severity,
                    line: lineNumber,
                    column: 0,
                    endLine: lineNumber,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence,
                }));
            }

            // Debugger statements (but not in strings or comments)
            if (/\bdebugger\b/.test(line)) {
                const trimmed = line.trim();

                // Skip if it's a comment
                if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
                    continue;
                }

                // Skip if inside a string literal (check for quotes before and after)
                // This regex finds strings and checks if debugger is inside them
                const strings = line.match(/(['"`])(?:(?=(\\?))\2.)*?\1/g) || [];
                const isInString = strings.some(s => s.includes('debugger'));

                if (!isInString) {
                    issues.push(this.createIssue({
                        id: `style-debugger-${this.issueCounter++}`,
                        title: 'Debugger statement',
                        description: 'Remove debugger statements before committing code.',
                        category: 'best-practice',
                        severity: 'CRITICAL',
                        line: lineNumber,
                        column: 0,
                        endLine: lineNumber,
                        endColumn: line.length,
                        codeSnippet: line.trim(),
                        confidence: 100,
                    }));
                }
            }

            // == instead of ===
            if (/[^=!<>]==[^=]/.test(line) && !/['"`]/.test(line.split('==')[0].slice(-5))) {
                issues.push(this.createIssue({
                    id: `style-equality-${this.issueCounter++}`,
                    title: 'Use strict equality',
                    description: 'Use === instead of == for type-safe comparisons. == performs type coercion which can lead to unexpected results.',
                    category: 'best-practice',
                    severity: 'MAJOR',
                    line: lineNumber,
                    column: 0,
                    endLine: lineNumber,
                    endColumn: line.length,
                    codeSnippet: line.trim(),
                    confidence: 85,
                }));
            }

            // != instead of !==
            if (/[^!]=![^=]/.test(line) || /!=[^=]/.test(line)) {
                if (!/!==/.test(line)) {
                    issues.push(this.createIssue({
                        id: `style-inequality-${this.issueCounter++}`,
                        title: 'Use strict inequality',
                        description: 'Use !== instead of != for type-safe comparisons.',
                        category: 'best-practice',
                        severity: 'MAJOR',
                        line: lineNumber,
                        column: 0,
                        endLine: lineNumber,
                        endColumn: line.length,
                        codeSnippet: line.trim(),
                        confidence: 85,
                    }));
                }
            }
        }

        // AST-based style checks
        if (this.sourceFile) {
            // Empty catch blocks
            this.visitNodes(this.sourceFile, (node) => {
                if (ts.isCatchClause(node)) {
                    const block = node.block;
                    if (block.statements.length === 0) {
                        // Check if the catch block has a comment
                        const bodyText = block.getFullText().trim();
                        // Strip the braces to get inner content
                        const innerText = bodyText.replace(/^\{/, '').replace(/\}$/, '').trim();

                        const hasComment = innerText.startsWith('//') ||
                                           innerText.startsWith('/*') ||
                                           innerText.includes('//') ||
                                           innerText.includes('/*');

                        // MINOR if there's a comment (intentional), MAJOR if truly empty
                        const severity = hasComment ? 'MINOR' : 'MAJOR';

                        const { line, column } = this.getPosition(node.getStart());
                        issues.push(this.createIssue({
                            id: `style-empty-catch-${this.issueCounter++}`,
                            title: 'Empty catch block',
                            description: hasComment
                                ? 'Catch block only contains a comment. Consider logging or handling the error.'
                                : 'Empty catch blocks swallow errors silently. At minimum, log the error or re-throw it.',
                            category: 'bug',
                            severity,
                            line,
                            column,
                            endLine: this.getPosition(node.getEnd()).line,
                            endColumn: 0,
                            codeSnippet: 'catch { }',
                            confidence: hasComment ? 75 : 95,
                        }));
                    }
                }
            });

            // Magic numbers (context-aware with smarter exclusions)
            const fileContext = this.getFileContext(this.filePath);
            this.visitNodes(this.sourceFile, (node) => {
                if (ts.isNumericLiteral(node)) {
                    const value = parseFloat(node.text);

                    // Skip common acceptable values (expanded list)
                    if ([0, 1, -1, 2, 10, 100, 1000].includes(value)) {
                        return;
                    }

                    // Skip time-related values
                    if ([24, 60, 365, 3600, 86400].includes(value)) return; // hours, minutes, days, seconds

                    // Skip round hundreds and thousands
                    if (value >= 100 && value < 1000 && value % 100 === 0) return;
                    if (value >= 1000 && value < 10000 && value % 1000 === 0) return;

                    // Skip HTTP status codes
                    if ([200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 500, 502, 503].includes(value)) return;

                    // Skip common ports
                    if ([80, 443, 3000, 5000, 8000, 8080, 8443, 9000].includes(value)) return;

                    // Skip percentages (0-100)
                    if (value >= 0 && value <= 100 && Number.isInteger(value)) return;

                    // Skip if it's in a const declaration
                    let parent: ts.Node | undefined = node.parent;
                    while (parent) {
                        if (ts.isVariableDeclaration(parent)) {
                            const varStmt = parent.parent?.parent;
                            if (varStmt && ts.isVariableStatement(varStmt)) {
                                const flags = varStmt.declarationList.flags;
                                if (flags & ts.NodeFlags.Const) {
                                    return; // It's a const, skip
                                }
                            }
                        }
                        if (ts.isEnumMember(parent)) {
                            return; // It's an enum value, skip
                        }
                        parent = parent.parent;
                    }

                    // Skip if in config context (object literals)
                    if (this.isConfigContext(node)) {
                        return;
                    }

                    // Skip in test files
                    if (fileContext === 'test') {
                        return;
                    }

                    // Check whitelist first
                    const numericValue = Number(node.text);
                    if (StaticAnalyzer.MAGIC_NUMBER_WHITELIST.has(numericValue)) {
                        return;
                    }

                    // Only flag larger numbers (> 50 instead of > 10) with lower confidence
                    if (value > 50) {
                        const { line, column } = this.getPosition(node.getStart());
                        issues.push(this.createIssue({
                            id: `style-magic-number-${this.issueCounter++}`,
                            title: 'Magic number detected',
                            description: `The number ${node.text} should be extracted into a named constant for better readability and maintainability.`,
                            category: 'maintainability',
                            severity: 'INFO',
                            line,
                            column,
                            endLine: line,
                            endColumn: column + node.text.length,
                            codeSnippet: node.text,
                            confidence: 50, // Reduced from 70
                        }));
                    }
                }
            });

            // Check for missing documentation on exported symbols
            for (const symbol of context.symbols) {
                if (!symbol.documentation && 
                    (symbol.kind === 'function' || symbol.kind === 'class' || symbol.kind === 'interface')) {
                    // Check if it's exported
                    const isExported = context.exports.some(e => e.name === symbol.name);
                    if (isExported) {
                        issues.push(this.createIssue({
                            id: `style-no-docs-${this.issueCounter++}`,
                            title: `Missing documentation for '${symbol.name}'`,
                            description: `Exported ${symbol.kind} '${symbol.name}' has no JSDoc documentation. Add documentation to improve code maintainability.`,
                            category: 'maintainability',
                            severity: 'INFO',
                            line: symbol.range.start.line,
                            column: symbol.range.start.column,
                            endLine: symbol.range.start.line,
                            endColumn: symbol.range.start.column + symbol.name.length,
                            codeSnippet: symbol.name,
                            confidence: 75,
                        }));
                    }
                }
            }
        }

        return issues;
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /**
     * Magic numbers that should never be flagged (common, boundary, http codes, etc.)
     */
    private static readonly MAGIC_NUMBER_WHITELIST = new Set<number>([
        // Boundary values — universal
        0, 1, -1, 2, 3,
        // Percentages and common multipliers
        10, 100, 1000, 1024,
        // HTTP status codes
        200, 201, 204, 301, 302, 400, 401, 403, 404, 409, 429, 500, 502, 503,
        // Unix file permissions (decimal representations of octal)
        493,  // 0o755 — executable
        420,  // 0o644 — readable
        511,  // 0o777 — all permissions
        // Common timeouts and intervals (ms)
        1200, 3000, 5000, 10000, 30000, 60000,
        // Common buffer/limit sizes
        256, 512, 8192,
    ]);

    /**
     * Determine file context for context-aware rule application
     */
    private getFileContext(filePath: string): 'production-web' | 'daemon-service' | 'build-script' | 'test' {
        const normalized = filePath.toLowerCase().replace(/\\/g, '/');

        if (normalized.includes('/daemon/')) return 'daemon-service';
        if (normalized.includes('/scripts/') || normalized.includes('/bin/')) return 'build-script';
        if (normalized.includes('.test.') || normalized.includes('.spec.') || normalized.includes('/__tests__/')) return 'test';

        return 'production-web';
    }

    /**
     * Check if a node is in a configuration context (object literal)
     */
    private isConfigContext(node: ts.Node): boolean {
        let parent: ts.Node | undefined = node.parent;
        while (parent) {
            if (ts.isObjectLiteralExpression(parent)) return true;
            if (ts.isCallExpression(parent)) return false; // In function call, not config
            parent = parent.parent;
        }
        return false;
    }

    private parseFile(filePath: string, content: string): ts.SourceFile | null {
        try {
            const ext = path.extname(filePath).toLowerCase();
            let scriptKind: ts.ScriptKind;

            switch (ext) {
                case '.ts':
                    scriptKind = ts.ScriptKind.TS;
                    break;
                case '.tsx':
                    scriptKind = ts.ScriptKind.TSX;
                    break;
                case '.js':
                    scriptKind = ts.ScriptKind.JS;
                    break;
                case '.jsx':
                    scriptKind = ts.ScriptKind.JSX;
                    break;
                default:
                    return null;
            }

            return ts.createSourceFile(
                filePath,
                content,
                ts.ScriptTarget.Latest,
                true,
                scriptKind
            );
        } catch {
            return null;
        }
    }

    private visitNodes(node: ts.Node, visitor: (node: ts.Node) => void): void {
        visitor(node);
        ts.forEachChild(node, (child) => this.visitNodes(child, visitor));
    }

    private getPosition(pos: number): { line: number; column: number } {
        if (!this.sourceFile) {
            return { line: 0, column: 0 };
        }
        const lineAndChar = this.sourceFile.getLineAndCharacterOfPosition(pos);
        return { line: lineAndChar.line, column: lineAndChar.character };
    }

    private getFunctionName(
        node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration
    ): string {
        if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
            return node.name?.text || '<anonymous>';
        }
        if (ts.isMethodDeclaration(node)) {
            return node.name.getText();
        }
        // Arrow function - try to get name from parent variable declaration
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
            return parent.name.text;
        }
        if (ts.isPropertyAssignment(parent)) {
            return parent.name.getText();
        }
        return '<arrow function>';
    }

    private getParameterCount(
        node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration
    ): number {
        return node.parameters.length;
    }

    private hasExportModifier(node: ts.Node): boolean {
        const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
        return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    }

    private isLoopStatement(node: ts.Node): boolean {
        return ts.isForStatement(node) ||
               ts.isForInStatement(node) ||
               ts.isForOfStatement(node) ||
               ts.isWhileStatement(node) ||
               ts.isDoStatement(node);
    }

    private getLoopType(node: ts.Node): string {
        if (ts.isForStatement(node)) return 'for loop';
        if (ts.isForInStatement(node)) return 'for...in loop';
        if (ts.isForOfStatement(node)) return 'for...of loop';
        if (ts.isWhileStatement(node)) return 'while loop';
        if (ts.isDoStatement(node)) return 'do...while loop';
        return 'loop';
    }

    private createIssue(builder: IssueBuilder): CodeIssue {
        return {
            id: builder.id,
            title: builder.title,
            description: builder.description,
            category: builder.category,
            severity: builder.severity,
            location: {
                filePath: this.filePath,
                range: {
                    start: { line: builder.line, column: builder.column },
                    end: { line: builder.endLine, column: builder.endColumn },
                },
            },
            codeSnippet: builder.codeSnippet,
            confidence: builder.confidence,
            impact: this.getImpactForSeverity(builder.severity),
            createdAt: Date.now(),
        };
    }

    private getImpactForSeverity(severity: Severity): number {
        switch (severity) {
            case 'BLOCKER': return 100;
            case 'CRITICAL': return 90;
            case 'MAJOR': return 60;
            case 'MINOR': return 40;
            case 'INFO': return 20;
        }
    }

    /**
     * Check if a node has a @ts-ignore or @ts-nocheck comment using TypeScript's comment trivia API.
     * This avoids false positives from finding these strings in code/strings/regexes.
     */
    private hasLeadingTsIgnore(node: ts.Node): boolean {
        if (!this.sourceFile) return false;

        const sourceText = this.sourceFile.getFullText();
        const commentRanges = ts.getLeadingCommentRanges(
            sourceText,
            node.getFullStart()
        );

        if (!commentRanges) return false;

        return commentRanges.some(range => {
            const commentText = sourceText.slice(range.pos, range.end);
            return commentText.includes('@ts-ignore') || commentText.includes('@ts-nocheck');
        });
    }
}
