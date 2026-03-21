/**
 * DiffPreview Component
 */

import React, { useState } from 'react';
import { CodeIssue, CodeSuggestion, Severity } from '../types';
import { Lightbulb, Eye, Check, Sparkles, AlertTriangle, Bug, Gauge, Shield, Wrench, Accessibility, Star, FileText, Target, Zap } from 'lucide-react';

interface DiffPreviewProps {
    issue: CodeIssue | null;
    suggestions: CodeSuggestion[];
    onApply: (suggestion: CodeSuggestion) => void;
    onOpenFile: (filePath: string, line?: number) => void;
    onSelectSuggestion: (suggestion: CodeSuggestion | null) => void;
    onGenerateAiFix: (issueId: string) => void;
    isGeneratingAiFix: boolean;
}

const DiffPreview: React.FC<DiffPreviewProps> = ({
    issue,
    suggestions,
    onApply,
    onOpenFile,
    onGenerateAiFix,
    isGeneratingAiFix,
}) => {
    const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
    const [isApplying, setIsApplying] = useState(false);

    const selectedSuggestion = suggestions[0] || null;

    const getSeverityColor = (severity: Severity): string => {
        switch (severity) {
            case 'BLOCKER': return '#d32f2f';
            case 'CRITICAL': return '#f44336';
            case 'MAJOR': return '#ff9800';
            case 'MINOR': return '#2196f3';
            case 'INFO': return '#9e9e9e';
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'bug': return <Bug size={16} />;
            case 'code-smell': return <AlertTriangle size={16} />;
            case 'performance': return <Gauge size={16} />;
            case 'security': return <Shield size={16} />;
            case 'maintainability': return <Wrench size={16} />;
            case 'accessibility': return <Accessibility size={16} />;
            case 'best-practice': return <Star size={16} />;
            default: return <Bug size={16} />;
        }
    };

    // No issue selected state
    if (!issue) {
        return (
            <div className="diff-preview empty-state">
                <div className="empty-icon"><Lightbulb size={48} /></div>
                <h3>No Issue Selected</h3>
                <p>Select an issue from the Issues tab to view details and generate fixes.</p>
            </div>
        );
    }

    // Issue selected but no suggestions yet
    if (!selectedSuggestion) {
        return (
            <div className="diff-preview">
                <div className="issue-detail-view">
                    {/* Issue Header */}
                    <div className="issue-detail-header">
                        <div className="issue-badges">
                            <span
                                className="severity-badge"
                                style={{ backgroundColor: getSeverityColor(issue.severity) }}
                            >
                                {issue.severity}
                            </span>
                            <span className="category-badge">
                                {getCategoryIcon(issue.category)}
                                <span>{issue.category.replace('-', ' ')}</span>
                            </span>
                        </div>
                        <h2 className="issue-detail-title">{issue.title}</h2>
                    </div>

                    {/* Issue Description */}
                    <div className="issue-detail-section">
                        <h3>Description</h3>
                        <p className="issue-detail-description">{issue.description}</p>
                    </div>

                    {/* Issue Location */}
                    <div className="issue-detail-section">
                        <h3>Location</h3>
                        <button
                            className="file-link-large"
                            onClick={() => onOpenFile(issue.location.filePath, issue.location.range.start.line + 1)}
                        >
                            <FileText size={16} />
                            <span className="file-path">{issue.location.filePath}</span>
                            <span className="file-line">Line {issue.location.range.start.line + 1}</span>
                        </button>
                    </div>

                    {/* Code Snippet */}
                    {issue.codeSnippet && (
                        <div className="issue-detail-section">
                            <h3>Code Snippet</h3>
                            <pre className="issue-code-snippet"><code>{issue.codeSnippet}</code></pre>
                        </div>
                    )}

                    {/* Issue Metrics */}
                    <div className="issue-detail-section">
                        <h3>Analysis</h3>
                        <div className="issue-metrics">
                            <div className="metric-item">
                                <Target size={16} />
                                <span className="metric-label">Confidence</span>
                                <span className="metric-value">{issue.confidence}%</span>
                            </div>
                            <div className="metric-item">
                                <Zap size={16} />
                                <span className="metric-label">Impact</span>
                                <span className="metric-value">{issue.impact}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Generate Fix Section */}
                    <div className="issue-detail-actions">
                        {isGeneratingAiFix ? (
                            <div className="generating-state">
                                <div className="spinner"></div>
                                <div className="generating-text">
                                    <h3>Generating AI Fix...</h3>
                                    <p>AI is analyzing your code and generating a fix for this issue.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="generate-fix-section">
                                <h3>Ready to Fix?</h3>
                                <p>Generate an AI-powered fix suggestion for this issue.</p>
                                <button
                                    className="action-button primary large"
                                    onClick={() => onGenerateAiFix(issue.id)}
                                    disabled={isGeneratingAiFix}
                                >
                                    <Sparkles size={18} /> Generate AI Fix
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Check if suggestion has valid code content
    const hasSuggestedCode = selectedSuggestion.suggestedCode &&
        typeof selectedSuggestion.suggestedCode === 'string' &&
        selectedSuggestion.suggestedCode.trim().length > 0;

    const hasOriginalCode = selectedSuggestion.originalCode &&
        typeof selectedSuggestion.originalCode === 'string' &&
        selectedSuggestion.originalCode.trim().length > 0;

    // If suggestion has no code, show regenerate option
    if (!hasSuggestedCode) {
        return (
            <div className="diff-preview">
                <div className="diff-issue-summary">
                    <div className="issue-summary-badges">
                        <span
                            className="severity-badge small"
                            style={{ backgroundColor: getSeverityColor(issue.severity) }}
                        >
                            {issue.severity}
                        </span>
                        <span className="category-badge small">
                            {getCategoryIcon(issue.category)}
                            <span>{issue.category.replace('-', ' ')}</span>
                        </span>
                    </div>
                    <h3 className="issue-summary-title">{issue.title}</h3>
                </div>

                <div className="suggestion-info" style={{ marginBottom: '16px' }}>
                    <h4>{selectedSuggestion.title}</h4>
                    <p>{selectedSuggestion.description}</p>
                </div>

                <div className="empty-state" style={{ padding: '24px', textAlign: 'center', background: 'var(--vscode-inputValidation-warningBackground, rgba(255,140,0,0.1))', borderRadius: '8px' }}>
                    <AlertTriangle size={32} style={{ marginBottom: '12px', color: 'var(--vscode-inputValidation-warningBorder, orange)' }} />
                    <h4>Code suggestion is incomplete</h4>
                    <p style={{ marginBottom: '16px' }}>The AI returned a truncated response. Click regenerate to try again.</p>
                    <button
                        className="action-button primary"
                        onClick={() => onGenerateAiFix(issue.id)}
                        disabled={isGeneratingAiFix}
                    >
                        {isGeneratingAiFix ? (
                            <>Regenerating...</>
                        ) : (
                            <><Sparkles size={14} /> Regenerate Fix</>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    const handleApply = () => {
        if (!selectedSuggestion) return;
        setIsApplying(true);
        onApply(selectedSuggestion);
        // Reset applying state after a reasonable delay for the file write to complete
        setTimeout(() => setIsApplying(false), 1500);
    };

    // Issue with suggestions - show diff preview
    return (
        <div className="diff-preview">
            {/* Issue Summary Bar */}
            <div className="diff-issue-summary">
                <div className="issue-summary-badges">
                    <span
                        className="severity-badge small"
                        style={{ backgroundColor: getSeverityColor(issue.severity) }}
                    >
                        {issue.severity}
                    </span>
                    <span className="category-badge small">
                        {getCategoryIcon(issue.category)}
                        <span>{issue.category.replace('-', ' ')}</span>
                    </span>
                </div>
                <h3 className="issue-summary-title">{issue.title}</h3>
            </div>

            <div className="diff-header">
                <h3>Suggested Fix</h3>
                <div className="view-mode-toggle">
                    <button className={viewMode === 'split' ? 'active' : ''} onClick={() => setViewMode('split')}>Split</button>
                    <button className={viewMode === 'unified' ? 'active' : ''} onClick={() => setViewMode('unified')}>Unified</button>
                </div>
            </div>

            <div className="suggestion-info">
                <h4>{selectedSuggestion.title}</h4>
                <p>{selectedSuggestion.description}</p>
            </div>

            <div className={`diff-container ${viewMode}`}>
                {viewMode === 'split' ? (
                    <>
                        <div className="diff-pane original">
                            <div className="diff-pane-header"><span>Original</span></div>
                            <pre className="diff-code"><code>{selectedSuggestion.originalCode}</code></pre>
                        </div>
                        <div className="diff-pane suggested">
                            <div className="diff-pane-header"><span>Suggested</span></div>
                            <pre className="diff-code"><code>{selectedSuggestion.suggestedCode}</code></pre>
                        </div>
                    </>
                ) : (
                    <div className="diff-pane unified">
                        <div className="diff-pane-header"><span>Changes</span></div>
                        <pre className="diff-code"><code>{selectedSuggestion.diff}</code></pre>
                    </div>
                )}
            </div>

            <div className="diff-actions">
                <button className="action-button secondary" onClick={() => onOpenFile(selectedSuggestion.location.filePath, selectedSuggestion.location.range.start.line + 1)}>
                    <Eye size={14} /> Preview in Editor
                </button>
                {issue && (
                    <button 
                        className="action-button secondary" 
                        onClick={() => onGenerateAiFix(issue.id)}
                        disabled={isGeneratingAiFix}
                    >
                        {isGeneratingAiFix ? (
                            <>Regenerating...</>
                        ) : (
                            <><Sparkles size={14} /> Regenerate Fix</>
                        )}
                    </button>
                )}
                <button className="action-button primary" onClick={handleApply} disabled={isApplying}>
                    {isApplying ? (
                        <>Applying...</>
                    ) : (
                        <><Check size={14} /> Apply Fix</>
                    )}
                </button>
            </div>
        </div>
    );
};

export default DiffPreview;
