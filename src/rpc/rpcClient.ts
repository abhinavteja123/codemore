/**
 * CodeMore RPC Client
 * 
 * JSON-RPC client for communication between the extension host and daemon.
 * Handles request/response correlation, timeouts, and notifications.
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import {
    JsonRpcRequest,
    JsonRpcResponse,
    JsonRpcNotification,
    JsonRpcError,
    RpcErrorCodes,
    DaemonMethods,
    DaemonNotifications,
    createRequest,
    createNotification,
    isJsonRpcResponse,
    isJsonRpcNotification,
} from '../../shared/protocol';

interface PendingRequest {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
    method: string;
}

type NotificationHandler<T> = (params: T) => void;

export class RpcClient implements vscode.Disposable {
    private pendingRequests = new Map<string | number, PendingRequest>();
    private notificationHandlers = new Map<string, Set<NotificationHandler<unknown>>>();
    private requestId = 0;
    private defaultTimeout = 30000; // 30 seconds

    // Event for sending messages to daemon
    private readonly sendEmitter = new vscode.EventEmitter<string>();
    readonly onSendMessage = this.sendEmitter.event;

    constructor(private readonly outputChannel: vscode.OutputChannel) { }

    /**
     * Make an RPC call to the daemon
     */
    async call<M extends keyof DaemonMethods>(
        method: M,
        params: DaemonMethods[M]['params'],
        timeout?: number
    ): Promise<DaemonMethods[M]['result']> {
        const id = this.getNextId();
        const request = createRequest(id, method, params);
        const effectiveTimeout = timeout || this.defaultTimeout;

        return new Promise((resolve, reject) => {
            // Set timeout
            const timer = setTimeout(() => {
                const pending = this.pendingRequests.get(id);
                if (pending) {
                    this.pendingRequests.delete(id);
                    this.outputChannel.appendLine(`RPC timeout: ${method} (${effectiveTimeout}ms) - id: ${id}`);
                    reject(new Error(`RPC call '${method}' timed out after ${effectiveTimeout}ms. The AI provider may be slow or unavailable.`));
                }
            }, effectiveTimeout);

            // Store pending request
            this.pendingRequests.set(id, {
                resolve: resolve as (result: unknown) => void,
                reject,
                timer,
                method,
            });

            // Send request
            this.sendMessage(request);
        });
    }

    /**
     * Send a notification (no response expected)
     */
    notify<M extends keyof DaemonMethods>(
        method: M,
        params: DaemonMethods[M]['params']
    ): void {
        const notification = createNotification(method, params);
        this.sendMessage(notification);
    }

    /**
     * Register a handler for daemon notifications
     */
    onNotification<N extends keyof DaemonNotifications>(
        method: N,
        handler: (params: DaemonNotifications[N]) => void
    ): vscode.Disposable {
        let handlers = this.notificationHandlers.get(method);
        if (!handlers) {
            handlers = new Set();
            this.notificationHandlers.set(method, handlers);
        }

        handlers.add(handler as NotificationHandler<unknown>);

        return new vscode.Disposable(() => {
            handlers?.delete(handler as NotificationHandler<unknown>);
        });
    }

    /**
     * Handle incoming messages from the daemon
     */
    handleDaemonMessage(data: string): void {
        try {
            const message = typeof data === 'string' ? JSON.parse(data) : data;

            // Skip non-JSON-RPC messages (like {type: 'ready'} which is handled by DaemonManager)
            if (typeof message === 'object' && message !== null && 'type' in message && !('jsonrpc' in message)) {
                // This is a simple message type (e.g., 'ready', 'shutdown'), not JSON-RPC
                // These are handled by DaemonManager directly
                return;
            }

            if (isJsonRpcResponse(message)) {
                this.handleResponse(message);
            } else if (isJsonRpcNotification(message)) {
                this.handleNotification(message);
            } else if ('jsonrpc' in message) {
                this.outputChannel.appendLine(`Unknown JSON-RPC message: ${JSON.stringify(message)}`);
            }
            // Silently ignore other message types
        } catch (error) {
            this.outputChannel.appendLine(`Failed to parse daemon message: ${error}`);
        }
    }

    /**
     * Handle an RPC response
     */
    private handleResponse(response: JsonRpcResponse): void {
        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
            this.outputChannel.appendLine(`No pending request for id: ${response.id} (may have timed out)`);
            this.outputChannel.appendLine(`Current pending requests: ${Array.from(this.pendingRequests.keys()).join(', ') || 'none'}`);
            return;
        }

        // Clear timeout and remove from pending
        clearTimeout(pending.timer);
        this.pendingRequests.delete(response.id);

        if (response.error) {
            this.outputChannel.appendLine(`RPC error for ${pending.method}: ${response.error.message}`);
            const error = this.createError(response.error);
            pending.reject(error);
        } else {
            this.outputChannel.appendLine(`RPC <- ${pending.method} (success)`);
            pending.resolve(response.result);
        }
    }

    /**
     * Handle a notification from the daemon
     */
    private handleNotification(notification: JsonRpcNotification): void {
        const handlers = this.notificationHandlers.get(notification.method);
        if (!handlers || handlers.size === 0) {
            this.outputChannel.appendLine(`No handlers for notification: ${notification.method}`);
            return;
        }

        for (const handler of handlers) {
            try {
                handler(notification.params);
            } catch (error) {
                this.outputChannel.appendLine(
                    `Error in notification handler for '${notification.method}': ${error}`
                );
            }
        }
    }

    /**
     * Send a message to the daemon
     */
    private sendMessage(message: JsonRpcRequest | JsonRpcNotification): void {
        const data = JSON.stringify(message);
        this.outputChannel.appendLine(`RPC -> ${message.method}`);
        this.sendEmitter.fire(data);
    }

    /**
     * Get the next request ID
     */
    private getNextId(): string {
        return `${++this.requestId}-${uuidv4().slice(0, 8)}`;
    }

    /**
     * Create an Error from a JSON-RPC error
     */
    private createError(rpcError: JsonRpcError): Error {
        const error = new Error(rpcError.message);
        (error as any).code = rpcError.code;
        (error as any).data = rpcError.data;
        return error;
    }

    /**
     * Cancel all pending requests
     */
    cancelAll(): void {
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Request cancelled'));
        }
        this.pendingRequests.clear();
    }

    /**
     * Get the number of pending requests
     */
    get pendingCount(): number {
        return this.pendingRequests.size;
    }

    /**
     * Cleanup resources
     */
    dispose(): void {
        this.cancelAll();
        this.notificationHandlers.clear();
        this.sendEmitter.dispose();
    }
}
