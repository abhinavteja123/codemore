/**
 * Webview Types
 * Re-export types from shared protocol for use in webview components
 */

// Re-export from shared protocol
export type {
    CodeIssue,
    CodeSuggestion,
    CodeHealthMetrics,
    FileContext,
    Severity,
    IssueCategory,
    WebviewToExtensionMessage,
    ExtensionToWebviewMessage,
} from '../shared/protocol';

// Legacy type aliases - DO NOT use in new code
export type { OldSeverity } from '../shared/protocol';
/** @deprecated Use Severity instead */
export type { IssueSeverity, CanonicalSeverity } from '../shared/protocol';
