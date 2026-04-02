/**
 * Hot Spot Detection
 * 
 * Identifies "hot spots" - code regions with high issue density or severity
 * that warrant focused analysis or review.
 * 
 * Used by both daemon and web for consistent hot spot detection.
 */

import type { CodeIssue, Severity } from './protocol';

export interface HotSpot {
    startLine: number;
    endLine: number;
    reason: string;
    severity: Severity;
    source: 'static' | 'external';
}

/**
 * Identify hot spots from a list of issues
 * 
 * Hot spots are areas where:
 * - Multiple issues cluster together
 * - High-severity issues are present (BLOCKER, CRITICAL, MAJOR)
 * - Complexity issues exist
 * - Security vulnerabilities are found
 */
export function identifyHotSpots(issues: CodeIssue[]): HotSpot[] {
    const hotSpots: HotSpot[] = [];
    const lineIssueCount = new Map<number, number>();

    // Count issues per line/region
    for (const issue of issues) {
        const line = issue.location.range.start.line;
        lineIssueCount.set(line, (lineIssueCount.get(line) || 0) + 1);
    }

    // Identify areas with multiple issues or high-severity issues
    for (const issue of issues) {
        const line = issue.location.range.start.line;
        const issueCount = lineIssueCount.get(line) || 0;

        // Mark as hotspot if:
        // 1. High severity (BLOCKER, CRITICAL, or MAJOR)
        // 2. Multiple issues in same area (2+)
        // 3. Complexity-related issues
        // 4. Security issues
        const isHighSeverity = 
            issue.severity === 'BLOCKER' || 
            issue.severity === 'CRITICAL' || 
            issue.severity === 'MAJOR';
        
        const hasMultipleIssues = issueCount >= 2;
        
        const isComplexityIssue = 
            issue.id.includes('cyclomatic') || 
            issue.id.includes('cognitive') || 
            issue.id.includes('nesting') ||
            issue.id.includes('complexity');
        
        const isSecurityIssue = 
            issue.category === 'security' ||
            issue.id.startsWith('semgrep-') ||
            issue.id.startsWith('checkov-') ||
            issue.id.includes('security');

        if (isHighSeverity || hasMultipleIssues || isComplexityIssue || isSecurityIssue) {
            // Determine source based on issue ID prefix
            const source: 'static' | 'external' = 
                issue.id.startsWith('semgrep-') || 
                issue.id.startsWith('biome-') || 
                issue.id.startsWith('ruff-') ||
                issue.id.startsWith('tflint-') ||
                issue.id.startsWith('checkov-') ? 'external' : 'static';

            hotSpots.push({
                startLine: issue.location.range.start.line,
                endLine: issue.location.range.end.line,
                reason: issue.title,
                severity: issue.severity,
                source,
            });
        }
    }

    // Deduplicate overlapping hotspots
    return deduplicateHotSpots(hotSpots);
}

/**
 * Deduplicate overlapping hot spots
 * Merges hotspots that overlap or are within 5 lines of each other
 */
function deduplicateHotSpots(hotSpots: HotSpot[]): HotSpot[] {
    if (hotSpots.length === 0) return [];

    // Sort by start line
    const sorted = [...hotSpots].sort((a, b) => a.startLine - b.startLine);
    const result: HotSpot[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const last = result[result.length - 1];

        // If overlapping or adjacent (within 5 lines), merge
        if (current.startLine <= last.endLine + 5) {
            last.endLine = Math.max(last.endLine, current.endLine);
            // Keep highest severity
            if (severityWeight(current.severity) > severityWeight(last.severity)) {
                last.severity = current.severity;
            }
            // Combine reasons (deduplicate)
            if (!last.reason.includes(current.reason)) {
                last.reason = `${last.reason}; ${current.reason}`;
            }
        } else {
            result.push(current);
        }
    }

    return result;
}

/**
 * Calculate severity weight for comparison
 */
function severityWeight(severity: Severity): number {
    switch (severity) {
        case 'BLOCKER': return 5;
        case 'CRITICAL': return 4;
        case 'MAJOR': return 3;
        case 'MINOR': return 2;
        case 'INFO': return 1;
        default: return 0;
    }
}

/**
 * Filter hot spots by minimum severity
 */
export function filterHotSpotsBySeverity(
    hotSpots: HotSpot[], 
    minSeverity: Severity
): HotSpot[] {
    const minWeight = severityWeight(minSeverity);
    return hotSpots.filter(h => severityWeight(h.severity) >= minWeight);
}

/**
 * Get top N hotspots sorted by severity
 */
export function getTopHotSpots(hotSpots: HotSpot[], limit: number = 10): HotSpot[] {
    return [...hotSpots]
        .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
        .slice(0, limit);
}
