/**
 * CodeMore JSON-RPC Protocol Definitions
 * Shared types between Extension Host, Daemon, and Webview
 */
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
export type IssueSeverity = 'error' | 'warning' | 'info' | 'hint';
export type IssueCategory = 'bug' | 'code-smell' | 'performance' | 'security' | 'maintainability' | 'accessibility' | 'best-practice';
export interface CodeIssue {
    id: string;
    title: string;
    description: string;
    category: IssueCategory;
    severity: IssueSeverity;
    location: FileLocation;
    codeSnippet: string;
    confidence: number;
    impact: number;
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
export interface CodeHealthMetrics {
    overallScore: number;
    issuesByCategory: Record<IssueCategory, number>;
    issuesBySeverity: Record<IssueSeverity, number>;
    filesAnalyzed: number;
    totalFiles: number;
    linesOfCode: number;
    averageComplexity: number;
    technicalDebtMinutes: number;
}
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
export declare const RpcErrorCodes: {
    readonly PARSE_ERROR: -32700;
    readonly INVALID_REQUEST: -32600;
    readonly METHOD_NOT_FOUND: -32601;
    readonly INVALID_PARAMS: -32602;
    readonly INTERNAL_ERROR: -32603;
    readonly DAEMON_NOT_READY: -32000;
    readonly ANALYSIS_FAILED: -32001;
    readonly AI_SERVICE_UNAVAILABLE: -32002;
    readonly FILE_NOT_FOUND: -32003;
    readonly TIMEOUT: -32004;
};
export interface DaemonNotifications {
    'daemon/ready': {
        version: string;
    };
    'daemon/analysisProgress': {
        filePath: string;
        progress: number;
        total: number;
    };
    'daemon/analysisComplete': {
        filePath: string;
        issues: CodeIssue[];
    };
    'daemon/issuesUpdated': {
        issues: CodeIssue[];
    };
    'daemon/metricsUpdated': {
        metrics: CodeHealthMetrics;
    };
    'daemon/error': {
        message: string;
        details?: unknown;
    };
}
export interface DaemonMethods {
    'initialize': {
        params: {
            workspacePath: string;
            config: DaemonConfig;
        };
        result: {
            success: boolean;
            version: string;
        };
    };
    'shutdown': {
        params: {};
        result: {
            success: boolean;
        };
    };
    'analyzeFile': {
        params: {
            filePath: string;
            content?: string;
        };
        result: {
            issues: CodeIssue[];
            context: FileContext;
        };
    };
    'analyzeWorkspace': {
        params: {
            force?: boolean;
        };
        result: {
            totalFiles: number;
            analysisId: string;
        };
    };
    'getSuggestions': {
        params: {
            issueId: string;
        };
        result: {
            suggestions: CodeSuggestion[];
        };
    };
    'getSuggestionsForFile': {
        params: {
            filePath: string;
        };
        result: {
            suggestions: CodeSuggestion[];
        };
    };
    'getMetrics': {
        params: {};
        result: {
            metrics: CodeHealthMetrics;
        };
    };
    'getFileContext': {
        params: {
            filePath: string;
        };
        result: {
            context: FileContext | null;
        };
    };
    'getProjectContext': {
        params: {};
        result: {
            context: ProjectContext;
        };
    };
    'invalidateFile': {
        params: {
            filePath: string;
        };
        result: {
            success: boolean;
        };
    };
    'setConfig': {
        params: {
            config: Partial<DaemonConfig>;
        };
        result: {
            success: boolean;
        };
    };
}
export interface DaemonConfig {
    aiProvider: 'openai' | 'anthropic' | 'local';
    apiKey?: string;
    autoAnalyze: boolean;
    analysisDelay: number;
    excludePatterns: string[];
    maxFileSizeKB: number;
    enableTelemetry: boolean;
    maxConcurrentAnalysis: number;
    cacheEnabled: boolean;
    cacheTTLMinutes: number;
}
export declare const DEFAULT_CONFIG: DaemonConfig;
export type WebviewToExtensionMessage = {
    type: 'ready';
} | {
    type: 'requestMetrics';
} | {
    type: 'requestIssues';
    filter?: IssueFilter;
} | {
    type: 'requestSuggestions';
    issueId: string;
} | {
    type: 'applySuggestion';
    suggestionId: string;
} | {
    type: 'dismissIssue';
    issueId: string;
} | {
    type: 'openFile';
    filePath: string;
    line?: number;
} | {
    type: 'analyzeWorkspace';
} | {
    type: 'refreshDashboard';
};
export type ExtensionToWebviewMessage = {
    type: 'metricsUpdate';
    metrics: CodeHealthMetrics;
} | {
    type: 'issuesUpdate';
    issues: CodeIssue[];
} | {
    type: 'suggestionsUpdate';
    suggestions: CodeSuggestion[];
} | {
    type: 'analysisProgress';
    progress: number;
    total: number;
    currentFile?: string;
} | {
    type: 'analysisComplete';
} | {
    type: 'error';
    message: string;
} | {
    type: 'suggestionApplied';
    suggestionId: string;
    success: boolean;
} | {
    type: 'themeChanged';
    isDark: boolean;
};
export interface IssueFilter {
    categories?: IssueCategory[];
    severities?: IssueSeverity[];
    filePath?: string;
    searchQuery?: string;
    sortBy?: 'severity' | 'confidence' | 'impact' | 'date';
    sortOrder?: 'asc' | 'desc';
}
export type MessageHandler<T> = (message: T) => void | Promise<void>;
export declare function isJsonRpcRequest(msg: unknown): msg is JsonRpcRequest;
export declare function isJsonRpcResponse(msg: unknown): msg is JsonRpcResponse;
export declare function isJsonRpcNotification(msg: unknown): msg is JsonRpcNotification;
export declare function createRequest(id: string | number, method: string, params?: unknown): JsonRpcRequest;
export declare function createResponse(id: string | number, result: unknown): JsonRpcResponse;
export declare function createErrorResponse(id: string | number, error: JsonRpcError): JsonRpcResponse;
export declare function createNotification(method: string, params?: unknown): JsonRpcNotification;
