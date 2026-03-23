/**
 * CodeMore JSON-RPC Protocol Definitions
 * Shared types between Extension Host, Daemon, and Webview
 */

// ============================================================================
// Protocol Version
// ============================================================================

/**
 * Protocol version for IPC communication.
 * Bump this when making breaking changes to the protocol.
 * Extension will warn if daemon version doesn't match.
 */
export const PROTOCOL_VERSION = 1;

// ============================================================================
// Core Types
// ============================================================================

export interface Position {
    line: number;
    column: number;
}

export interface Range {
    start: Position;
    end: Position;
}

export interface FileLocation {
    filePath: string;
    range: Range;
}

// ============================================================================
// Issue & Suggestion Types
// ============================================================================

// Legacy severity type - kept for backward compatibility only
// DO NOT use in UI or logic - use Severity instead
export type OldSeverity = 'error' | 'warning' | 'info' | 'hint';

// Canonical severity levels - use this everywhere in UI and logic
export type Severity = 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';

// Deprecated: Use Severity instead
/** @deprecated Use Severity instead */
export type IssueSeverity = OldSeverity;
/** @deprecated Use Severity instead */
export type CanonicalSeverity = Severity;

export type IssueCategory =
    | 'bug'
    | 'code-smell'
    | 'performance'
    | 'security'
    | 'maintainability'
    | 'accessibility'
    | 'best-practice';

export interface CodeIssue {
    id: string;
    title: string;
    description: string;
    category: IssueCategory;
    severity: Severity; // Canonical severity - use this in UI and logic
    oldSeverity?: OldSeverity; // Legacy severity for backward compatibility only - DO NOT use in UI
    location: FileLocation;
    codeSnippet: string;
    confidence: number; // 0-100
    impact: number; // 0-100
    createdAt: number;
}

export interface CodeSuggestion {
    id: string;
    issueId: string;
    title: string;
    description: string;
    originalCode: string;
    suggestedCode: string;
    diff: string;
    location: FileLocation;
    confidence: number;
    impact: number;
    tags: string[];
}

// ============================================================================
// Context Map Types
// ============================================================================

export interface FileContext {
    filePath: string;
    language: string;
    size: number;
    lastModified: number;
    lastAnalyzed: number;
    symbols: SymbolInfo[];
    imports: ImportInfo[];
    exports: ExportInfo[];
    dependencies: string[];
    issues: CodeIssue[];
}

export interface SymbolInfo {
    name: string;
    kind: 'class' | 'function' | 'variable' | 'interface' | 'type' | 'enum' | 'constant';
    range: Range;
    documentation?: string;
    parameters?: ParameterInfo[];
    returnType?: string;
}

export interface ParameterInfo {
    name: string;
    type?: string;
    optional: boolean;
    defaultValue?: string;
}

export interface ImportInfo {
    module: string;
    isRelative: boolean;
    namedImports: string[];
    defaultImport?: string;
    namespaceImport?: string;
}

export interface ExportInfo {
    name: string;
    kind: SymbolInfo['kind'];
    isDefault: boolean;
}

export interface ProjectContext {
    rootPath: string;
    name: string;
    files: Map<string, FileContext>;
    dependencyGraph: Map<string, string[]>;
    totalIssues: number;
    lastFullAnalysis: number;
}

// ============================================================================
// Health Metrics
// ============================================================================

export interface CodeHealthMetrics {
    overallScore: number; // 0-100
    issuesByCategory: Record<IssueCategory, number>;
    issuesBySeverity: Record<Severity, number>;
    filesAnalyzed: number;
    totalFiles: number;
    linesOfCode: number;
    averageComplexity: number;
    technicalDebtMinutes: number;
}

// ============================================================================
// JSON-RPC Message Types
// ============================================================================

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: unknown;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number;
    result?: unknown;
    error?: JsonRpcError;
}

export interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
}

export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}

// Standard JSON-RPC error codes
export const RpcErrorCodes = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    // Custom error codes
    DAEMON_NOT_READY: -32000,
    ANALYSIS_FAILED: -32001,
    AI_SERVICE_UNAVAILABLE: -32002,
    FILE_NOT_FOUND: -32003,
    TIMEOUT: -32004,
} as const;

// ============================================================================
// RPC Method Definitions
// ============================================================================

// Daemon -> Extension Host notifications
export interface DaemonNotifications {
    'daemon/ready': { version: string; protocolVersion: number };
    'daemon/fileDiscovery': { totalFiles: number; fileTypes: Record<string, number> };
    'daemon/analysisProgress': { filePath: string; progress: number; total: number };
    'daemon/analysisComplete': { filePath: string; issues: CodeIssue[] };
    'daemon/analysisStopped': {};
    'daemon/issuesUpdated': { issues: CodeIssue[] };
    'daemon/metricsUpdated': { metrics: CodeHealthMetrics };
    'daemon/error': { message: string; details?: unknown };
}

// Extension Host -> Daemon requests
export interface DaemonMethods {
    'initialize': {
        params: { workspacePath: string; config: DaemonConfig };
        result: { success: boolean; version: string };
    };
    'shutdown': {
        params: {};
        result: { success: boolean };
    };
    'analyzeFile': {
        params: { filePath: string; content?: string };
        result: { issues: CodeIssue[]; context: FileContext };
    };
    'analyzeWorkspace': {
        params: { force?: boolean };
        result: { totalFiles: number; analysisId: string };
    };
    'stopAnalysis': {
        params: {};
        result: { success: boolean; message: string };
    };
    'getAnalysisStatus': {
        params: {};
        result: { queued: number; processing: number; processed: number; total: number; isRunning: boolean };
    };
    'getSuggestions': {
        params: { issueId: string };
        result: { suggestions: CodeSuggestion[] };
    };
    'getSuggestionById': {
        params: { suggestionId: string };
        result: { suggestion: CodeSuggestion | null };
    };
    'getSuggestionsForFile': {
        params: { filePath: string };
        result: { suggestions: CodeSuggestion[] };
    };
    'generateAiFix': {
        params: { issueId: string; includeRelatedFiles?: boolean };
        result: { suggestions: CodeSuggestion[] };
    };
    'getMetrics': {
        params: {};
        result: { metrics: CodeHealthMetrics };
    };
    'getFileContext': {
        params: { filePath: string };
        result: { context: FileContext | null };
    };
    'getProjectContext': {
        params: {};
        result: { context: ProjectContext };
    };
    'getAllIssues': {
        params: {};
        result: { issues: CodeIssue[] };
    };
    'invalidateFile': {
        params: { filePath: string };
        result: { success: boolean };
    };
    'setConfig': {
        params: { config: Partial<DaemonConfig> };
        result: { success: boolean };
    };
    'getExternalToolStatus': {
        params: {};
        result: { tools: ExternalToolStatus };
    };
    'setExternalToolsConfig': {
        params: { config: Partial<ExternalToolsConfig> };
        result: { success: boolean };
    };
}

// ============================================================================
// External Tool Configuration Types
// ============================================================================

export type ExternalToolName = 'semgrep' | 'biome' | 'ruff' | 'tflint' | 'checkov';

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

export interface ExternalToolStatus {
    semgrep: { available: boolean; version?: string };
    biome: { available: boolean; version?: string };
    ruff: { available: boolean; version?: string };
    tflint: { available: boolean; version?: string };
    checkov: { available: boolean; version?: string };
}

export const DEFAULT_EXTERNAL_TOOLS_CONFIG: ExternalToolsConfig = {
    semgrep: { enabled: true, timeout: 30000 },
    biome: { enabled: true, timeout: 10000 },
    ruff: { enabled: true, timeout: 10000 },
    tflint: { enabled: true, timeout: 15000 },
    checkov: { enabled: true, timeout: 30000 },
};

// ============================================================================
// Configuration Types
// ============================================================================

export interface DaemonConfig {
    aiProvider: 'openai' | 'anthropic' | 'gemini' | 'local';
    apiKey?: string;
    autoAnalyze: boolean;
    analysisDelay: number;
    excludePatterns: string[];
    maxFileSizeKB: number;
    enableTelemetry: boolean;
    maxConcurrentAnalysis: number;
    cacheEnabled: boolean;
    cacheTTLMinutes: number;
    externalTools?: Partial<ExternalToolsConfig>;
    analysisTools?: 'both' | 'external' | 'internal';
}

export const DEFAULT_CONFIG: DaemonConfig = {
    aiProvider: 'openai',
    autoAnalyze: true,
    analysisDelay: 2000,
    excludePatterns: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
    ],
    maxFileSizeKB: 500,
    enableTelemetry: false,
    maxConcurrentAnalysis: 3,
    cacheEnabled: true,
    cacheTTLMinutes: 30,
    analysisTools: 'both',
};

// ============================================================================
// Webview Message Types
// ============================================================================

export type WebviewToExtensionMessage =
    | { type: 'ready' }
    | { type: 'requestMetrics' }
    | { type: 'requestIssues'; filter?: IssueFilter }
    | { type: 'requestSuggestions'; issueId: string }
    | { type: 'generateAiFix'; issueId: string; includeRelatedFiles?: boolean }
    | { type: 'applySuggestion'; suggestionId: string }
    | { type: 'dismissIssue'; issueId: string }
    | { type: 'openFile'; filePath: string; line?: number }
    | { type: 'analyzeWorkspace' }
    | { type: 'stopAnalysis' }
    | { type: 'refreshDashboard' }
    | { type: 'openSettings' }
    | { type: 'exportIssues'; issues: CodeIssue[] };

export type ExtensionToWebviewMessage =
    | { type: 'metricsUpdate'; metrics: CodeHealthMetrics }
    | { type: 'issuesUpdate'; issues: CodeIssue[] }
    | { type: 'suggestionsUpdate'; suggestions: CodeSuggestion[] }
    | { type: 'fileDiscovery'; totalFiles: number; fileTypes: Record<string, number> }
    | { type: 'analysisProgress'; progress: number; total: number; currentFile?: string }
    | { type: 'analysisComplete' }
    | { type: 'analysisStopped' }
    | { type: 'error'; message: string }
    | { type: 'suggestionApplied'; suggestionId: string; success: boolean }
    | { type: 'themeChanged'; isDark: boolean };

export interface IssueFilter {
    categories?: IssueCategory[];
    severities?: Severity[];
    filePath?: string;
    searchQuery?: string;
    sortBy?: 'severity' | 'confidence' | 'impact' | 'date';
    sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Utility Types
// ============================================================================

export type MessageHandler<T> = (message: T) => void | Promise<void>;

export function isJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
    return (
        typeof msg === 'object' &&
        msg !== null &&
        'jsonrpc' in msg &&
        (msg as JsonRpcRequest).jsonrpc === '2.0' &&
        'method' in msg &&
        'id' in msg
    );
}

export function isJsonRpcResponse(msg: unknown): msg is JsonRpcResponse {
    return (
        typeof msg === 'object' &&
        msg !== null &&
        'jsonrpc' in msg &&
        (msg as JsonRpcResponse).jsonrpc === '2.0' &&
        'id' in msg &&
        ('result' in msg || 'error' in msg)
    );
}

export function isJsonRpcNotification(msg: unknown): msg is JsonRpcNotification {
    return (
        typeof msg === 'object' &&
        msg !== null &&
        'jsonrpc' in msg &&
        (msg as JsonRpcNotification).jsonrpc === '2.0' &&
        'method' in msg &&
        !('id' in msg)
    );
}

export function createRequest(id: string | number, method: string, params?: unknown): JsonRpcRequest {
    return { jsonrpc: '2.0', id, method, params };
}

export function createResponse(id: string | number, result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
}

export function createErrorResponse(id: string | number, error: JsonRpcError): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error };
}

export function createNotification(method: string, params?: unknown): JsonRpcNotification {
    return { jsonrpc: '2.0', method, params };
}
