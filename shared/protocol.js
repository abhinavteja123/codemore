"use strict";
/**
 * CodeMore JSON-RPC Protocol Definitions
 * Shared types between Extension Host, Daemon, and Webview
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = exports.RpcErrorCodes = void 0;
exports.isJsonRpcRequest = isJsonRpcRequest;
exports.isJsonRpcResponse = isJsonRpcResponse;
exports.isJsonRpcNotification = isJsonRpcNotification;
exports.createRequest = createRequest;
exports.createResponse = createResponse;
exports.createErrorResponse = createErrorResponse;
exports.createNotification = createNotification;
// Standard JSON-RPC error codes
exports.RpcErrorCodes = {
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
};
exports.DEFAULT_CONFIG = {
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
};
function isJsonRpcRequest(msg) {
    return (typeof msg === 'object' &&
        msg !== null &&
        'jsonrpc' in msg &&
        msg.jsonrpc === '2.0' &&
        'method' in msg &&
        'id' in msg);
}
function isJsonRpcResponse(msg) {
    return (typeof msg === 'object' &&
        msg !== null &&
        'jsonrpc' in msg &&
        msg.jsonrpc === '2.0' &&
        'id' in msg &&
        ('result' in msg || 'error' in msg));
}
function isJsonRpcNotification(msg) {
    return (typeof msg === 'object' &&
        msg !== null &&
        'jsonrpc' in msg &&
        msg.jsonrpc === '2.0' &&
        'method' in msg &&
        !('id' in msg));
}
function createRequest(id, method, params) {
    return { jsonrpc: '2.0', id, method, params };
}
function createResponse(id, result) {
    return { jsonrpc: '2.0', id, result };
}
function createErrorResponse(id, error) {
    return { jsonrpc: '2.0', id, error };
}
function createNotification(method, params) {
    return { jsonrpc: '2.0', method, params };
}
//# sourceMappingURL=protocol.js.map