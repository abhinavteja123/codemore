/**
 * Suggestion Engine
 * 
 * Generates actionable refactoring suggestions with diffs.
 * Prioritizes suggestions by impact and confidence.
 */

import { AiService } from './aiService';
import { ContextMap } from './contextMap';
import {
    CodeIssue,
    CodeSuggestion,
    FileContext,
} from '../../shared/protocol';

export class SuggestionEngine {
    private issueCache = new Map<string, CodeIssue>();
    private suggestionCache = new Map<string, CodeSuggestion[]>();
    private suggestionById = new Map<string, CodeSuggestion>();

    constructor(
        private readonly aiService: AiService,
        private readonly contextMap: ContextMap
    ) { }

    /**
     * Analyze a file and return issues
     */
    async analyzeFile(
        filePath: string,
        content: string,
        context: FileContext
    ): Promise<CodeIssue[]> {
        console.log(`[SuggestionEngine] Analyzing: ${filePath}`);

        const issues = await this.aiService.analyzeCode(filePath, content, context);

        // Cache issues
        for (const issue of issues) {
            this.issueCache.set(issue.id, issue);
        }

        // Sort by priority (severity + impact + confidence)
        issues.sort((a, b) => {
            const scoreA = this.calculatePriority(a);
            const scoreB = this.calculatePriority(b);
            return scoreB - scoreA;
        });

        return issues;
    }

    /**
     * Get suggestions for a specific issue
     * Returns only cached suggestions - no generation happens here
     * Use generateAiFixForIssue() to explicitly request AI-powered fixes
     */
    async getSuggestionsForIssue(issueId: string): Promise<CodeSuggestion[]> {
        // Check cache only - no generation
        const cached = this.suggestionCache.get(issueId);
        if (cached) {
            console.log(`[SuggestionEngine] Returning ${cached.length} cached suggestions for: ${issueId}`);
            return cached;
        }

        // No suggestions available - user must click "Generate Fix" button
        console.log(`[SuggestionEngine] No cached suggestions for: ${issueId}. User must generate fix explicitly.`);
        return [];
    }

    /**
     * Generate AI-powered fix for a specific issue
     * This is the targeted approach - only invoked when user explicitly requests it
     * 
     * @param issueId The ID of the issue to fix
     * @param includeRelatedFiles Whether to gather and include related files for context
     * @returns Array of AI-generated fix suggestions
     */
    async generateAiFixForIssue(issueId: string, includeRelatedFiles: boolean = true): Promise<CodeSuggestion[]> {
        console.log(`[SuggestionEngine] Generating AI fix for issue: ${issueId}`);

        // Get the issue
        const issue = this.issueCache.get(issueId);
        if (!issue) {
            console.log(`[SuggestionEngine] Issue not found: ${issueId}`);
            return [];
        }

        // Get file context
        const fileContext = this.contextMap.getFileContext(issue.location.filePath);
        if (!fileContext) {
            console.log(`[SuggestionEngine] File context not found: ${issue.location.filePath}`);
            return [];
        }

        // Get file content
        const content = await this.contextMap.getFileContent(issue.location.filePath);

        // Optionally gather related files for better context
        const relatedFiles: Array<{ path: string; content: string; context: FileContext }> = [];
        
        if (includeRelatedFiles) {
            const relatedPaths = await this.gatherRelatedFiles(issue.location.filePath, fileContext);
            console.log(`[SuggestionEngine] Found ${relatedPaths.length} related files`);
            
            for (const relatedPath of relatedPaths) {
                const relatedContext = this.contextMap.getFileContext(relatedPath);
                if (relatedContext) {
                    const relatedContent = await this.contextMap.getFileContent(relatedPath);
                    relatedFiles.push({
                        path: relatedPath,
                        content: relatedContent,
                        context: relatedContext,
                    });
                }
            }
        }

        // Call AI service to generate fix with full context
        const suggestions = await this.aiService.generateAiFixForIssue(
            issue,
            content,
            fileContext,
            relatedFiles
        );

        // Cache suggestions by issue ID and by suggestion ID
        this.suggestionCache.set(issueId, suggestions);
        for (const suggestion of suggestions) {
            this.suggestionById.set(suggestion.id, suggestion);
        }

        console.log(`[SuggestionEngine] Generated ${suggestions.length} AI-powered suggestions`);
        return suggestions;
    }

    /**
     * Gather related files that might be relevant for understanding the issue
     * Includes: imported files, files that import this file, and files in same directory
     * 
     * @param filePath The main file path
     * @param context The file context with imports/exports
     * @returns Array of related file paths (limited to most relevant)
     */
    private async gatherRelatedFiles(filePath: string, context: FileContext): Promise<string[]> {
        const relatedFiles = new Set<string>();
        const maxRelatedFiles = 5; // Limit to avoid sending too much context

        // 1. Add directly imported files (most relevant)
        for (const imp of context.imports) {
            if (imp.isRelative) {
                // Try to resolve relative import
                const resolved = this.resolveImport(filePath, imp.module);
                if (resolved) {
                    relatedFiles.add(resolved);
                }
            }
        }

        // 2. Find files that import this file (reverse dependencies)
        const allFiles = await this.contextMap.getAllFiles();
        for (const otherPath of allFiles) {
            if (otherPath === filePath) continue;
            if (relatedFiles.size >= maxRelatedFiles) break;

            const otherContext = this.contextMap.getFileContext(otherPath);
            if (otherContext) {
                // Check if this file imports our target file
                for (const imp of otherContext.imports) {
                    if (imp.isRelative) {
                        const resolved = this.resolveImport(otherPath, imp.module);
                        if (resolved === filePath) {
                            relatedFiles.add(otherPath);
                            break;
                        }
                    }
                }
            }
        }

        return Array.from(relatedFiles).slice(0, maxRelatedFiles);
    }

    /**
     * Resolve a relative import to an absolute path
     * 
     * @param fromPath The file doing the importing
     * @param importPath The relative import path
     * @returns The resolved absolute path, or null if not found
     */
    private resolveImport(fromPath: string, importPath: string): string | null {
        // Basic resolution - in production you'd use proper module resolution
        const path = require('path');
        const dir = path.dirname(fromPath);
        
        // Handle various import styles
        let resolved = path.resolve(dir, importPath);
        
        // Try with common extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
        
        for (const ext of extensions) {
            const candidate = resolved + ext;
            if (this.contextMap.getFileContext(candidate)) {
                return candidate;
            }
        }

        // Try as-is
        if (this.contextMap.getFileContext(resolved)) {
            return resolved;
        }

        return null;
    }

    /**
     * Get a suggestion by its ID
     */
    getSuggestionById(suggestionId: string): CodeSuggestion | null {
        return this.suggestionById.get(suggestionId) || null;
    }

    /**
     * Get all suggestions for a file
     */
    async getSuggestionsForFile(filePath: string): Promise<CodeSuggestion[]> {
        const fileContext = this.contextMap.getFileContext(filePath);
        if (!fileContext) {
            return [];
        }

        const suggestions: CodeSuggestion[] = [];
        for (const issue of fileContext.issues) {
            const issueSuggestions = await this.getSuggestionsForIssue(issue.id);
            suggestions.push(...issueSuggestions);
        }

        return suggestions;
    }

    /**
     * Calculate priority score for an issue
     */
    private calculatePriority(issue: CodeIssue): number {
        const severityWeights = {
            'BLOCKER': 120,
            'CRITICAL': 100,
            'MAJOR': 60,
            'MINOR': 30,
            'INFO': 10,
        };

        const categoryWeights = {
            'security': 50,
            'bug': 40,
            'performance': 30,
            'maintainability': 20,
            'code-smell': 15,
            'best-practice': 10,
            'accessibility': 10,
        };

        const severityScore = severityWeights[issue.severity as keyof typeof severityWeights] || 0;
        const categoryScore = categoryWeights[issue.category] || 0;
        const confidenceScore = issue.confidence;
        const impactScore = issue.impact;

        // Weighted combination
        return (
            severityScore * 0.4 +
            categoryScore * 0.2 +
            confidenceScore * 0.2 +
            impactScore * 0.2
        );
    }

    /**
     * Clear caches
     */
    clearCache(): void {
        this.issueCache.clear();
        this.suggestionCache.clear();
        this.suggestionById.clear();
    }

    /**
     * Get issue by ID
     */
    getIssue(issueId: string): CodeIssue | undefined {
        return this.issueCache.get(issueId);
    }

    /**
     * Get all cached issues
     */
    getAllIssues(): CodeIssue[] {
        return Array.from(this.issueCache.values());
    }
}
