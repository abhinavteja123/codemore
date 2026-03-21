/**
 * CodeMore Webview Provider
 * 
 * Provides the Code Quality Dashboard webview for the sidebar.
 * Handles communication between the webview and extension.
 */

import * as vscode from 'vscode';
import { RpcClient } from '../rpc/rpcClient';
import {
    WebviewToExtensionMessage,
    ExtensionToWebviewMessage,
    CodeIssue,
    CodeSuggestion,
    CodeHealthMetrics,
} from '../../shared/protocol';

export class WebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codemore.dashboard';

    private view?: vscode.WebviewView;
    private isReady = false;
    private isDaemonReady = false;
    private pendingMessages: ExtensionToWebviewMessage[] = [];
    private themeChangeSubscription?: vscode.Disposable;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly rpcClient: RpcClient,
        private readonly outputChannel: vscode.OutputChannel
    ) { }

    /**
     * Notify webview that daemon is ready
     */
    notifyDaemonReady(): void {
        this.isDaemonReady = true;
        // If webview is already ready, refresh the dashboard
        if (this.isReady && this.view?.visible) {
            this.refreshDashboard();
        }
    }

    /**
     * Called when the webview view is resolved (created)
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;
        this.isReady = false;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            (message: WebviewToExtensionMessage) => this.handleMessage(message)
        );

        // Handle visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.isReady) {
                // Refresh data when becoming visible
                this.refreshDashboard();
            }
        });

        // Listen for theme changes
        // Dispose previous subscription if exists (in case resolveWebviewView is called again)
        this.themeChangeSubscription?.dispose();
        this.themeChangeSubscription = vscode.window.onDidChangeActiveColorTheme((theme) => {
            this.postMessage({
                type: 'themeChanged',
                isDark: theme.kind === vscode.ColorThemeKind.Dark ||
                    theme.kind === (vscode.ColorThemeKind as any).HighContrastDark ||
                    theme.kind === vscode.ColorThemeKind.HighContrast,
            });
        });
    }

    /**
     * Post a message to the webview
     */
    postMessage(message: ExtensionToWebviewMessage): void {
        if (!this.view) {
            return;
        }

        if (!this.isReady) {
            this.pendingMessages.push(message);
            return;
        }

        this.view.webview.postMessage(message).then(
            () => { },
            (error) => {
                this.outputChannel.appendLine(`Failed to post message to webview: ${error}`);
            }
        );
    }

    /**
     * Handle messages from the webview
     */
    private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        this.outputChannel.appendLine(`Webview message: ${message.type}`);

        switch (message.type) {
            case 'ready':
                this.isReady = true;
                // Send pending messages
                for (const pending of this.pendingMessages) {
                    this.postMessage(pending);
                }
                this.pendingMessages = [];
                // Initial data load - only if daemon is ready
                if (this.isDaemonReady) {
                    this.refreshDashboard();
                } else {
                    // Send empty state while daemon is starting
                    this.postMessage({
                        type: 'metricsUpdate',
                        metrics: this.getEmptyMetrics()
                    });
                    this.postMessage({ type: 'issuesUpdate', issues: [] });
                }
                break;

            case 'requestMetrics':
                if (!this.isDaemonReady) {
                    this.postMessage({ type: 'metricsUpdate', metrics: this.getEmptyMetrics() });
                    return;
                }
                try {
                    const result = await this.rpcClient.call('getMetrics', {});
                    this.postMessage({ type: 'metricsUpdate', metrics: result.metrics });
                } catch (error) {
                    this.postMessage({ type: 'metricsUpdate', metrics: this.getEmptyMetrics() });
                    this.postMessage({ type: 'error', message: `Failed to get metrics: ${error}` });
                }
                break;

            case 'requestIssues':
                if (!this.isDaemonReady) {
                    this.postMessage({ type: 'issuesUpdate', issues: [] });
                    return;
                }
                try {
                    // Use getAllIssues for efficient issue retrieval
                    const result = await this.rpcClient.call('getAllIssues', {});
                    this.postMessage({ type: 'issuesUpdate', issues: result.issues });
                } catch (error) {
                    this.postMessage({ type: 'issuesUpdate', issues: [] });
                    this.postMessage({ type: 'error', message: `Failed to get issues: ${error}` });
                }
                break;

            case 'requestSuggestions':
                if (!this.isDaemonReady) {
                    this.postMessage({ type: 'suggestionsUpdate', suggestions: [] });
                    return;
                }
                try {
                    const result = await this.rpcClient.call('getSuggestions', {
                        issueId: message.issueId,
                    });
                    this.postMessage({ type: 'suggestionsUpdate', suggestions: result.suggestions });
                } catch (error) {
                    this.postMessage({ type: 'suggestionsUpdate', suggestions: [] });
                    this.postMessage({ type: 'error', message: `Failed to get suggestions: ${error}` });
                }
                break;

            case 'generateAiFix':
                if (!this.isDaemonReady) {
                    this.postMessage({ type: 'error', message: 'Daemon is not ready' });
                    return;
                }
                try {
                    // Use longer timeout for AI fix generation (90 seconds)
                    // AI API calls can take 30-60 seconds depending on provider and context size
                    const result = await this.rpcClient.call('generateAiFix', {
                        issueId: message.issueId,
                        includeRelatedFiles: message.includeRelatedFiles ?? true,
                    }, 90000);
                    this.postMessage({ type: 'suggestionsUpdate', suggestions: result.suggestions });
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.outputChannel.appendLine(`Generate AI fix error: ${errorMessage}`);
                    this.postMessage({ type: 'error', message: `Failed to generate AI fix: ${errorMessage}` });
                }
                break;

            case 'applySuggestion':
                if (!this.isDaemonReady) {
                    this.postMessage({ type: 'error', message: 'Daemon is not ready' });
                    return;
                }
                try {
                    // Get the suggestion by its ID
                    const suggestionResult = await this.rpcClient.call('getSuggestionById', {
                        suggestionId: message.suggestionId,
                    });
                    const suggestion = suggestionResult.suggestion;
                    if (suggestion) {
                        await vscode.commands.executeCommand('codemore.applySuggestion', suggestion);
                        this.postMessage({ type: 'suggestionApplied', suggestionId: message.suggestionId, success: true });
                    } else {
                        this.postMessage({ type: 'error', message: 'Suggestion not found. Please request suggestions again.' });
                        this.postMessage({ type: 'suggestionApplied', suggestionId: message.suggestionId, success: false });
                    }
                } catch (error) {
                    this.postMessage({ type: 'suggestionApplied', suggestionId: message.suggestionId, success: false });
                    this.postMessage({ type: 'error', message: `Failed to apply suggestion: ${error}` });
                }
                break;

            case 'dismissIssue':
                // Handle issue dismissal (could store in workspace state)
                this.outputChannel.appendLine(`Issue dismissed: ${message.issueId}`);
                break;

            case 'openFile':
                try {
                    const uri = vscode.Uri.file(message.filePath);
                    const document = await vscode.workspace.openTextDocument(uri);
                    const editor = await vscode.window.showTextDocument(document);
                    if (message.line) {
                        const position = new vscode.Position(message.line - 1, 0);
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(
                            new vscode.Range(position, position),
                            vscode.TextEditorRevealType.InCenter
                        );
                    }
                } catch (error) {
                    this.postMessage({ type: 'error', message: `Failed to open file: ${error}` });
                }
                break;

            case 'analyzeWorkspace':
                await vscode.commands.executeCommand('codemore.analyzeWorkspace');
                break;

            case 'stopAnalysis':
                if (!this.isDaemonReady) {
                    this.postMessage({ type: 'error', message: 'Daemon is not ready' });
                    return;
                }
                try {
                    await this.rpcClient.call('stopAnalysis', {});
                    this.postMessage({ type: 'analysisStopped' });
                } catch (error) {
                    this.postMessage({ type: 'error', message: `Failed to stop analysis: ${error}` });
                }
                break;

            case 'refreshDashboard':
                this.refreshDashboard();
                break;
            
            case 'openSettings':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'codemore');
                break;

            case 'exportIssues':
                try {
                    const exportData = {
                        exportDate: new Date().toISOString(),
                        totalIssues: message.issues.length,
                        issues: message.issues.map(issue => ({
                            id: issue.id,
                            title: issue.title,
                            description: issue.description,
                            category: issue.category,
                            severity: issue.severity,
                            location: {
                                filePath: issue.location.filePath,
                                startLine: issue.location.range.start.line,
                                startColumn: issue.location.range.start.column,
                                endLine: issue.location.range.end.line,
                                endColumn: issue.location.range.end.column,
                            },
                            codeSnippet: issue.codeSnippet,
                            confidence: issue.confidence,
                            impact: issue.impact,
                            createdAt: new Date(issue.createdAt).toISOString(),
                        }))
                    };

                    const dataStr = JSON.stringify(exportData, null, 2);
                    const defaultFileName = `codemore-issues-${new Date().toISOString().split('T')[0]}.json`;
                    
                    const uri = await vscode.window.showSaveDialog({
                        defaultUri: vscode.Uri.file(defaultFileName),
                        filters: {
                            'JSON': ['json'],
                            'All Files': ['*']
                        }
                    });

                    if (uri) {
                        await vscode.workspace.fs.writeFile(uri, Buffer.from(dataStr, 'utf8'));
                        vscode.window.showInformationMessage(`Exported ${message.issues.length} issues to ${uri.fsPath}`);
                    }
                } catch (error) {
                    this.postMessage({ type: 'error', message: `Failed to export issues: ${error}` });
                }
                break;
        }
    }

    /**
     * Get empty metrics for initial state
     */
    private getEmptyMetrics(): CodeHealthMetrics {
        return {
            overallScore: 0,
            issuesByCategory: {
                'bug': 0,
                'code-smell': 0,
                'performance': 0,
                'security': 0,
                'maintainability': 0,
                'accessibility': 0,
                'best-practice': 0,
            },
            issuesBySeverity: {
                'BLOCKER': 0,
                'CRITICAL': 0,
                'MAJOR': 0,
                'MINOR': 0,
                'INFO': 0,
            },
            filesAnalyzed: 0,
            totalFiles: 0,
            linesOfCode: 0,
            averageComplexity: 0,
            technicalDebtMinutes: 0,
        };
    }

    /**
     * Refresh all dashboard data
     */
    private async refreshDashboard(): Promise<void> {
        if (!this.isDaemonReady) {
            this.postMessage({ type: 'metricsUpdate', metrics: this.getEmptyMetrics() });
            this.postMessage({ type: 'issuesUpdate', issues: [] });
            return;
        }
        
        try {
            // Get metrics and issues in parallel for efficiency
            const [metricsResult, issuesResult] = await Promise.all([
                this.rpcClient.call('getMetrics', {}),
                this.rpcClient.call('getAllIssues', {})
            ]);
            
            this.postMessage({ type: 'metricsUpdate', metrics: metricsResult.metrics });
            this.postMessage({ type: 'issuesUpdate', issues: issuesResult.issues });
        } catch (error) {
            this.outputChannel.appendLine(`Failed to refresh dashboard: ${error}`);
            // Send empty data on error to stop loading
            this.postMessage({ type: 'metricsUpdate', metrics: this.getEmptyMetrics() });
            this.postMessage({ type: 'issuesUpdate', issues: [] });
        }
    }

    /**
     * Generate the HTML content for the webview
     */
    private getHtmlContent(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')
        );

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <title>CodeMore Dashboard</title>
  <link href="${webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'))}" rel="stylesheet" />
  <style>
    :root {
      --container-padding: 16px;
      --border-radius: 6px;
    }
    
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      margin: 0;
      padding: 0;
    }
    
    #root {
      min-height: 100vh;
    }
    
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      color: var(--vscode-descriptionForeground);
    }
    
    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--vscode-progressBar-background);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 8px;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="loading">
      <div class="loading-spinner"></div>
      <span>Loading CodeMore...</span>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Generate a random nonce for CSP
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.themeChangeSubscription?.dispose();
    }
}
