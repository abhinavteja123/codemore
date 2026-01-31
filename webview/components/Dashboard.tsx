/**
 * Dashboard Component
 * 
 * Displays code health metrics and summary visualizations
 */

import React from 'react';
import { CodeHealthMetrics, CodeIssue, Severity, IssueCategory } from '../types';
import {
    Bug,
    AlertTriangle,
    Gauge,
    Shield,
    Wrench,
    Accessibility,
    Star,
    Folder,
    FileText,
} from 'lucide-react';

interface DashboardProps {
    metrics: CodeHealthMetrics | null;
    issues: CodeIssue[];
    fileDiscovery: { totalFiles: number; fileTypes: Record<string, number> } | null;
    onSelectIssue: (issue: CodeIssue) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ metrics, issues, fileDiscovery, onSelectIssue }) => {
    if (!metrics) {
        return (
            <div className="dashboard empty-state">
                {fileDiscovery ? (
                    <div className="discovery-empty-state">
                        <p className="discovery-count"><Folder size={48} /> {fileDiscovery.totalFiles.toLocaleString()} files discovered</p>
                        <p>Click "Analyze Workspace" to start code analysis.</p>
                    </div>
                ) : (
                    <p>No metrics available. Run an analysis to see code health data.</p>
                )}
            </div>
        );
    }

    const getSeverityColor = (severity: Severity): string => {
        switch (severity) {
            case 'BLOCKER': return '#d32f2f'; // Dark red
            case 'CRITICAL': return '#f44336'; // Red
            case 'MAJOR': return '#ff9800'; // Orange
            case 'MINOR': return '#2196f3'; // Blue
            case 'INFO': return '#9e9e9e'; // Gray
        }
    };

    const getSeverityOrder = (severity: Severity): number => {
        switch (severity) {
            case 'BLOCKER': return 0;
            case 'CRITICAL': return 1;
            case 'MAJOR': return 2;
            case 'MINOR': return 3;
            case 'INFO': return 4;
        }
    };

    const getCategoryIcon = (category: IssueCategory) => {
        switch (category) {
            case 'bug': return <Bug size={16} />;
            case 'code-smell': return <AlertTriangle size={16} />;
            case 'performance': return <Gauge size={16} />;
            case 'security': return <Shield size={16} />;
            case 'maintainability': return <Wrench size={16} />;
            case 'accessibility': return <Accessibility size={16} />;
            case 'best-practice': return <Star size={16} />;
        }
    };

    const getCategoryIconClass = (category: IssueCategory): string => {
        switch (category) {
            case 'bug': return 'bug';
            case 'code-smell': return 'warning';
            case 'performance': return 'dashboard';
            case 'security': return 'shield';
            case 'maintainability': return 'tools';
            case 'accessibility': return 'accessibility';
            case 'best-practice': return 'star';
        }
    };

    const getScoreColor = (score: number): string => {
        if (score >= 80) return 'var(--color-success)';
        if (score >= 60) return 'var(--color-warning)';
        return 'var(--color-error)';
    };

    const formatDebt = (minutes: number): string => {
        if (minutes < 60) return `${minutes}m`;
        if (minutes < 480) return `${Math.round(minutes / 60)}h`;
        return `${Math.round(minutes / 480)}d`;
    };

    // Get top issues sorted by severity
    const topIssues = issues
        .sort((a, b) => getSeverityOrder(a.severity) - getSeverityOrder(b.severity))
        .slice(0, 5);

    return (
        <div className="dashboard">
            {/* Health Score - show actual score or N/A only if no files analyzed */}
            <div className="score-card">
                <div className="score-circle" style={{ borderColor: getScoreColor(metrics.overallScore || 0) }}>
                    <span className="score-value">{metrics.filesAnalyzed > 0 ? Math.round(metrics.overallScore) : 'N/A'}</span>
                    <span className="score-label">Health Score</span>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <span className="codicon codicon-file stat-icon"></span>
                    <div className="stat-content">
                        <span className="stat-value">{metrics.filesAnalyzed?.toLocaleString() || 0}</span>
                        <span className="stat-label">Files Analyzed</span>
                    </div>
                </div>

                <div className="stat-card">
                    <span className="codicon codicon-folder stat-icon"></span>
                    <div className="stat-content">
                        <span className="stat-value">{(fileDiscovery?.totalFiles || metrics.totalFiles || 0).toLocaleString()}</span>
                        <span className="stat-label">Total Files</span>
                    </div>
                </div>

                <div className="stat-card">
                    <span className="codicon codicon-symbol-text stat-icon"></span>
                    <div className="stat-content">
                        <span className="stat-value">{(metrics.linesOfCode || 0).toLocaleString()}</span>
                        <span className="stat-label">Lines of Code</span>
                    </div>
                </div>

                <div className="stat-card">
                    <span className="codicon codicon-watch stat-icon"></span>
                    <div className="stat-content">
                        <span className="stat-value">{formatDebt(metrics.technicalDebtMinutes || 0)}</span>
                        <span className="stat-label">Tech Debt</span>
                    </div>
                </div>

                <div className="stat-card">
                    <span className="codicon codicon-graph stat-icon"></span>
                    <div className="stat-content">
                        <span className="stat-value">{(metrics.averageComplexity || 0).toFixed(1)}</span>
                        <span className="stat-label">Avg Complexity</span>
                    </div>
                </div>

                <div className="stat-card">
                    <span className="codicon codicon-code stat-icon"></span>
                    <div className="stat-content">
                        <span className="stat-value">{fileDiscovery ? Object.keys(fileDiscovery.fileTypes).length : '—'}</span>
                        <span className="stat-label">File Types</span>
                    </div>
                </div>
            </div>

            {/* File Types Breakdown */}
            {fileDiscovery && Object.keys(fileDiscovery.fileTypes).length > 0 && (
                <div className="section">
                    <h3 className="section-title">Files by Type</h3>
                    <div className="file-types-grid">
                        {Object.entries(fileDiscovery.fileTypes)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 12)
                            .map(([type, count]) => (
                                <div key={type} className="file-type-card">
                                    <span className="file-type-count">{count}</span>
                                    <span className="file-type-name">{type}</span>
                                    <div className="file-type-bar">
                                        <div 
                                            className="file-type-bar-fill"
                                            style={{
                                                width: `${(count / fileDiscovery.totalFiles) * 100}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Issues by Severity */}
            <div className="section">
                <h3 className="section-title">Issues by Severity</h3>
                <div className="severity-bars">
                    {(Object.entries(metrics.issuesBySeverity) as [Severity, number][]).map(
                        ([severity, count]) => (
                            <div key={severity} className="severity-bar-item">
                                <div className="severity-bar-label">
                                    <span className="severity-dot" style={{ backgroundColor: getSeverityColor(severity) }} />
                                    <span className="severity-name">{severity}</span>
                                    <span className="severity-count">{count}</span>
                                </div>
                                <div className="severity-bar-track">
                                    <div
                                        className="severity-bar-fill"
                                        style={{
                                            width: `${Math.min(100, (count / Math.max(1, issues.length)) * 100)}%`,
                                            backgroundColor: getSeverityColor(severity),
                                        }}
                                    />
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Issues by Category */}
            <div className="section">
                <h3 className="section-title">Issues by Category</h3>
                <div className="category-grid">
                    {(Object.entries(metrics.issuesByCategory) as [IssueCategory, number][])
                        .filter(([, count]) => count > 0)
                        .sort(([, a], [, b]) => b - a)
                        .map(([category, count]) => (
                            <div key={category} className="category-card">
                                <span className="category-icon">{getCategoryIcon(category)}</span>
                                <span className="category-count">{count}</span>
                                <span className="category-name">{category.replace('-', ' ')}</span>
                            </div>
                        ))}
                </div>
            </div>

            {/* Top Issues */}
            {topIssues.length > 0 && (
                <div className="section">
                    <h3 className="section-title">Top Issues</h3>
                    <div className="top-issues-list">
                        {topIssues.map((issue) => (
                            <button
                                key={issue.id}
                                className="top-issue-item"
                                onClick={() => onSelectIssue(issue)}
                            >
                                <span
                                    className="issue-severity-badge"
                                    style={{ backgroundColor: getSeverityColor(issue.severity) }}
                                >
                                    {issue.severity}
                                </span>
                                <span className="issue-title">{issue.title}</span>
                                <span className="issue-file">
                                    {issue.location.filePath.split(/[/\\]/).pop()}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
