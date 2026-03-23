/**
 * CodeMore VS Code Extension - Main Entry Point
 * 
 * This file handles extension activation, daemon lifecycle management,
 * and coordination between all components.
 */

import * as vscode from 'vscode';
import { minimatch } from 'minimatch';
import { DaemonManager } from './daemon/daemonManager';
import { RpcClient } from './rpc/rpcClient';
import { WebviewProvider } from './providers/webviewProvider';
import {
    DaemonConfig,
    DEFAULT_CONFIG,
    CodeIssue,
    CodeHealthMetrics
} from '../shared/protocol';

// Global state
let daemonManager: DaemonManager | undefined;
let rpcClient: RpcClient | undefined;
let webviewProvider: WebviewProvider | undefined;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let daemonNotificationDisposables: vscode.Disposable[] = [];

// Debounce timers (module-level for cleanup in deactivate)
let debounceTimer: NodeJS.Timeout | undefined;
let invalidateDebounceMap = new Map<string, NodeJS.Timeout>();

// Current state
let currentIssues: CodeIssue[] = [];
let currentMetrics: CodeHealthMetrics | undefined;
let isDaemonReady = false;

/**
 * Start the daemon and initialize it with workspace configuration
 */
async function startDaemonAndInitialize(context: vscode.ExtensionContext): Promise<void> {
    if (!daemonManager || !rpcClient) {
        throw new Error('DaemonManager or RpcClient not initialized');
    }

    await daemonManager.start();

    // Setup daemon notifications after daemon starts
    setupDaemonNotifications();

    // Initialize daemon with workspace configuration
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const config = getConfiguration();
        try {
            outputChannel.appendLine(`Initializing daemon with workspace: ${workspaceFolders[0].uri.fsPath}`);
            const result = await rpcClient.call('initialize', {
                workspacePath: workspaceFolders[0].uri.fsPath,
                config,
            }, 15000); // 15 second timeout for initialization

            if (result.success) {
                outputChannel.appendLine(`Daemon initialized successfully: v${result.version}`);
                isDaemonReady = true;
                updateStatusBar('ready');
                
                // Notify webview that we're ready
                webviewProvider?.notifyDaemonReady();
            } else {
                throw new Error('Initialization returned success=false');
            }
        } catch (error) {
            outputChannel.appendLine(`Daemon initialization failed: ${error}`);
            outputChannel.appendLine('Daemon is running but not initialized. Some features may not work.');
            updateStatusBar('error');
            vscode.window.showWarningMessage('CodeMore: Daemon failed to initialize. Try restarting the daemon.');
        }
    } else {
        outputChannel.appendLine('No workspace folder found, skipping daemon initialization');
        // No workspace, daemon is running but not initialized - limited functionality
        isDaemonReady = false;
        updateStatusBar('ready');
        vscode.window.showWarningMessage('CodeMore: Open a folder to enable code analysis features.');
    }
}

/**
 * Extension activation entry point
 * Called when the extension is activated (on startup or first command)
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    outputChannel = vscode.window.createOutputChannel('CodeMore');
    outputChannel.appendLine('CodeMore extension activating...');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = '$(loading~spin) CodeMore';
    statusBarItem.tooltip = 'CodeMore: Initializing...';
    statusBarItem.command = 'codemore.openDashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    try {
        // Initialize RPC client first (doesn't require daemon to be running)
        rpcClient = new RpcClient(outputChannel);
        context.subscriptions.push(rpcClient);

        // Register the webview provider BEFORE daemon starts
        // This ensures the sidebar view is available even if daemon fails
        webviewProvider = new WebviewProvider(context.extensionUri, rpcClient, outputChannel);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                'codemore.dashboard',
                webviewProvider,
                { webviewOptions: { retainContextWhenHidden: true } }
            )
        );

        // Register commands BEFORE daemon starts
        // This ensures commands are available even if daemon fails
        registerCommands(context);

        // Register event handlers
        registerEventHandlers(context);

        // Initialize the daemon manager
        daemonManager = new DaemonManager(context, outputChannel);
        context.subscriptions.push(daemonManager);

        // Connect daemon manager to RPC client
        daemonManager.onDaemonOutput((data) => {
            rpcClient?.handleDaemonMessage(data);
        });

        rpcClient.onSendMessage((message) => {
            daemonManager?.sendToDaemon(message);
        });

        // Start the daemon (don't await - let it start in background)
        startDaemonAndInitialize(context).catch((error) => {
            outputChannel.appendLine(`Daemon startup error: ${error}`);
            updateStatusBar('error');
        });

        outputChannel.appendLine('CodeMore extension activated successfully');

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        outputChannel.appendLine(`Activation error: ${message}`);
        updateStatusBar('error');
        vscode.window.showErrorMessage(`CodeMore failed to activate: ${message}`);
    }
}

/**
 * Extension deactivation - cleanup resources
 */
export async function deactivate(): Promise<void> {
    outputChannel?.appendLine('CodeMore extension deactivating...');

    // Clear debounce timers to prevent memory leaks
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
    }
    invalidateDebounceMap.forEach(timer => clearTimeout(timer));
    invalidateDebounceMap.clear();

    for (const disposable of daemonNotificationDisposables) {
        disposable.dispose();
    }
    daemonNotificationDisposables = [];

    try {
        // Gracefully shutdown daemon
        if (rpcClient) {
            await rpcClient.call('shutdown', {}).catch(() => { });
        }

        if (daemonManager) {
            await daemonManager.stop();
        }
    } catch (error) {
        outputChannel?.appendLine(`Deactivation error: ${error}`);
    }

    outputChannel?.appendLine('CodeMore extension deactivated');
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
    // Open Dashboard command
    context.subscriptions.push(
        vscode.commands.registerCommand('codemore.openDashboard', async () => {
            // Focus the webview panel
            await vscode.commands.executeCommand('codemore.dashboard.focus');
        })
    );

    // Analyze Workspace command
    context.subscriptions.push(
        vscode.commands.registerCommand('codemore.analyzeWorkspace', async () => {
            if (!rpcClient || !isDaemonReady) {
                vscode.window.showErrorMessage('CodeMore daemon is not running. Please wait for initialization or use "CodeMore: Restart Context Daemon".');
                return;
            }

            updateStatusBar('analyzing');

            try {
                const result = await rpcClient.call('analyzeWorkspace', { force: true });
                outputChannel.appendLine(`Analysis started: ${result.totalFiles} files`);
                vscode.window.showInformationMessage(
                    `Analyzing ${result.totalFiles} files...`
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Analysis failed: ${message}`);
                updateStatusBar('error');
            }
        })
    );

    // Analyze Current File command
    context.subscriptions.push(
        vscode.commands.registerCommand('codemore.analyzeCurrentFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active file to analyze');
                return;
            }

            if (!rpcClient || !isDaemonReady) {
                vscode.window.showErrorMessage('CodeMore daemon is not running. Please wait for initialization or use "CodeMore: Restart Context Daemon".');
                return;
            }

            const filePath = editor.document.uri.fsPath;
            const content = editor.document.getText();

            updateStatusBar('analyzing');

            try {
                const result = await rpcClient.call('analyzeFile', { filePath, content });
                outputChannel.appendLine(`Analyzed ${filePath}: ${result.issues.length} issues`);

                // Update local state
                currentIssues = result.issues;
                webviewProvider?.postMessage({
                    type: 'issuesUpdate',
                    issues: currentIssues,
                });

                updateStatusBar('ready', result.issues.length);

                if (result.issues.length > 0) {
                    vscode.window.showInformationMessage(
                        `Found ${result.issues.length} issue(s) in this file`
                    );
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Analysis failed: ${message}`);
                updateStatusBar('error');
            }
        })
    );

    // Apply Suggestion command
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'codemore.applySuggestion',
            async (suggestion: { location?: { filePath: string; range: any }; filePath?: string; range?: any; suggestedCode: string }) => {
                try {
                    // Support both old format (filePath, range) and new format (location.filePath, location.range)
                    const filePath = suggestion.location?.filePath ?? suggestion.filePath;
                    const range = suggestion.location?.range ?? suggestion.range;

                    if (!filePath || !range) {
                        throw new Error('Invalid suggestion format: missing file path or range');
                    }

                    if (!suggestion.suggestedCode) {
                        throw new Error('Invalid suggestion format: missing suggested code');
                    }

                    const uri = vscode.Uri.file(filePath);
                    const document = await vscode.workspace.openTextDocument(uri);
                    const editor = await vscode.window.showTextDocument(document);

                    const vscodeRange = new vscode.Range(
                        range.start.line,
                        range.start.column,
                        range.end.line,
                        range.end.column
                    );

                    await editor.edit((editBuilder) => {
                        editBuilder.replace(vscodeRange, suggestion.suggestedCode);
                    });

                    vscode.window.showInformationMessage('Suggestion applied successfully');
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    vscode.window.showErrorMessage(`Failed to apply suggestion: ${message}`);
                }
            }
        )
    );

    // Restart Daemon command
    context.subscriptions.push(
        vscode.commands.registerCommand('codemore.restartDaemon', async () => {
            isDaemonReady = false;
            updateStatusBar('restarting');

            try {
                await daemonManager?.restart();

                // Wait a bit for daemon to be fully ready for messages
                await new Promise(resolve => setTimeout(resolve, 500));

                // Setup daemon notifications again
                setupDaemonNotifications();

                // Re-initialize
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && rpcClient) {
                    const config = getConfiguration();
                    outputChannel.appendLine(`Re-initializing daemon with workspace: ${workspaceFolders[0].uri.fsPath}`);
                    const result = await rpcClient.call('initialize', {
                        workspacePath: workspaceFolders[0].uri.fsPath,
                        config,
                    }, 15000);

                    if (result.success) {
                        isDaemonReady = true;
                        webviewProvider?.notifyDaemonReady();
                        outputChannel.appendLine('Daemon re-initialized successfully');
                    }
                } else {
                    // No workspace folder - daemon can't be initialized
                    isDaemonReady = false;
                    vscode.window.showWarningMessage('CodeMore: Open a folder to enable code analysis features.');
                }

                updateStatusBar('ready');
                vscode.window.showInformationMessage('CodeMore daemon restarted');
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to restart daemon: ${message}`);
                updateStatusBar('error');
            }
        })
    );

    // Show Logs command
    context.subscriptions.push(
        vscode.commands.registerCommand('codemore.showLogs', () => {
            outputChannel.show();
        })
    );
}

/**
 * Register event handlers for file changes and workspace updates
 */
function registerEventHandlers(context: vscode.ExtensionContext): void {
    // File save handler - trigger analysis
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            const config = getConfiguration();
            if (!config.autoAnalyze || !rpcClient || !isDaemonReady) {
                return;
            }

            // Check if file should be excluded
            if (shouldExcludeFile(document.uri.fsPath, config.excludePatterns)) {
                return;
            }

            // Debounce analysis
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            debounceTimer = setTimeout(async () => {
                if (!isDaemonReady || !rpcClient) return;
                try {
                    await rpcClient.call('analyzeFile', {
                        filePath: document.uri.fsPath,
                        content: document.getText(),
                    });
                } catch (error) {
                    outputChannel.appendLine(`Auto-analysis error: ${error}`);
                }
            }, config.analysisDelay);
        })
    );

    // File change handler - invalidate cache with debouncing
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (!rpcClient || !isDaemonReady) {
                return;
            }

            const filePath = event.document.uri.fsPath;

            // Skip non-file URIs (like output channels, extension-output, etc.)
            if (event.document.uri.scheme !== 'file') {
                return;
            }

            // Debounce invalidation per file to reduce log spam
            const existingTimer = invalidateDebounceMap.get(filePath);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            const timer = setTimeout(() => {
                invalidateDebounceMap.delete(filePath);
                if (rpcClient) {
                    rpcClient.notify('invalidateFile', { filePath });
                }
            }, 500);

            invalidateDebounceMap.set(filePath, timer);
        })
    );

    // Configuration change handler
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('codemore')) {
                const newConfig = getConfiguration();
                rpcClient?.call('setConfig', { config: newConfig }).catch((error) => {
                    outputChannel.appendLine(`Config update error: ${error}`);
                });
            }
        })
    );

    // Workspace folder change handler
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
            if (!isDaemonReady || !rpcClient) {
                return;
            }
            
            outputChannel.appendLine('Workspace folders changed, reinitializing...');

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const config = getConfiguration();
                try {
                    await rpcClient.call('initialize', {
                        workspacePath: workspaceFolders[0].uri.fsPath,
                        config,
                    });
                } catch (error) {
                    outputChannel.appendLine(`Workspace reinitialization error: ${error}`);
                }
            }
        })
    );
}

/**
 * Setup handlers for daemon notifications
 */
function setupDaemonNotifications(): void {
    if (!rpcClient) {
        return;
    }

    for (const disposable of daemonNotificationDisposables) {
        disposable.dispose();
    }
    daemonNotificationDisposables = [];

    daemonNotificationDisposables.push(rpcClient.onNotification('daemon/ready', (params: { version: string }) => {
        outputChannel.appendLine(`Daemon ready: v${params.version}`);
        updateStatusBar('ready');
    }));

    daemonNotificationDisposables.push(rpcClient.onNotification('daemon/fileDiscovery', (params: { totalFiles: number; fileTypes: Record<string, number> }) => {
        webviewProvider?.postMessage({
            type: 'fileDiscovery',
            totalFiles: params.totalFiles,
            fileTypes: params.fileTypes,
        });
    }));

    daemonNotificationDisposables.push(rpcClient.onNotification('daemon/analysisProgress', (params: { filePath: string; progress: number; total: number }) => {
        webviewProvider?.postMessage({
            type: 'analysisProgress',
            progress: params.progress,
            total: params.total,
            currentFile: params.filePath,
        });
        statusBarItem.text = `$(sync~spin) CodeMore (${params.progress}/${params.total})`;
    }));

    daemonNotificationDisposables.push(rpcClient.onNotification('daemon/analysisComplete', (params: { filePath: string; issues: CodeIssue[] }) => {
        outputChannel.appendLine(`Analysis complete: ${params.filePath}`);
        webviewProvider?.postMessage({ type: 'analysisComplete' });
        updateStatusBar('ready', currentIssues.length);
    }));

    daemonNotificationDisposables.push(rpcClient.onNotification('daemon/analysisStopped', () => {
        outputChannel.appendLine('Analysis stopped');
        webviewProvider?.postMessage({ type: 'analysisStopped' });
        updateStatusBar('ready', currentIssues.length);
    }));

    daemonNotificationDisposables.push(rpcClient.onNotification('daemon/issuesUpdated', (params: { issues: CodeIssue[] }) => {
        currentIssues = params.issues;
        webviewProvider?.postMessage({
            type: 'issuesUpdate',
            issues: currentIssues,
        });
        updateStatusBar('ready', currentIssues.length);
    }));

    daemonNotificationDisposables.push(rpcClient.onNotification('daemon/metricsUpdated', (params: { metrics: CodeHealthMetrics }) => {
        currentMetrics = params.metrics;
        webviewProvider?.postMessage({
            type: 'metricsUpdate',
            metrics: currentMetrics,
        });
    }));

    daemonNotificationDisposables.push(rpcClient.onNotification('daemon/error', (params: { message: string; details?: unknown }) => {
        outputChannel.appendLine(`Daemon error: ${params.message}`);
        if (params.details) {
            outputChannel.appendLine(`Details: ${JSON.stringify(params.details)}`);
        }
    }));
}

/**
 * Get extension configuration
 */
function getConfiguration(): DaemonConfig {
    const config = vscode.workspace.getConfiguration('codemore');

    return {
        aiProvider: config.get('aiProvider', DEFAULT_CONFIG.aiProvider),
        apiKey: config.get('apiKey', DEFAULT_CONFIG.apiKey),
        autoAnalyze: config.get('autoAnalyze', DEFAULT_CONFIG.autoAnalyze),
        analysisDelay: config.get('analysisDelay', DEFAULT_CONFIG.analysisDelay),
        excludePatterns: config.get('excludePatterns', DEFAULT_CONFIG.excludePatterns),
        maxFileSizeKB: config.get('maxFileSizeKB', DEFAULT_CONFIG.maxFileSizeKB),
        enableTelemetry: config.get('enableTelemetry', DEFAULT_CONFIG.enableTelemetry),
        maxConcurrentAnalysis: DEFAULT_CONFIG.maxConcurrentAnalysis,
        cacheEnabled: DEFAULT_CONFIG.cacheEnabled,
        cacheTTLMinutes: DEFAULT_CONFIG.cacheTTLMinutes,
        analysisTools: config.get('analysisTools', DEFAULT_CONFIG.analysisTools),
    };
}

/**
 * Check if a file should be excluded from analysis
 */
function shouldExcludeFile(filePath: string, patterns: string[]): boolean {
    return patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }));
}

/**
 * Update the status bar item
 */
function updateStatusBar(
    status: 'ready' | 'analyzing' | 'error' | 'restarting',
    issueCount?: number
): void {
    switch (status) {
        case 'ready':
            if (issueCount !== undefined && issueCount > 0) {
                statusBarItem.text = `$(check) CodeMore (${issueCount})`;
                statusBarItem.tooltip = `CodeMore: ${issueCount} issue(s) found`;
                statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.warningBackground'
                );
            } else {
                statusBarItem.text = '$(check) CodeMore';
                statusBarItem.tooltip = 'CodeMore: Ready';
                statusBarItem.backgroundColor = undefined;
            }
            break;
        case 'analyzing':
            statusBarItem.text = '$(sync~spin) CodeMore';
            statusBarItem.tooltip = 'CodeMore: Analyzing...';
            statusBarItem.backgroundColor = undefined;
            break;
        case 'error':
            statusBarItem.text = '$(error) CodeMore';
            statusBarItem.tooltip = 'CodeMore: Error - Click to view logs';
            statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.errorBackground'
            );
            break;
        case 'restarting':
            statusBarItem.text = '$(loading~spin) CodeMore';
            statusBarItem.tooltip = 'CodeMore: Restarting daemon...';
            statusBarItem.backgroundColor = undefined;
            break;
    }
}
