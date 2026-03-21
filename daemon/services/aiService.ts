/**
 * AI Service
 * 
 * Handles communication with LLM APIs for code analysis.
 * Supports multiple providers (OpenAI, Anthropic, Gemini, local).
 * 
 * Analysis Pipeline (in order of execution):
 * 1. External Tools (Semgrep, Biome, Ruff, TFLint, Checkov) - Industry-standard, fast
 * 2. Built-in Static Analysis - TypeScript AST-based analysis
 * 3. AI Analysis (optional) - Deep semantic analysis when API key configured
 * 
 * External tool results are used to:
 * - Provide instant feedback without AI costs
 * - Identify "hot spots" for focused AI analysis
 * - Give AI better context about existing issues
 */

import { DaemonConfig, CodeIssue, CodeSuggestion, FileContext, Severity } from '../../shared/protocol';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { StaticAnalyzer, StaticAnalyzerConfig } from './staticAnalyzer';
import { ExternalToolRunner, ExternalToolsConfig } from './externalToolRunner';
import { SeverityRemapper } from './severityRemapper';

interface CacheEntry {
    response: string;
    timestamp: number;
}

/**
 * Represents a "hot spot" - a code region that warrants deeper AI analysis
 */
interface HotSpot {
    startLine: number;
    endLine: number;
    reason: string;
    severity: Severity;
    source: 'static' | 'external';
}

/**
 * Analysis result with metadata for performance tracking
 */
interface AnalysisResult {
    issues: CodeIssue[];
    sources: {
        external: number;
        static: number;
        ai: number;
    };
    executionTimeMs: number;
}

function normalizeParsedSuggestions(payload: unknown): CodeSuggestion[] | null {
    let suggestions: CodeSuggestion[] | null = null;

    if (Array.isArray(payload)) {
        suggestions = payload as CodeSuggestion[];
    } else if (
        typeof payload === 'object' &&
        payload !== null &&
        'suggestions' in payload &&
        Array.isArray((payload as { suggestions: unknown }).suggestions)
    ) {
        suggestions = (payload as { suggestions: CodeSuggestion[] }).suggestions;
    }

    if (!suggestions) return null;

    // Filter out incomplete suggestions - must have required fields with actual content
    const validSuggestions = suggestions.filter(s =>
        s &&
        typeof s === 'object' &&
        s.id &&
        s.suggestedCode &&
        typeof s.suggestedCode === 'string' &&
        s.suggestedCode.trim().length > 10 // Must have meaningful code
    );

    return validSuggestions.length > 0 ? validSuggestions : null;
}

function stripMarkdownCodeFence(text: string): string {
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

/**
 * Sanitize JSON string by removing/escaping bad control characters
 * that can break JSON.parse()
 */
function sanitizeJsonString(text: string): string {
    // Replace problematic control characters inside strings
    // JSON allows: \n, \r, \t, \b, \f but raw versions break parsing
    let result = text;

    // First, remove any BOM or zero-width characters
    result = result.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '');

    // Replace raw control characters (except in escape sequences) with escaped versions
    // This regex matches control chars (0x00-0x1F) that are NOT preceded by backslash
    result = result.replace(/(?<!\\)([\x00-\x08\x0B\x0C\x0E-\x1F])/g, (match) => {
        const code = match.charCodeAt(0);
        return `\\u${code.toString(16).padStart(4, '0')}`;
    });

    return result;
}

/**
 * Try to repair truncated JSON by closing open brackets/braces
 */
function tryRepairTruncatedJson(text: string): string | null {
    let inString = false;
    let escaped = false;
    const stack: string[] = [];

    for (const char of text) {
        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (char === '[' || char === '{') {
            stack.push(char);
        } else if (char === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === '[') {
                stack.pop();
            }
        } else if (char === '}') {
            if (stack.length > 0 && stack[stack.length - 1] === '{') {
                stack.pop();
            }
        }
    }

    // If we're in an unclosed string, close it
    let repaired = text;
    if (inString) {
        repaired += '"';
    }

    // Close any open brackets/braces in reverse order
    while (stack.length > 0) {
        const opener = stack.pop();
        repaired += opener === '[' ? ']' : '}';
    }

    return repaired;
}

function extractBalancedJson(text: string, opener: '[' | '{'): string | null {
    const start = text.indexOf(opener);
    if (start === -1) {
        return null;
    }

    const closer = opener === '[' ? ']' : '}';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index++) {
        const char = text[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (inString) {
            continue;
        }

        if (char === opener) {
            depth++;
        } else if (char === closer) {
            depth--;
            if (depth === 0) {
                return text.slice(start, index + 1);
            }
        }
    }

    return null;
}

export function parseAiFixResponseText(responseText: string): CodeSuggestion[] {
    const candidates = new Set<string>();
    const trimmed = responseText.trim();

    // Sanitize to remove bad control characters
    const sanitized = sanitizeJsonString(trimmed);
    const stripped = stripMarkdownCodeFence(sanitized);

    // Try various extraction methods
    for (const candidate of [sanitized, stripped]) {
        if (candidate) {
            candidates.add(candidate);
        }

        const arrayCandidate = extractBalancedJson(candidate, '[');
        if (arrayCandidate) {
            candidates.add(arrayCandidate);
        }

        const objectCandidate = extractBalancedJson(candidate, '{');
        if (objectCandidate) {
            candidates.add(objectCandidate);
        }
    }

    // First pass: try parsing candidates as-is
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate) as unknown;
            const suggestions = normalizeParsedSuggestions(parsed);
            if (suggestions && suggestions.length > 0) {
                console.log(`[AiService] Successfully parsed ${suggestions.length} suggestions`);
                return suggestions;
            }
        } catch {
            // Try the next candidate.
        }
    }

    // Second pass: try repairing truncated JSON
    console.log('[AiService] Attempting to repair truncated JSON response...');
    for (const candidate of candidates) {
        const repaired = tryRepairTruncatedJson(candidate);
        if (repaired && repaired !== candidate) {
            try {
                const parsed = JSON.parse(repaired) as unknown;
                const suggestions = normalizeParsedSuggestions(parsed);
                if (suggestions && suggestions.length > 0) {
                    console.log(`[AiService] Repaired and parsed ${suggestions.length} suggestions`);
                    return suggestions;
                }
            } catch {
                // Repair failed, continue
            }
        }
    }

    // Third pass: try to extract at least the first complete suggestion object
    console.log('[AiService] Attempting to extract partial suggestions...');
    const firstSuggestionMatch = sanitized.match(/\{\s*"id"\s*:\s*"[^"]+"\s*,[\s\S]*?"tags"\s*:\s*\[[^\]]*\]\s*\}/);
    if (firstSuggestionMatch) {
        try {
            const parsed = JSON.parse(firstSuggestionMatch[0]) as CodeSuggestion;
            if (parsed.id && parsed.suggestedCode) {
                console.log('[AiService] Extracted 1 partial suggestion');
                return [parsed];
            }
        } catch {
            // Partial extraction failed
        }
    }

    throw new Error('Failed to parse AI fix response - the AI returned malformed or incomplete JSON');
}

export class AiService {
    private cache = new Map<string, CacheEntry>();
    private config: DaemonConfig;
    private geminiModel: GenerativeModel | null = null;
    private staticAnalyzer: StaticAnalyzer;
    private externalToolRunner: ExternalToolRunner;
    private severityRemapper: SeverityRemapper;

    constructor(config: DaemonConfig) {
        this.config = config;
        this.staticAnalyzer = new StaticAnalyzer();
        this.externalToolRunner = new ExternalToolRunner();
        this.severityRemapper = new SeverityRemapper();
        this.initGemini();
    }

    /**
     * Initialize Gemini model if configured
     */
    private initGemini(): void {
        if (this.config.aiProvider === 'gemini' && this.config.apiKey) {
            try {
                const genAI = new GoogleGenerativeAI(this.config.apiKey);
                this.geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
                console.log('[AiService] Gemini model initialized');
            } catch (error) {
                console.error('[AiService] Failed to initialize Gemini:', error);
                this.geminiModel = null;
            }
        }
    }

    /**
     * Update configuration
     */
    updateConfig(config: DaemonConfig): void {
        const providerChanged = config.aiProvider !== this.config.aiProvider;
        const keyChanged = config.apiKey !== this.config.apiKey;
        
        this.config = config;

        // Clear cache and reinitialize if provider or key changed
        if (providerChanged || keyChanged) {
            this.cache.clear();
            this.geminiModel = null;
            this.initGemini();
        }
    }

    /**
     * Update external tools configuration
     */
    updateExternalToolsConfig(config: Partial<ExternalToolsConfig>): void {
        this.externalToolRunner.updateConfig(config);
    }

    /**     * Recheck external tool availability (call after downloading binaries)
     */
    async recheckExternalTools(): Promise<void> {
        await this.externalToolRunner.recheckToolAvailability();
    }

    /**     * Get external tool status for diagnostics
     */
    getExternalToolStatus(): Record<string, boolean> {
        return this.externalToolRunner.getToolStatus();
    }

    /**
     * Check if AI is available (API key configured)
     */
    isAiAvailable(): boolean {
        return !!this.config.apiKey;
    }

    /**
     * Analyze code and generate issues
     * 
     * Analysis Pipeline:
     * 1. External tools (Semgrep, Biome, Ruff, etc.) - parallel, fast
     * 2. Built-in static analysis - TypeScript AST-based
     * 3. AI analysis (optional) - focused on hot spots identified by steps 1 & 2
     * 
     * Uses a hybrid approach: static analysis always runs, AI enhances when available
     */
    async analyzeCode(
        filePath: string,
        content: string,
        context: FileContext
    ): Promise<CodeIssue[]> {
        const startTime = Date.now();
        let externalIssueCount = 0;
        let staticIssueCount = 0;
        let aiIssueCount = 0;

        const analysisMode = this.config.analysisTools || 'both';

        // Step 1: Run external tools and/or built-in static analysis based on settings
        let externalIssues: CodeIssue[] = [];
        let staticIssues: CodeIssue[] = [];

        if (analysisMode === 'both' || analysisMode === 'external') {
            externalIssues = await this.runExternalTools(filePath, content);
            externalIssueCount = externalIssues.length;
        }

        if (analysisMode === 'both' || analysisMode === 'internal') {
            staticIssues = this.performStaticAnalysis(filePath, content, context);
            staticIssueCount = staticIssues.length;
        }

        // Step 2: Merge external and static issues, deduplicating
        const combinedIssues = this.mergeIssues(externalIssues, staticIssues);

        console.log(`[AiService] External tools: ${externalIssueCount} issues, Static analysis: ${staticIssueCount} issues (mode: ${analysisMode})`);

        // IMPORTANT: AI is NEVER called automatically during analysis
        // AI is only used when explicitly requested via generateAiFixForIssue()
        // This keeps analysis fast and cost-effective
        const totalTime = Date.now() - startTime;
        console.log(`[AiService] Analysis complete: ${combinedIssues.length} total issues (${totalTime}ms, no AI)`);
        
        // Apply severity remapping for better UX
        return this.severityRemapper.remapIssues(combinedIssues);
    }

    /**
     * Run external analysis tools on a file
     * These are industry-standard tools like Semgrep, Biome, Ruff, etc.
     */
    private async runExternalTools(filePath: string, content: string): Promise<CodeIssue[]> {
        try {
            return await this.externalToolRunner.analyzeFile(filePath, content);
        } catch (error) {
            console.error('[AiService] External tool analysis failed:', error);
            return [];
        }
    }

    /**
     * Identify "hot spots" - complex or problematic areas that AI should focus on
     * This enables cost-effective AI usage by targeting problem areas
     * 
     * Hot spots are identified from both external tool findings and static analysis
     */
    private identifyHotSpots(issues: CodeIssue[]): HotSpot[] {
        const hotSpots: HotSpot[] = [];
        const lineIssueCount = new Map<number, number>();

        // Count issues per line/region
        for (const issue of issues) {
            const line = issue.location.range.start.line;
            lineIssueCount.set(line, (lineIssueCount.get(line) || 0) + 1);
        }

        // Identify areas with multiple issues or high-severity issues
        for (const issue of issues) {
            const line = issue.location.range.start.line;
            const issueCount = lineIssueCount.get(line) || 0;

            // Mark as hotspot if:
            // 1. High severity (BLOCKER, CRITICAL, or MAJOR)
            // 2. Multiple issues in same area
            // 3. Complexity-related issues
            // 4. Security issues from external tools (Semgrep, Checkov)
            const isHighSeverity = issue.severity === 'BLOCKER' || issue.severity === 'CRITICAL' || issue.severity === 'MAJOR';
            const hasMultipleIssues = issueCount >= 2;
            const isComplexityIssue = issue.id.includes('cyclomatic') || 
                                       issue.id.includes('cognitive') || 
                                       issue.id.includes('nesting');
            const isSecurityIssue = issue.category === 'security' ||
                                     issue.id.startsWith('semgrep-') ||
                                     issue.id.startsWith('checkov-');

            if (isHighSeverity || hasMultipleIssues || isComplexityIssue || isSecurityIssue) {
                // Determine source based on issue ID prefix
                const source: 'static' | 'external' = 
                    issue.id.startsWith('semgrep-') || 
                    issue.id.startsWith('biome-') || 
                    issue.id.startsWith('ruff-') ||
                    issue.id.startsWith('tflint-') ||
                    issue.id.startsWith('checkov-') ? 'external' : 'static';

                hotSpots.push({
                    startLine: issue.location.range.start.line,
                    endLine: issue.location.range.end.line,
                    reason: issue.title,
                    severity: issue.severity,
                    source,
                });
            }
        }

        // Deduplicate overlapping hotspots
        return this.deduplicateHotSpots(hotSpots);
    }

    /**
     * Deduplicate overlapping hot spots
     */
    private deduplicateHotSpots(hotSpots: HotSpot[]): HotSpot[] {
        if (hotSpots.length === 0) return [];

        // Sort by start line
        const sorted = [...hotSpots].sort((a, b) => a.startLine - b.startLine);
        const result: HotSpot[] = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const last = result[result.length - 1];

            // If overlapping or adjacent, merge
            if (current.startLine <= last.endLine + 5) {
                last.endLine = Math.max(last.endLine, current.endLine);
                last.reason = `${last.reason}; ${current.reason}`;
            } else {
                result.push(current);
            }
        }

        return result;
    }

    /**
     * Merge static and AI issues, removing duplicates
     */
    private mergeIssues(staticIssues: CodeIssue[], aiIssues: CodeIssue[]): CodeIssue[] {
        const merged: CodeIssue[] = [...staticIssues];
        const existingLocations = new Set(
            staticIssues.map(i => `${i.location.range.start.line}:${i.category}:${i.title.toLowerCase().slice(0, 20)}`)
        );

        for (const aiIssue of aiIssues) {
            // Generate a key for deduplication
            const key = `${aiIssue.location.range.start.line}:${aiIssue.category}:${aiIssue.title.toLowerCase().slice(0, 20)}`;
            
            // Only add if not a duplicate
            if (!existingLocations.has(key)) {
                // Mark AI issues for UI differentiation
                merged.push({
                    ...aiIssue,
                    id: `ai-${aiIssue.id}`, // Prefix to indicate AI-generated
                });
                existingLocations.add(key);
            }
        }

        // Sort by severity and line number
        const severityOrder: Record<Severity, number> = { 'BLOCKER': 0, 'CRITICAL': 1, 'MAJOR': 2, 'MINOR': 3, 'INFO': 4 };
        return merged.sort((a, b) => {
            const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (severityDiff !== 0) return severityDiff;
            return a.location.range.start.line - b.location.range.start.line;
        });
    }

    /**
     * Generate suggestions for an issue
     */
    async generateSuggestion(
        issue: CodeIssue,
        fileContent: string,
        context: FileContext
    ): Promise<CodeSuggestion[]> {
        // For now, return mock suggestions
        // In production, this would call the AI API
        const suggestion: CodeSuggestion = {
            id: `suggestion-${issue.id}`,
            issueId: issue.id,
            title: `Fix: ${issue.title}`,
            description: `Suggested fix for the ${issue.category} issue`,
            originalCode: issue.codeSnippet,
            suggestedCode: this.generateMockFix(issue),
            diff: this.generateMockDiff(issue),
            location: issue.location,
            confidence: issue.confidence,
            impact: issue.impact,
            tags: [issue.category, issue.severity],
        };

        return [suggestion];
    }

    /**
     * Generate AI-powered fix for a specific issue with context
     * This is the targeted approach - only called when user selects an issue
     *
     * @param issue The issue to fix
     * @param fileContent The content of the file containing the issue
     * @param context The file context
     * @param relatedFiles Optional related file contexts for better understanding
     * @returns Array of AI-generated fix suggestions with diffs
     */
    async generateAiFixForIssue(
        issue: CodeIssue,
        fileContent: string,
        context: FileContext,
        relatedFiles: Array<{ path: string; content: string; context: FileContext }> = []
    ): Promise<CodeSuggestion[]> {
        console.log(`[AiService] Generating AI fix for issue: ${issue.id}`);
        console.log(`[AiService] AI provider: ${this.config.aiProvider}, API key configured: ${!!this.config.apiKey}`);

        // If no API key, return basic suggestion with clear message
        if (!this.config.apiKey) {
            console.log('[AiService] No API key configured, returning basic suggestion');
            console.log('[AiService] Configure an API key in settings (codemore.apiKey) for AI-powered fixes');
            return this.generateSuggestion(issue, fileContent, context);
        }

        try {
            // Build targeted prompt focused on this specific issue
            const prompt = this.buildFixPrompt(issue, fileContent, context, relatedFiles);

            console.log(`[AiService] Calling ${this.config.aiProvider} API...`);
            const startTime = Date.now();

            // Call AI API to generate fix
            const fixes = await this.callAiForFix(prompt, issue);

            const duration = Date.now() - startTime;
            console.log(`[AiService] Generated ${fixes.length} AI-powered fix suggestions in ${duration}ms`);
            return fixes;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[AiService] Failed to generate AI fix:', errorMessage);

            // Fallback: return a basic suggestion instead of failing completely
            console.log('[AiService] Returning fallback basic suggestion');
            const fallbackSuggestion: CodeSuggestion = {
                id: `fallback-${issue.id}`,
                issueId: issue.id,
                title: `Manual fix needed: ${issue.title}`,
                description: `AI was unable to generate a fix automatically. ${issue.description}. Please review and fix this issue manually. Error: ${errorMessage}`,
                originalCode: issue.codeSnippet || '',
                suggestedCode: `// TODO: Fix ${issue.title}\n// ${issue.description}\n${issue.codeSnippet || ''}`,
                diff: `- ${issue.codeSnippet || 'original code'}\n+ // TODO: Fix manually`,
                location: issue.location,
                confidence: 30,
                impact: issue.impact || 50,
                tags: [issue.category, issue.severity, 'fallback', 'manual-review-needed'],
            };
            return [fallbackSuggestion];
        }
    }

    /**
     * Build a targeted prompt for fixing a specific issue
     * This is much more focused than general code analysis
     */
    private buildFixPrompt(
        issue: CodeIssue,
        fileContent: string,
        context: FileContext,
        relatedFiles: Array<{ path: string; content: string; context: FileContext }>
    ): string {
        // Extract the relevant code section (with context around the issue)
        const lines = fileContent.split('\n');
        const issueStartLine = issue.location.range.start.line;
        const issueEndLine = issue.location.range.end.line;

        // Get only 3 lines before and after for minimal context
        const contextStart = Math.max(0, issueStartLine - 3);
        const contextEnd = Math.min(lines.length, issueEndLine + 3);
        const relevantCode = lines.slice(contextStart, contextEnd).join('\n');

        // Very minimal prompt to prevent truncation
        return `Fix this ${context.language} code issue: "${issue.title}"

CODE (lines ${issueStartLine}-${issueEndLine}):
${relevantCode}

Return this exact JSON (keep suggestedCode SHORT, max 20 lines):
{"suggestions":[{"id":"fix-1","issueId":"${issue.id}","title":"Fix title","description":"Brief fix description","originalCode":"problematic code","suggestedCode":"fixed code","diff":"- old\\n+ new","location":${JSON.stringify(issue.location)},"confidence":85,"impact":80,"tags":["fix"]}]}`;
    }

    /**
     * Call AI API specifically for generating fixes
     * Returns structured CodeSuggestion objects
     */
    private async callAiForFix(prompt: string, issue: CodeIssue): Promise<CodeSuggestion[]> {
        let responseText: string;

        switch (this.config.aiProvider) {
            case 'openai':
                responseText = await this.callOpenAIForFix(prompt);
                break;
            case 'anthropic':
                responseText = await this.callAnthropicForFix(prompt);
                break;
            case 'gemini':
                responseText = await this.callGeminiForFix(prompt);
                break;
            case 'local':
                responseText = await this.callLocalForFix(prompt);
                break;
            default:
                throw new Error(`Unsupported AI provider: ${this.config.aiProvider}`);
        }

        try {
            return parseAiFixResponseText(responseText);
        } catch (parseError) {
            console.error('[AiService] Failed to parse AI response JSON:', parseError);
            console.error('[AiService] Raw response:', responseText.substring(0, 500));
            throw new Error('Failed to parse AI fix response');
        }
    }

    /**
     * Call OpenAI for fix generation
     */
    private async callOpenAIForFix(prompt: string): Promise<string> {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert code refactoring assistant. Return ONLY valid JSON with a top-level "suggestions" array. Keep responses complete but concise.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                response_format: {
                    type: 'json_object',
                },
                temperature: 0.3,
                max_tokens: 8000, // Increase to prevent truncation
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json() as { choices: Array<{ message?: { content?: string } }> };
        return data.choices[0]?.message?.content || '';
    }

    /**
     * Call Anthropic for fix generation
     */
    private async callAnthropicForFix(prompt: string): Promise<string> {
        if (!this.config.apiKey) throw new Error('Anthropic API key not configured');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey!,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 8000, // Increase to prevent truncation
                system: 'You are an expert code refactoring assistant. Return ONLY valid JSON with a "suggestions" array. No markdown, no explanations outside JSON.',
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status}`);
        }

        const data = await response.json() as { content: Array<{ text?: string }> };
        return data.content[0]?.text || '';
    }

    /**
     * Call Gemini for fix generation
     */
    private async callGeminiForFix(prompt: string): Promise<string> {
        if (!this.geminiModel) {
            throw new Error('Gemini model not initialized');
        }

        // Try up to 2 times with increasingly simpler prompts
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const promptToUse = attempt === 1 ? prompt : this.simplifyPrompt(prompt);
                console.log(`[AiService] Gemini attempt ${attempt}/2`);

                const result = await this.geminiModel.generateContent({
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: 'Return ONLY valid compact JSON. No markdown. Keep suggestedCode under 15 lines.' },
                                { text: promptToUse },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 4096,
                        responseMimeType: 'application/json',
                    },
                });

                const response = await result.response;
                let text = response.text();

                // Strip markdown if present
                if (text.startsWith('```')) {
                    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                    if (match) {
                        text = match[1];
                    }
                }

                // Quick validation - check if it looks complete
                if (text.includes('"suggestedCode"') && text.includes('"tags"') && text.endsWith('}')) {
                    return text;
                }

                console.log(`[AiService] Gemini attempt ${attempt} returned incomplete response, retrying...`);
            } catch (error) {
                console.log(`[AiService] Gemini attempt ${attempt} failed: ${error}`);
                if (attempt === 2) throw error;
            }
        }

        throw new Error('Gemini returned incomplete response after 2 attempts');
    }

    /**
     * Simplify prompt for retry attempts
     */
    private simplifyPrompt(prompt: string): string {
        // Extract just the issue title and request minimal fix
        const titleMatch = prompt.match(/issue: "([^"]+)"/i) || prompt.match(/Fix this .+ code issue: "([^"]+)"/);
        const title = titleMatch ? titleMatch[1] : 'this issue';

        return `Fix: "${title}". Return minimal JSON: {"suggestions":[{"id":"fix-1","issueId":"x","title":"Fix","description":"Fixed the issue","originalCode":"old","suggestedCode":"// fixed code here","diff":"- old\\n+ new","location":{"filePath":"x","range":{"start":{"line":0,"column":0},"end":{"line":0,"column":0}}},"confidence":80,"impact":80,"tags":["fix"]}]}`;
    }

    /**
     * Call local model for fix generation
     */
    private async callLocalForFix(prompt: string): Promise<string> {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'codellama',
                prompt,
                stream: false,
            }),
        });

        if (!response.ok) {
            throw new Error(`Local API error: ${response.status}`);
        }

        const data = await response.json() as { response?: string };
        return data.response || '';
    }

    /**
     * Call the AI API
     * Provides external tool context to help AI understand what has already been checked
     */
    private async callAiApi(
        filePath: string,
        content: string,
        context: FileContext,
        hotSpots: HotSpot[] = [],
        externalToolContext: string = ''
    ): Promise<CodeIssue[]> {
        const prompt = this.buildPrompt(filePath, content, context, hotSpots, externalToolContext);

        switch (this.config.aiProvider) {
            case 'openai':
                return await this.callOpenAI(prompt);
            case 'anthropic':
                return await this.callAnthropic(prompt);
            case 'gemini':
                return await this.callGemini(prompt);
            case 'local':
                return await this.callLocal(prompt);
            default:
                return [];
        }
    }

    /**
     * Call OpenAI API
     */
    private async callOpenAI(prompt: string): Promise<CodeIssue[]> {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a code quality analyzer. Analyze the provided code and return issues in JSON format.',
                        },
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    temperature: 0.3,
                    max_tokens: 2000,
                }),
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = await response.json() as { choices: Array<{ message?: { content?: string } }> };
            const content = data.choices[0]?.message?.content;

            if (!content) {
                return [];
            }

            // Parse JSON from response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch {
                    return [];
                }
            }

            return [];
        } catch (error) {
            console.error('[AiService] OpenAI API error:', error);
            throw error;
        }
    }

    /**
     * Call Anthropic API
     */
    private async callAnthropic(prompt: string): Promise<CodeIssue[]> {
        if (!this.config.apiKey) throw new Error('Anthropic API key not configured');
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey!,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: 'claude-3-sonnet-20240229',
                    max_tokens: 2000,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                }),
            });

            if (!response.ok) {
                throw new Error(`Anthropic API error: ${response.status}`);
            }

            const data = await response.json() as { content: Array<{ text?: string }> };
            const content = data.content[0]?.text;

            if (!content) {
                return [];
            }

            // Parse JSON from response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch {
                    return [];
                }
            }

            return [];
        } catch (error) {
            console.error('[AiService] Anthropic API error:', error);
            throw error;
        }
    }

    /**
     * Call Google Gemini API using the official SDK
     */
    private async callGemini(prompt: string): Promise<CodeIssue[]> {
        try {
            // Initialize model if not already done
            if (!this.geminiModel) {
                if (!this.config.apiKey) {
                    throw new Error('Gemini API key not configured');
                }
                const genAI = new GoogleGenerativeAI(this.config.apiKey);
                this.geminiModel = genAI.getGenerativeModel({
                    model: 'gemini-2.5-flash',
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 4000,
                    },
                });
            }

            const systemPrompt = `You are a code quality analyzer. Analyze the provided code and return issues in JSON format.
Return ONLY a valid JSON array, no additional text or markdown.`;

            const result = await this.geminiModel.generateContent([
                { text: systemPrompt },
                { text: prompt },
            ]);

            const response = await result.response;
            const content = response.text();

            if (!content) {
                console.log('[AiService] Gemini returned empty response');
                return [];
            }

            console.log('[AiService] Gemini response received, parsing...');

            // Parse JSON from response - try to extract JSON array
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                try {
                    const issues = JSON.parse(jsonMatch[0]);
                    console.log(`[AiService] Gemini found ${issues.length} issues`);
                    return issues;
                } catch (parseError) {
                    console.error('[AiService] Failed to parse Gemini JSON:', parseError);
                    return [];
                }
            }

            console.log('[AiService] No JSON array found in Gemini response');
            return [];
        } catch (error) {
            console.error('[AiService] Gemini API error:', error);
            throw error;
        }
    }

    /**
     * Call local model API (e.g., Ollama)
     */
    private async callLocal(prompt: string): Promise<CodeIssue[]> {
        try {
            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'codellama',
                    prompt,
                    stream: false,
                }),
            });

            if (!response.ok) {
                throw new Error(`Local API error: ${response.status}`);
            }

            const data = await response.json() as { response?: string };
            const content = data.response;

            if (!content) {
                return [];
            }

            // Parse JSON from response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch {
                    return [];
                }
            }

            return [];
        } catch (error) {
            console.error('[AiService] Local API error:', error);
            throw error;
        }
    }

    /**
     * Build analysis prompt with external tool context
     * The prompt informs AI about what tools have already checked,
     * so it can focus on deeper semantic issues
     */
    private buildPrompt(
        filePath: string, 
        content: string, 
        context: FileContext,
        hotSpots: HotSpot[] = [],
        externalToolContext: string = ''
    ): string {
        // Build hotspot guidance for the AI
        let hotSpotSection = '';
        if (hotSpots.length > 0) {
            const hotSpotDetails = hotSpots.map(hs => 
                `  - Lines ${hs.startLine}-${hs.endLine}: ${hs.reason} (${hs.severity}, detected by: ${hs.source})`
            ).join('\n');
            hotSpotSection = `
PRIORITY AREAS (focus analysis here - issues detected by static tools):
${hotSpotDetails}

`;
        }

        // Build external tool context section
        let toolContextSection = '';
        if (externalToolContext) {
            toolContextSection = `
STATIC ANALYSIS ALREADY PERFORMED:
${externalToolContext}
The following checks have already been run. Focus on issues that these tools CANNOT detect.

`;
        }

        return `Analyze this ${context.language} code for issues. Return a JSON array of issues.

File: ${filePath}
${toolContextSection}${hotSpotSection}
Code:
\`\`\`${context.language}
${content.slice(0, 5000)} ${content.length > 5000 ? '\n... (truncated)' : ''}
\`\`\`

Context:
- Symbols: ${context.symbols.map(s => s.name).join(', ')}
- Imports: ${context.imports.map(i => i.module).join(', ')}
- Dependencies: ${context.dependencies.join(', ')}

Focus on finding issues that static analysis tools (ESLint, Semgrep, Ruff, etc.) CANNOT detect:
- Logic errors and edge cases in business logic
- API misuse patterns and incorrect library usage
- Race conditions and concurrency bugs
- Memory leaks and resource management issues
- Incorrect algorithm implementations
- Missing error handling in complex scenarios
- Architectural issues and design flaws
- Context-dependent bugs that require understanding program flow

DO NOT report:
- Style issues (already caught by Biome/Ruff)
- Common security patterns (already caught by Semgrep)
- Unused variables or imports (already caught by static analysis)
- Type errors (already caught by TypeScript)

Return issues in this JSON format:
[
  {
    "id": "unique-id",
    "title": "Issue title",
    "description": "Detailed description with WHY this matters and potential consequences",
    "category": "bug|code-smell|performance|security|maintainability|best-practice",
    "severity": "error|warning|info|hint",
    "location": {
      "filePath": "${filePath}",
      "range": { "start": { "line": 0, "column": 0 }, "end": { "line": 0, "column": 0 } }
    },
    "codeSnippet": "relevant code",
    "confidence": 80,
    "impact": 70
  }
]`;
    }

    /**
     * Perform advanced static analysis (fallback when no API key)
     * Uses the comprehensive StaticAnalyzer for deep code analysis
     */
    private performStaticAnalysis(
        filePath: string,
        content: string,
        context: FileContext
    ): CodeIssue[] {
        console.log(`[AiService] Performing advanced static analysis on: ${filePath}`);
        
        // Use the comprehensive static analyzer
        return this.staticAnalyzer.analyze(filePath, content, context);
    }

    /**
     * Update static analyzer configuration
     */
    updateStaticAnalyzerConfig(config: Partial<StaticAnalyzerConfig>): void {
        this.staticAnalyzer.updateConfig(config);
    }

    /**
     * Generate mock fix for an issue
     */
    private generateMockFix(issue: CodeIssue): string {
        // In production, this would use AI to generate the fix
        return issue.codeSnippet + ' // Fixed';
    }

    /**
     * Generate mock diff for an issue
     */
    private generateMockDiff(issue: CodeIssue): string {
        return `- ${issue.codeSnippet}\n+ ${issue.codeSnippet} // Fixed`;
    }

    /**
     * Get cache key
     */
    private getCacheKey(filePath: string, content: string): string {
        // Simple hash function
        let hash = 0;
        const str = filePath + content;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `analysis-${hash}`;
    }

    /**
     * Get from cache
     */
    private getFromCache(key: string): string | null {
        if (!this.config.cacheEnabled) {
            return null;
        }

        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }

        // Check TTL
        const ttlMs = this.config.cacheTTLMinutes * 60 * 1000;
        if (Date.now() - entry.timestamp > ttlMs) {
            this.cache.delete(key);
            return null;
        }

        return entry.response;
    }

    /**
     * Set cache entry
     */
    private setCache(key: string, response: string): void {
        if (!this.config.cacheEnabled) {
            return;
        }

        this.cache.set(key, {
            response,
            timestamp: Date.now(),
        });

        // Limit cache size
        if (this.cache.size > 1000) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear();
    }
}
