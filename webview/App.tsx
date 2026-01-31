/**
 * CodeMore Dashboard App
 * Main application component
 */

import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import IssueList from './components/IssueList';
import DiffPreview from './components/DiffPreview';
import {
    CodeIssue,
    CodeSuggestion,
    CodeHealthMetrics,
    WebviewToExtensionMessage,
    ExtensionToWebviewMessage,
} from './types';
import {
    Zap,
    RefreshCw,
    Search,
    Settings,
    LayoutDashboard,
    Bug,
    Lightbulb,
    AlertTriangle,
    StopCircle,
    X,
    Folder,
} from 'lucide-react';

// VS Code API interface
interface VSCodeAPI {
    postMessage: (message: WebviewToExtensionMessage) => void;
    getState: () => unknown;
    setState: (state: unknown) => void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

// Get VS Code API
const vscode = acquireVsCodeApi();

type TabId = 'dashboard' | 'issues' | 'suggestions';

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabId>('dashboard');
    const [metrics, setMetrics] = useState<CodeHealthMetrics | null>(null);
    const [issues, setIssues] = useState<CodeIssue[]>([]);
    const [suggestions, setSuggestions] = useState<CodeSuggestion[]>([]);
    const [selectedIssue, setSelectedIssue] = useState<CodeIssue | null>(null);
    const [selectedSuggestion, setSelectedSuggestion] = useState<CodeSuggestion | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingAiFix, setIsGeneratingAiFix] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState<{ progress: number; total: number; currentFile?: string } | null>(null);
    const [fileDiscovery, setFileDiscovery] = useState<{ totalFiles: number; fileTypes: Record<string, number> } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDark, setIsDark] = useState(true);

    // Handle messages from extension
    const handleMessage = useCallback((event: MessageEvent<ExtensionToWebviewMessage>) => {
        const message = event.data;

        switch (message.type) {
            case 'metricsUpdate':
                setMetrics(message.metrics);
                setIsLoading(false);
                break;
            case 'issuesUpdate':
                setIssues(message.issues);
                break;
            case 'suggestionsUpdate':
                setSuggestions(message.suggestions);
                setIsGeneratingAiFix(false);
                break;
            case 'fileDiscovery':
                setFileDiscovery({
                    totalFiles: message.totalFiles,
                    fileTypes: message.fileTypes,
                });
                break;
            case 'analysisProgress':
                setAnalysisProgress({
                    progress: message.progress,
                    total: message.total,
                    currentFile: message.currentFile,
                });
                break;
            case 'analysisComplete':
                // Clear progress immediately
                setAnalysisProgress(null);
                setIsLoading(false);
                // Refresh dashboard to show updated metrics
                vscode.postMessage({ type: 'refreshDashboard' });
                break;
            case 'analysisStopped':
                setAnalysisProgress(null);
                setIsLoading(false);
                break;
            case 'error':
                setError(message.message);
                setIsGeneratingAiFix(false);
                setTimeout(() => setError(null), 5000);
                break;
            case 'suggestionApplied':
                if (message.success) {
                    // Remove applied suggestion
                    setSuggestions((prev) => prev.filter((s) => s.id !== message.suggestionId));
                }
                break;
            case 'themeChanged':
                setIsDark(message.isDark);
                break;
        }
    }, []);

    // Setup message listener
    useEffect(() => {
        window.addEventListener('message', handleMessage);

        // Signal ready and request initial data
        vscode.postMessage({ type: 'ready' });

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleMessage]);

    // Handle issue selection
    const handleSelectIssue = (issue: CodeIssue) => {
        setSelectedIssue(issue);
        // Clear any previous suggestions and show empty state with Generate Fix button
        setSuggestions([]);
        setActiveTab('suggestions');
    };

    // Handle generate AI fix
    const handleGenerateAiFix = (issueId: string) => {
        setIsGeneratingAiFix(true);
        vscode.postMessage({ type: 'generateAiFix', issueId, includeRelatedFiles: true });
    };

    // Handle suggestion apply
    const handleApplySuggestion = (suggestion: CodeSuggestion) => {
        vscode.postMessage({ type: 'applySuggestion', suggestionId: suggestion.id });
    };

    // Handle file open
    const handleOpenFile = (filePath: string, line?: number) => {
        vscode.postMessage({ type: 'openFile', filePath, line });
    };

    // Handle analyze workspace
    const handleAnalyzeWorkspace = () => {
        vscode.postMessage({ type: 'analyzeWorkspace' });
    };

    // Handle stop analysis
    const handleStopAnalysis = () => {
        vscode.postMessage({ type: 'stopAnalysis' });
    };

    // Handle refresh
    const handleRefresh = () => {
        setIsLoading(true);
        vscode.postMessage({ type: 'refreshDashboard' });
    };

    // Handle open settings
    const handleOpenSettings = () => {
        vscode.postMessage({ type: 'openSettings' });
    };

    // Handle export issues
    const handleExportIssues = (issues: CodeIssue[]) => {
        vscode.postMessage({ type: 'exportIssues', issues });
    };

    return (
        <div className={`app ${isDark ? 'dark' : 'light'}`}>
            {/* Header */}
            <header className="app-header">
                <h1 className="app-title">
                    <span className="app-icon"><Zap size={20} /></span>
                    CodeMore
                </h1>
                <div className="header-actions">
                    <button
                        className="icon-button"
                        onClick={handleRefresh}
                        title="Refresh"
                    >
                        <RefreshCw size={16} />
                    </button>
                    <button
                        className="icon-button"
                        onClick={handleAnalyzeWorkspace}
                        title="Analyze Workspace"
                    >
                        <Search size={16} />
                    </button>
                    <button
                        className="icon-button"
                        onClick={handleOpenSettings}
                        title="Settings"
                    >
                        <Settings size={16} />
                    </button>
                </div>
            </header>

            {/* Error banner */}
            {error && (
                <div className="error-banner">
                    <span><AlertTriangle size={14} /> {error}</span>
                    <button onClick={() => setError(null)}><X size={14} /></button>
                </div>
            )}

            {/* File Discovery Info */}
            {fileDiscovery && !analysisProgress && (
                <div className="file-discovery-banner">
                    <div className="discovery-header">
                        <span className="discovery-icon"><Search size={16} /></span>
                        <span className="discovery-title">Discovered {fileDiscovery.totalFiles.toLocaleString()} files</span>
                    </div>
                    <div className="file-type-chips">
                        {Object.entries(fileDiscovery.fileTypes)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 8)
                            .map(([type, count]) => (
                                <span key={type} className="file-type-chip">
                                    {type}: {count}
                                </span>
                            ))}
                        {Object.keys(fileDiscovery.fileTypes).length > 8 && (
                            <span className="file-type-chip more">
                                +{Object.keys(fileDiscovery.fileTypes).length - 8} more
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Progress bar */}
            {analysisProgress && (
                <div className="progress-bar-container">
                    <div className="progress-info">
                        <span className="progress-file">
                            <span className="progress-icon"><Zap size={14} /></span>
                            Analyzing: {analysisProgress.currentFile?.split(/[/\\]/).pop() || '...'}
                        </span>
                        <span className="progress-count">
                            {analysisProgress.progress} / {analysisProgress.total} files
                            <span className="progress-percent">
                                ({Math.round((analysisProgress.progress / analysisProgress.total) * 100)}%)
                            </span>
                        </span>
                    </div>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{
                                width: `${(analysisProgress.progress / analysisProgress.total) * 100}%`,
                            }}
                        />
                    </div>
                    <div className="progress-footer">
                        <span className="progress-eta">
                            {analysisProgress.total - analysisProgress.progress} files remaining
                        </span>
                        <button
                            className="stop-analysis-button"
                            onClick={handleStopAnalysis}
                            title="Stop Analysis"
                        >
                            <StopCircle size={14} /> Stop
                        </button>
                    </div>
                </div>
            )}

            {/* Tab navigation */}
            <nav className="tab-nav">
                <button
                    className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dashboard')}
                >
                    <LayoutDashboard size={14} /> Dashboard
                </button>
                <button
                    className={`tab-button ${activeTab === 'issues' ? 'active' : ''}`}
                    onClick={() => setActiveTab('issues')}
                >
                    <Bug size={14} /> Issues
                    {issues.length > 0 && (
                        <span className="badge">{issues.length}</span>
                    )}
                </button>
                <button
                    className={`tab-button ${activeTab === 'suggestions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('suggestions')}
                >
                    <Lightbulb size={14} /> Suggestions
                </button>
            </nav>

            {/* Main content */}
            <main className="app-content">
                {isLoading ? (
                    <div className="loading-state">
                        <div className="spinner" />
                        <p>Loading...</p>
                    </div>
                ) : (
                    <>
                        {activeTab === 'dashboard' && (
                            <Dashboard
                                metrics={metrics}
                                issues={issues}
                                fileDiscovery={fileDiscovery}
                                onSelectIssue={handleSelectIssue}
                            />
                        )}

                        {activeTab === 'issues' && (
                            <IssueList
                                issues={issues}
                                selectedIssue={selectedIssue}
                                onSelectIssue={handleSelectIssue}
                                onOpenFile={handleOpenFile}
                                onExportIssues={handleExportIssues}
                            />
                        )}

                        {activeTab === 'suggestions' && (
                            <DiffPreview
                                issue={selectedIssue}
                                suggestions={suggestions}
                                onApply={handleApplySuggestion}
                                onOpenFile={handleOpenFile}
                                onSelectSuggestion={setSelectedSuggestion}
                                onGenerateAiFix={handleGenerateAiFix}
                                isGeneratingAiFix={isGeneratingAiFix}
                            />
                        )}
                    </>
                )}
            </main>
        </div>
    );
};

export default App;
