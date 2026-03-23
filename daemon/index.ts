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

// ============================================================================
// Daemon State
// ============================================================================

interface DaemonState {
    initialized: boolean;
    workspacePath: string | null;
    config: DaemonConfig;
    version: string;
}

const state: DaemonState = {
    initialized: false,
    workspacePath: null,
    config: DEFAULT_CONFIG,
    version: '1.0.0',
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

// ============================================================================
// Request Handlers
// ============================================================================

type RequestHandler = (params: unknown) => Promise<unknown>;

const handlers: Record<string, RequestHandler> = {
    /**
     * Initialize the daemon with workspace path and configuration
     */
    async initialize(params: unknown): Promise<{ success: boolean; version: string }> {
        const { workspacePath, config } = params as {
            workspacePath: string;
            config: DaemonConfig;
        };

        log(`Initializing with workspace: ${workspacePath}`);

        try {
            state.workspacePath = workspacePath;
            state.config = { ...DEFAULT_CONFIG, ...config };

            // Initialize services
            astParser = new AstParser();
            contextMap = new ContextMap(
                workspacePath,
                state.config.excludePatterns,
                state.config.maxFileSizeKB
            );
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

            analysisQueue.onIssuesFound((issues) => {
                // Send all accumulated issues from contextMap, not just the current batch
                if (contextMap) {
                    const allIssues = contextMap.getAllIssues();
                    notify('daemon/issuesUpdated', { issues: allIssues });
                }
            });

            analysisQueue.onComplete(() => {
                // Analysis completed - send updated metrics
                if (contextMap) {
                    const metrics = contextMap.getHealthMetrics();
                    notify('daemon/metricsUpdated', { metrics });
                    notify('daemon/analysisComplete', { filePath: '', issues: [] });
                    log('Analysis complete');
                }
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

            return { success: true, version: state.version };
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
     * Analyze a single file
     */
    async analyzeFile(params: unknown): Promise<{ issues: CodeIssue[]; context: FileContext }> {
        const { filePath, content } = params as { filePath: string; content?: string };

        if (!astParser || !contextMap || !suggestionEngine) {
            throw new Error('Daemon not initialized');
        }

        log(`Analyzing file: ${filePath}`);

        // Get file content if not provided
        const fileContent = content || await contextMap.getFileContent(filePath);

        // Parse AST and extract context
        const ast = await astParser.parse(filePath, fileContent);
        const fileContext = astParser.extractContext(filePath, ast, fileContent);

        // Update context map
        contextMap.updateFile(filePath, fileContext);

        // Generate issues using AI
        const issues = await suggestionEngine.analyzeFile(filePath, fileContent, fileContext);
        fileContext.issues = issues;

        return { issues, context: fileContext };
    },

    /**
     * Analyze the entire workspace
     */
    async analyzeWorkspace(params: unknown): Promise<{ totalFiles: number; analysisId: string }> {
        const { force } = (params as { force?: boolean }) || {};

        if (!contextMap || !analysisQueue) {
            throw new Error('Daemon not initialized');
        }

        log('Starting workspace analysis...');

        // Reset analysis counters for new workspace analysis
        analysisQueue.reset();

        const files = await contextMap.getAllFiles();
        const analysisId = `analysis-${Date.now()}`;

        // Queue all files for analysis
        for (const filePath of files) {
            await analysisQueue.enqueue(filePath);
        }

        return { totalFiles: files.length, analysisId };
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
     * Get code health metrics
     */
    async getMetrics(): Promise<{ metrics: CodeHealthMetrics }> {
        if (!contextMap) {
            throw new Error('Daemon not initialized');
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
     * Get all issues across the project
     */
    async getAllIssues(): Promise<{ issues: CodeIssue[] }> {
        if (!contextMap) {
            throw new Error('Daemon not initialized');
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
            return;
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
