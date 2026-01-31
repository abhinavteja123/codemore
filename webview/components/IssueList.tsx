/**
 * IssueList Component
 * 
 * Displays a filterable and sortable list of code issues
 */

import React, { useState, useMemo } from 'react';
import { CodeIssue, Severity, IssueCategory } from '../types';
import {
    Search,
    X,
    Filter,
    Bug,
    AlertTriangle,
    Gauge,
    Shield,
    Wrench,
    Accessibility,
    Star,
    FileText,
    Target,
    Zap,
    Download,
} from 'lucide-react';

interface IssueListProps {
    issues: CodeIssue[];
    selectedIssue: CodeIssue | null;
    onSelectIssue: (issue: CodeIssue) => void;
    onOpenFile: (filePath: string, line?: number) => void;
    onExportIssues: (issues: CodeIssue[]) => void;
}

type SortBy = 'severity' | 'category' | 'file' | 'date';
type SortOrder = 'asc' | 'desc';

const IssueList: React.FC<IssueListProps> = ({
    issues,
    selectedIssue,
    onSelectIssue,
    onOpenFile,
    onExportIssues,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSeverities, setSelectedSeverities] = useState<Set<Severity>>(new Set());
    const [selectedCategories, setSelectedCategories] = useState<Set<IssueCategory>>(new Set());
    const [sortBy, setSortBy] = useState<SortBy>('severity');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [showFilters, setShowFilters] = useState(false);

    // Canonical severity levels used everywhere
    const severities: Severity[] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
    const categories: IssueCategory[] = [
        'bug', 'code-smell', 'performance', 'security', 'maintainability', 'accessibility', 'best-practice'
    ];

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
            case 'bug': return <Bug size={12} />;
            case 'code-smell': return <AlertTriangle size={12} />;
            case 'performance': return <Gauge size={12} />;
            case 'security': return <Shield size={12} />;
            case 'maintainability': return <Wrench size={12} />;
            case 'accessibility': return <Accessibility size={12} />;
            case 'best-practice': return <Star size={12} />;
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

    // Filter and sort issues
    const filteredIssues = useMemo(() => {
        let result = [...issues];

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(
                (issue) =>
                    issue.title.toLowerCase().includes(query) ||
                    issue.description.toLowerCase().includes(query) ||
                    issue.location.filePath.toLowerCase().includes(query)
            );
        }

        // Filter by severity (canonical severity only)
        if (selectedSeverities.size > 0) {
            result = result.filter((issue) => selectedSeverities.has(issue.severity));
        }

        // Filter by category
        if (selectedCategories.size > 0) {
            result = result.filter((issue) => selectedCategories.has(issue.category));
        }

        // Sort
        result.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'severity':
                    comparison = getSeverityOrder(a.severity) - getSeverityOrder(b.severity);
                    break;
                case 'category':
                    comparison = a.category.localeCompare(b.category);
                    break;
                case 'file':
                    comparison = a.location.filePath.localeCompare(b.location.filePath);
                    break;
                case 'date':
                    comparison = b.createdAt - a.createdAt;
                    break;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [issues, searchQuery, selectedSeverities, selectedCategories, sortBy, sortOrder]);

    const toggleSeverity = (severity: Severity) => {
        const newSet = new Set(selectedSeverities);
        if (newSet.has(severity)) {
            newSet.delete(severity);
        } else {
            newSet.add(severity);
        }
        setSelectedSeverities(newSet);
    };

    const toggleCategory = (category: IssueCategory) => {
        const newSet = new Set(selectedCategories);
        if (newSet.has(category)) {
            newSet.delete(category);
        } else {
            newSet.add(category);
        }
        setSelectedCategories(newSet);
    };

    const clearFilters = () => {
        setSearchQuery('');
        setSelectedSeverities(new Set());
        setSelectedCategories(new Set());
    };

    const exportIssues = () => {
        // Use VS Code API to handle export
        onExportIssues(filteredIssues);
    };

    const hasActiveFilters = searchQuery || selectedSeverities.size > 0 || selectedCategories.size > 0;

    return (
        <div className="issue-list">
            {/* Search and Filter Bar */}
            <div className="issue-list-header">
                <div className="search-bar">
                    <span className="search-icon"><Search size={14} /></span>
                    <input
                        type="text"
                        placeholder="Search issues..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                    {searchQuery && (
                        <button className="clear-button" onClick={() => setSearchQuery('')}>
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="filter-controls">
                    <button
                        className="export-button"
                        onClick={exportIssues}
                        disabled={filteredIssues.length === 0}
                        title="Export issues to JSON"
                    >
                        <Download size={14} /> Export
                    </button>
                    
                    <button
                        className={`filter-toggle ${showFilters ? 'active' : ''}`}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <Filter size={14} /> Filters
                        {hasActiveFilters && <span className="filter-badge" />}
                    </button>

                    <select
                        value={`${sortBy}-${sortOrder}`}
                        onChange={(e) => {
                            const [by, order] = e.target.value.split('-');
                            setSortBy(by as SortBy);
                            setSortOrder(order as SortOrder);
                        }}
                        className="sort-select"
                    >
                        <option value="severity-asc">Severity ↑</option>
                        <option value="severity-desc">Severity ↓</option>
                        <option value="category-asc">Category A-Z</option>
                        <option value="category-desc">Category Z-A</option>
                        <option value="file-asc">File A-Z</option>
                        <option value="file-desc">File Z-A</option>
                        <option value="date-desc">Newest First</option>
                        <option value="date-asc">Oldest First</option>
                    </select>
                </div>
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div className="filter-panel">
                    <div className="filter-section">
                        <span className="filter-label">Severity:</span>
                        <div className="filter-options">
                            {severities.map((severity) => (
                                <button
                                    key={severity}
                                    className={`filter-chip ${selectedSeverities.has(severity) ? 'active' : ''}`}
                                    style={{
                                        borderColor: getSeverityColor(severity),
                                        backgroundColor: selectedSeverities.has(severity)
                                            ? getSeverityColor(severity)
                                            : 'transparent',
                                    }}
                                    onClick={() => toggleSeverity(severity)}
                                >
                                    {severity}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="filter-section">
                        <span className="filter-label">Category:</span>
                        <div className="filter-options">
                            {categories.map((category) => (
                                <button
                                    key={category}
                                    className={`filter-chip ${selectedCategories.has(category) ? 'active' : ''}`}
                                    onClick={() => toggleCategory(category)}
                                >  {getCategoryIcon(category)} {category.replace('-', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {hasActiveFilters && (
                        <button className="clear-filters-button" onClick={clearFilters}>
                            Clear all filters
                        </button>
                    )}
                </div>
            )}

            {/* Results count */}
            <div className="results-count">
                {filteredIssues.length} of {issues.length} issues
            </div>

            {/* Issue List */}
            <div className="issues">
                {filteredIssues.length === 0 ? (
                    <div className="empty-state">
                        <p>
                            {issues.length === 0
                                ? 'No issues found. Your code is looking great!'
                                : 'No issues match your filters.'}
                        </p>
                    </div>
                ) : (
                    filteredIssues.map((issue) => (
                        <div
                            key={`${issue.id}-${issue.location.filePath}-${issue.location.range.start.line}`}
                            className={`issue-card ${selectedIssue?.id === issue.id ? 'selected' : ''}`}
                            onClick={() => onSelectIssue(issue)}
                        >
                            <div className="issue-header">
                                <span
                                    className="severity-badge"
                                    style={{ backgroundColor: getSeverityColor(issue.severity) }}
                                >
                                    {issue.severity}
                                </span>
                                <span className="category-badge">
                                    {getCategoryIcon(issue.category)} {issue.category.replace('-', ' ')}
                                </span>
                            </div>

                            <h4 className="issue-title">{issue.title}</h4>
                            <p className="issue-description">{issue.description}</p>

                            <div className="issue-location">
                                <button
                                    className="file-link"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenFile(issue.location.filePath, issue.location.range.start.line + 1);
                                    }}
                                >
                                    <FileText size={12} /> {issue.location.filePath.split(/[/\\]/).pop()}
                                    :{issue.location.range.start.line + 1}
                                </button>
                            </div>

                            <div className="issue-meta">
                                <span className="confidence" title="Confidence">
                                    <Target size={12} /> {issue.confidence}%
                                </span>
                                <span className="impact" title="Impact">
                                    <Zap size={12} /> {issue.impact}%
                                </span>
                            </div>

                            {issue.codeSnippet && (
                                <pre className="code-snippet">
                                    <code>{issue.codeSnippet}</code>
                                </pre>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default IssueList;
