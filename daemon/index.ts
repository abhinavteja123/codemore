/* codemore-ignore-file: core-quality-async-without-await */
/*
 * Reason for the file-level suppression above:
 * Every method on `handlers` is a JSON-RPC handler whose signature MUST
 * be `Promise<T>` to satisfy the protocol contract — even when the
 * implementation is synchronous (returning cached state, etc.). The
 * `async` keyword is therefore architectural, not stylistic. Removing
 * it would break the IPC handshake.
 *
 * This is the ONLY rule suppressed at file level here. Empty-catches,
 * non-null assertions, etc. remain visible and should be fixed.
 */

/**
 * CodeMore Context Daemon - Entry Point
 *
 * Background service for code analysis, AST parsing, and AI suggestions.
 * Communicates with the extension host via IPC using JSON-RPC protocol.
 */

import { initSentry, captureError } from './lib/sentry';
import { createLogger, sanitizeError } from './lib/logger';

// Initialize Sentry FIRST (before any other setup)
initSentry();

const logger = createLogger('daemon');

import {
    JsonRpcRequest,
    JsonRpcResponse,
    JsonRpcNotification,
    DaemonConfig,
    DEFAULT_CONFIG,
    CodeIssue,
    CodeHealthMetrics,
    FileContext,
    ProjectContext,
    CodeSuggestion,
    createResponse,
    createErrorResponse,
    createNotification,
    RpcErrorCodes,
    isJsonRpcRequest,
    PROTOCOL_VERSION,
} from '../shared/protocol';

import { FileWatcher } from './services/fileWatcher';
import { AstParser } from './services/astParser';
import { ContextMap } from './services/contextMap';
import { AnalysisQueue } from './services/analysisQueue';
import { AiService } from './services/aiService';
import { SuggestionEngine } from './services/suggestionEngine';
import { loadProjectConfig, CodemoreConfig, DEFAULT_CONFIG as DEFAULT_PROJECT_CONFIG } from './services/configLoader';
import { runRegistryScan, scanFileWithRegistry } from './services/registryAdapter';
import type { ReportSummary, Severity as ReportSeverity } from '../shared/report/types';
import * as path from 'path';

// ============================================================================
// Daemon State
// ============================================================================

interface DaemonState {
    initialized: boolean;
    workspacePath: string | null;
    config: DaemonConfig;
    projectConfig: CodemoreConfig;
    version: string;
    /**
     * Most recent registry-scan result. The webview polls getAllIssues +
     * getMetrics after each scan; both read this cache. Empty until the
     * first analyzeWorkspace call lands.
     */
    latestRegistryIssues: CodeIssue[];
    latestRegistrySummary: ReportSummary | null;
    /** Total files discovered during the most recent walker pass. */
    latestTotalFiles: number;
}

const state: DaemonState = {
    initialized: false,
    workspacePath: null,
    config: DEFAULT_CONFIG,
    projectConfig: DEFAULT_PROJECT_CONFIG,
    version: '1.0.0',
    latestRegistryIssues: [],
    latestRegistrySummary: null,
    latestTotalFiles: 0,
};

// ============================================================================
// Services
// ============================================================================

let fileWatcher: FileWatcher | null = null;
let astParser: AstParser | null = null;
let contextMap: ContextMap | null = null;
let analysisQueue: AnalysisQueue | null = null;
let aiService: AiService | null = null;
let suggestionEngine: SuggestionEngine | null = null;

// ============================================================================
// IPC Communication
// ============================================================================

/**
 * Send a message to the extension host
 */
function send(message: JsonRpcResponse | JsonRpcNotification): void {
    if (process.send) {
        process.send(JSON.stringify(message));
    }
}

/**
 * Send a notification to the extension host
 */
function notify(method: string, params?: unknown): void {
    send(createNotification(method, params));
}

/**
 * Log to console (redirected to extension output)
 */
function log(message: string): void {
    logger.info(message);
}

function logError(message: string, error?: unknown): void {
    logger.error({ err: sanitizeError(error) }, message);
    notify('daemon/error', { message, details: error instanceof Error ? error.message : String(error) });
}

// Per-file registry scan lives in services/registryAdapter; thin wrapper
// here lets callers omit the workspace path on every call.
function scanSingleFileWithRegistry(absFilePath: string, content: string): CodeIssue[] {
    const root = state.workspacePath || path.dirname(absFilePath);
    return scanFileWithRegistry(root, absFilePath, content);
}

/**
 * Translate the schema-stable ReportSummary into the legacy dashboard's
 * CodeHealthMetrics shape so the webview's `getMetrics` polling produces
 * sensible numbers without needing a separate dashboard refactor.
 */
function deriveMetricsFromSummary(summary: ReportSummary, totalFiles: number): CodeHealthMetrics {
    const issuesBySeverity: Record<ReportSeverity, number> = {
        BLOCKER:  summary.bySeverity.BLOCKER  ?? 0,
        CRITICAL: summary.bySeverity.CRITICAL ?? 0,
        MAJOR:    summary.bySeverity.MAJOR    ?? 0,
        MINOR:    summary.bySeverity.MINOR    ?? 0,
        INFO:     summary.bySeverity.INFO     ?? 0,
    };

    // Coerce category counts into the legacy IssueCategory keyspace. The
    // registry can emit categories we don't list, so unknown buckets land
    // in 'code-smell' to avoid `undefined` defeating the dashboard charts.
    const knownCategories = new Set(['bug', 'code-smell', 'performance', 'security', 'maintainability', 'accessibility', 'best-practice']);
    const issuesByCategory: Record<string, number> = {
        bug: 0, 'code-smell': 0, performance: 0, security: 0, maintainability: 0, accessibility: 0, 'best-practice': 0,
    };
    for (const [cat, n] of Object.entries(summary.byCategory)) {
        const key = knownCategories.has(cat) ? cat : 'code-smell';
        issuesByCategory[key] = (issuesByCategory[key] ?? 0) + n;
    }

    return {
        overallScore: summary.score,
        issuesByCategory: issuesByCategory as CodeHealthMetrics['issuesByCategory'],
        issuesBySeverity,
        filesAnalyzed: summary.filesAnalyzed,
        totalFiles: Math.max(totalFiles, summary.filesAnalyzed),
        linesOfCode: summary.linesOfCode,
        // Registry doesn't track averageComplexity; 0 reads as "n/a" in the UI.
        averageComplexity: 0,
        technicalDebtMinutes: summary.technicalDebtMinutes,
    };
}

// ============================================================================
// Request Handlers
// ============================================================================

type RequestHandler = (params: unknown) => Promise<unknown>;

const handlers: Record<string, RequestHandler> = {
    /**
     * Initialize the daemon with workspace path and configuration
     */
    async initialize(params: unknown): Promise<{ success: boolean; version: string; projectConfig?: CodemoreConfig }> {
        const { workspacePath, config } = params as {
            workspacePath: string;
            config: DaemonConfig;
        };

        log(`Initializing with workspace: ${workspacePath}`);

        try {
            state.workspacePath = workspacePath;
            state.config = { ...DEFAULT_CONFIG, ...config };

            // Load project-level config from .codemorerc.json
            state.projectConfig = await loadProjectConfig(workspacePath);
            log(`Project config loaded: ${JSON.stringify({
                rules: Object.keys(state.projectConfig.rules).length,
                ignore: state.projectConfig.ignore.length,
                maxComplexity: state.projectConfig.maxComplexity,
            })}`);

            // Initialize services
            astParser = new AstParser();
            contextMap = new ContextMap(
                workspacePath,
                // Merge exclude patterns from both daemon config and project config
                [...new Set([...state.config.excludePatterns, ...state.projectConfig.ignore])],
                state.config.maxFileSizeKB
            );
            // AiService now only powers AI-fix generation + external tool
            // status; scanning goes through the registry (see analyzeFile /
            // analyzeWorkspace). Project config thresholds/rules are applied
            // by the registry pipeline via .codemorerc.json.
            aiService = new AiService(state.config);
            suggestionEngine = new SuggestionEngine(aiService, contextMap);

            // Recheck external tool availability (binaries should be pre-packaged)
            await aiService.recheckExternalTools();

            analysisQueue = new AnalysisQueue(
                astParser,
                contextMap,
                suggestionEngine,
                state.config.maxConcurrentAnalysis
            );

            // Setup queue event handlers
            analysisQueue.onProgress((progress, total, filePath) => {
                notify('daemon/analysisProgress', { filePath, progress, total });
            });

            analysisQueue.onIssuesFound((_issues) => {
                // The legacy contextMap aggregator is no longer the source
                // of truth — the registry pipeline owns the issue list.
                // Re-broadcasting `contextMap.getAllIssues()` here used to
                // wipe the dashboard a second after analyzeWorkspace
                // populated it (queue's getAllIssues is []), causing the
                // "flash and vanish" glitch users reported. The on-save
                // path that triggers this queue now routes through the
                // registry's per-file scan inside suggestionEngine, which
                // updates state.latestRegistryIssues directly.
            });

            analysisQueue.onComplete(() => {
                // Same reasoning: don't overwrite the registry's metrics
                // cache with empty contextMap data. The legacy queue's
                // notion of "complete" doesn't map to the new pipeline.
            });

            // Initialize file watcher
            fileWatcher = new FileWatcher(
                workspacePath,
                state.config.excludePatterns,
                state.config.analysisDelay,
                state.config.maxFileSizeKB
            );

            fileWatcher.onFileChange(async (filePath, content) => {
                log(`File changed: ${filePath}`);
                if (state.config.autoAnalyze) {
                    await analysisQueue?.enqueue(filePath, content);
                }
            });

            // Perform initial workspace scan and notify about file discovery
            const scanResult = await contextMap.scanWorkspace();
            notify('daemon/fileDiscovery', { 
                totalFiles: scanResult.totalFiles, 
                fileTypes: scanResult.fileTypes 
            });

            state.initialized = true;
            log('Initialization complete');

            return { success: true, version: state.version, projectConfig: state.projectConfig };
        } catch (error) {
            logError('Initialization failed', error);
            throw error;
        }
    },

    /**
     * Shutdown the daemon gracefully
     */
    async shutdown(): Promise<{ success: boolean }> {
        log('Shutting down...');

        fileWatcher?.stop();
        analysisQueue?.stop();

        return { success: true };
    },

    /**
     * Analyze a single file via the rule registry.
     *
     * The legacy implementation pushed the file through the staticAnalyzer
     * monolith, which produced ~1,800 issues on this repo and ~58% scope-FPs
     * on third-party projects. We now scope the registry's per-file path
     * to this one file: same code path the CLI uses, same clean signal.
     */
    async analyzeFile(params: unknown): Promise<{ issues: CodeIssue[]; context: FileContext }> {
        const { filePath, content } = params as { filePath: string; content?: string };

        if (!astParser || !contextMap) {
            throw new Error('Daemon not initialized');
        }

        log(`Analyzing file (registry): ${filePath}`);

        const fileContent = content || await contextMap.getFileContent(filePath);

        // Keep the AST parse + context map update — the webview's symbol
        // browser still relies on this, and the registry's per-file run
        // benefits from the parsed source. Cost: one redundant parse on
        // this hot path; acceptable until we unify the parsers.
        const ast = await astParser.parse(filePath, fileContent);
        const fileContext = astParser.extractContext(filePath, ast, fileContent);
        contextMap.updateFile(filePath, fileContext);

        const issues = scanSingleFileWithRegistry(filePath, fileContent);
        fileContext.issues = issues;

        return { issues, context: fileContext };
    },

    /**
     * Analyze the entire workspace via the rule registry.
     *
     * Returns the same { totalFiles, analysisId } shape the legacy
     * implementation did, so the extension's notification-driven UI
     * keeps working unchanged. We additionally fire a
     * `daemon/issuesUpdated` notification with the registry's issues —
     * that's how the webview + diagnostic collection get populated.
     *
     * `force` (legacy cache-bypass flag) is no longer load-bearing:
     * the registry path runs the rules every time and has no per-scan
     * cache. We accept the parameter for callers that still pass it,
     * but the scan is always fresh — no behaviour difference today.
     */
    async analyzeWorkspace(_params: unknown): Promise<{ totalFiles: number; analysisId: string }> {
        if (!state.workspacePath) {
            throw new Error('Daemon not initialized');
        }

        log('Starting workspace scan (registry)...');

        const { issues, report } = await runRegistryScan(state.workspacePath, {
            enableExperimental: true,
        });

        // Persist for the webview's pull-style RPCs (getAllIssues / getMetrics).
        // Without this the dashboard would keep reading empty contextMap data.
        state.latestRegistryIssues  = issues;
        state.latestRegistrySummary = report.summary;
        state.latestTotalFiles      = report.summary.filesAnalyzed;

        // Push the fresh list to the extension. Extension fans this out to
        // the diagnostic collection (squiggles) and the webview (dashboard).
        notify('daemon/issuesUpdated', { issues });
        notify('daemon/metricsUpdated', { metrics: deriveMetricsFromSummary(report.summary, state.latestTotalFiles) });
        notify('daemon/analysisComplete', { issues, summary: report.summary });

        return { totalFiles: report.summary.filesAnalyzed, analysisId: `scan-${Date.now()}` };
    },

    /**
     * Stop ongoing analysis
     */
    async stopAnalysis(): Promise<{ success: boolean; message: string }> {
        if (!analysisQueue) {
            throw new Error('Daemon not initialized');
        }

        log('Stopping analysis...');
        
        // Stop and clear the analysis queue
        analysisQueue.stop();
        analysisQueue.clear();

        notify('daemon/analysisStopped', {});

        return { success: true, message: 'Analysis stopped' };
    },

    /**
     * Get analysis queue status
     */
    async getAnalysisStatus(): Promise<{ queued: number; processing: number; processed: number; total: number; isRunning: boolean }> {
        if (!analysisQueue) {
            return { queued: 0, processing: 0, processed: 0, total: 0, isRunning: false };
        }

        const status = analysisQueue.getStatus();
        return { ...status, isRunning: status.processing > 0 || status.queued > 0 };
    },

    /**
     * Get suggestions for a specific issue
     */
    async getSuggestions(params: unknown): Promise<{ suggestions: CodeSuggestion[] }> {
        const { issueId } = params as { issueId: string };

        if (!suggestionEngine) {
            throw new Error('Daemon not initialized');
        }

        const suggestions = await suggestionEngine.getSuggestionsForIssue(issueId);
        return { suggestions };
    },

    /**
     * Get a specific suggestion by its ID
     */
    async getSuggestionById(params: unknown): Promise<{ suggestion: CodeSuggestion | null }> {
        const { suggestionId } = params as { suggestionId: string };

        if (!suggestionEngine) {
            throw new Error('Daemon not initialized');
        }

        const suggestion = suggestionEngine.getSuggestionById(suggestionId);
        return { suggestion };
    },

    /**
     * Get suggestions for a file
     */
    async getSuggestionsForFile(params: unknown): Promise<{ suggestions: CodeSuggestion[] }> {
        const { filePath } = params as { filePath: string };

        if (!suggestionEngine) {
            throw new Error('Daemon not initialized');
        }

        const suggestions = await suggestionEngine.getSuggestionsForFile(filePath);
        return { suggestions };
    },

    /**
     * Generate AI-powered fix for a specific issue
     * This is the targeted approach - only called when user selects an issue
     */
    async generateAiFix(params: unknown): Promise<{ suggestions: CodeSuggestion[] }> {
        const { issueId, includeRelatedFiles = true } = params as { 
            issueId: string; 
            includeRelatedFiles?: boolean 
        };

        if (!suggestionEngine) {
            throw new Error('Daemon not initialized');
        }

        log(`Generating AI fix for issue: ${issueId}`);
        const suggestions = await suggestionEngine.generateAiFixForIssue(issueId, includeRelatedFiles);
        return { suggestions };
    },

    /**
     * Get code health metrics.
     *
     * Reads from the registry scan cache when present (post-Phase-3 path);
     * otherwise falls back to the legacy contextMap aggregator so an empty
     * dashboard isn't shown before the first scan.
     */
    async getMetrics(): Promise<{ metrics: CodeHealthMetrics }> {
        if (!contextMap) {
            throw new Error('Daemon not initialized');
        }

        if (state.latestRegistrySummary) {
            return { metrics: deriveMetricsFromSummary(state.latestRegistrySummary, state.latestTotalFiles) };
        }

        const metrics = contextMap.getHealthMetrics();
        return { metrics };
    },

    /**
     * Get context for a specific file
     */
    async getFileContext(params: unknown): Promise<{ context: FileContext | null }> {
        const { filePath } = params as { filePath: string };

        if (!contextMap) {
            throw new Error('Daemon not initialized');
        }

        const context = contextMap.getFileContext(filePath);
        return { context };
    },

    /**
     * Get the full project context
     */
    async getProjectContext(): Promise<{ context: ProjectContext }> {
        if (!contextMap) {
            throw new Error('Daemon not initialized');
        }

        const context = contextMap.getProjectContext();
        return { context };
    },

    /**
     * Get all issues across the project.
     *
     * Returns the registry scan's cache when present so the dashboard
     * webview's "Issues" tab sees the same set as the Problems panel.
     */
    async getAllIssues(): Promise<{ issues: CodeIssue[] }> {
        if (!contextMap) {
            throw new Error('Daemon not initialized');
        }

        if (state.latestRegistryIssues.length > 0 || state.latestRegistrySummary) {
            return { issues: state.latestRegistryIssues };
        }

        const issues = contextMap.getAllIssues();
        return { issues };
    },

    /**
     * Invalidate cache for a file
     */
    async invalidateFile(params: unknown): Promise<{ success: boolean }> {
        const { filePath } = params as { filePath: string };

        if (!contextMap) {
            throw new Error('Daemon not initialized');
        }

        contextMap.invalidateFile(filePath);
        return { success: true };
    },

    /**
     * Update configuration
     */
    async setConfig(params: unknown): Promise<{ success: boolean }> {
        const { config } = params as { config: Partial<DaemonConfig> };

        state.config = { ...state.config, ...config };

        // Update services with new config
        if (aiService) {
            aiService.updateConfig(state.config);
            
            // Update external tools config if provided
            if (config.externalTools) {
                aiService.updateExternalToolsConfig(config.externalTools);
            }
        }

        if (fileWatcher && config.excludePatterns) {
            fileWatcher.updateConfig(
                state.config.excludePatterns,
                state.config.maxFileSizeKB
            );
        } else if (fileWatcher && typeof config.maxFileSizeKB === 'number') {
            fileWatcher.updateConfig(
                state.config.excludePatterns,
                state.config.maxFileSizeKB
            );
        }

        if (contextMap && (config.excludePatterns || typeof config.maxFileSizeKB === 'number')) {
            contextMap.updateConfig(
                state.config.excludePatterns,
                state.config.maxFileSizeKB
            );
        }

        return { success: true };
    },

    /**
     * Get external tool status
     */
    async getExternalToolStatus(): Promise<{ tools: Record<string, { available: boolean }> }> {
        if (!aiService) {
            throw new Error('Daemon not initialized');
        }

        const toolStatus = aiService.getExternalToolStatus();
        const tools: Record<string, { available: boolean }> = {};
        
        for (const [tool, available] of Object.entries(toolStatus)) {
            tools[tool] = { available };
        }

        return { tools };
    },

    /**
     * Update external tools configuration
     */
    async setExternalToolsConfig(params: unknown): Promise<{ success: boolean }> {
        const { config } = params as { config: Partial<Record<string, { enabled?: boolean; path?: string; timeout?: number }>> };

        if (!aiService) {
            throw new Error('Daemon not initialized');
        }

        aiService.updateExternalToolsConfig(config);
        return { success: true };
    },
};

// ============================================================================
// Message Handling
// ============================================================================

/**
 * Check if message is a JSON-RPC notification (request without id)
 */
function isJsonRpcNotification(msg: unknown): boolean {
    if (typeof msg !== 'object' || msg === null) return false;
    const obj = msg as Record<string, unknown>;
    return (
        obj.jsonrpc === '2.0' &&
        typeof obj.method === 'string' &&
        !('id' in obj)
    );
}

/**
 * Handle incoming messages from the extension host
 */
async function handleMessage(data: unknown): Promise<void> {
    try {
        const message = typeof data === 'string' ? JSON.parse(data) : data;

        // Handle JSON-RPC notifications (no response expected)
        if (isJsonRpcNotification(message)) {
            const notification = message as { method: string; params?: unknown };
            const handler = handlers[notification.method];
            if (handler) {
                try {
                    log(`Handling notification: ${notification.method}`);
                    await handler(notification.params);
                } catch (error) {
                    logError(`Notification handler error for ${notification.method}`, error);
                }
            }
            // No response for notifications
            return;
        }

        // Handle JSON-RPC requests (response expected)
        if (!isJsonRpcRequest(message)) {
            // Silently ignore non-JSON-RPC messages (like shutdown signals)
            return;
        }

        const request = message as JsonRpcRequest;
        const handler = handlers[request.method];

        if (!handler) {
            send(
                createErrorResponse(request.id, {
                    code: RpcErrorCodes.METHOD_NOT_FOUND,
                    message: `Method not found: ${request.method}`,
                })
            );
            return;
        }

        try {
            log(`Handling: ${request.method}`);
            const result = await handler(request.params);
            send(createResponse(request.id, result));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logError(`Handler error for ${request.method}`, error);
            send(
                createErrorResponse(request.id, {
                    code: RpcErrorCodes.INTERNAL_ERROR,
                    message,
                    data: error instanceof Error ? error.stack : undefined,
                })
            );
        }
    } catch (error) {
        logError('Failed to handle message', error);
    }
}

// ============================================================================
// Process Setup
// ============================================================================

/**
 * Type guard for shutdown messages
 */
function isShutdownMessage(message: unknown): boolean {
    return (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        (message as { type: string }).type === 'shutdown'
    );
}

/**
 * Unified IPC message handler
 * Handles both JSON-RPC messages and shutdown signals
 */
process.on('message', (message: unknown) => {
    try {
        // Check for shutdown signal first (highest priority)
        if (isShutdownMessage(message)) {
            log('Received shutdown signal');
            cleanup();
            process.exit(0);
        }

        // Otherwise handle as JSON-RPC message
        handleMessage(message);
    } catch (error) {
        // Ensure errors in message handling don't prevent shutdown
        logError('Error in message handler', error);
    }
});

// Handle process termination
process.on('SIGTERM', () => {
    log('Received SIGTERM');
    cleanup();
    process.exit(0);
});

process.on('SIGINT', () => {
    log('Received SIGINT');
    cleanup();
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    captureError(error, { type: 'uncaughtException' });
    logger.fatal({ err: sanitizeError(error) }, 'Uncaught exception — daemon shutting down');
    cleanup();
    process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    captureError(error, { type: 'unhandledRejection' });
    logger.error({ err: sanitizeError(error) }, 'Unhandled promise rejection in daemon');
});

/**
 * Cleanup resources before exit
 */
function cleanup(): void {
    log('Cleaning up...');
    fileWatcher?.stop();
    analysisQueue?.stop();
}

// ============================================================================
// Startup
// ============================================================================

log('Context Daemon starting...');

// Small delay to ensure all handlers are set up
setTimeout(() => {
    // Signal ready to extension host with version info
    if (process.send) {
        process.send(JSON.stringify({
            type: 'ready',
            version: state.version,
            protocolVersion: PROTOCOL_VERSION,
        }));
    }
    log('Context Daemon ready');
}, 100);
