/**
 * Analysis Queue Service
 *
 * Manages a queue of files for background analysis.
 * Supports priority-based processing and concurrency control.
 */

import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';
import { AstParser } from './astParser';
import { ContextMap } from './contextMap';
import { SuggestionEngine } from './suggestionEngine';
import { CodeIssue, FileContext } from '../../shared/protocol';
import { createLogger, sanitizeError } from '../lib/logger';

const logger = createLogger('analysisQueue');

// Bump this when analysis rules change to invalidate all cached results
const RULES_VERSION = '1.0.0';

interface AnalysisCacheEntry {
    contentHash: string;
    issues: CodeIssue[];
    analyzedAt: number;
    rulesVersion: string;
}

const analysisCache = new LRUCache<string, AnalysisCacheEntry>({
    max: 500,
    ttl: 1000 * 60 * 60, // 1 hour TTL
});

function getContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

interface QueueItem {
    filePath: string;
    content?: string;
    priority: number;
    addedAt: number;
}

type ProgressHandler = (progress: number, total: number, filePath: string) => void;
type IssuesHandler = (issues: CodeIssue[]) => void;
type CompleteHandler = () => void;

export class AnalysisQueue {
    private queue: QueueItem[] = [];
    private processing = new Set<string>();
    private isRunning = false;
    private isProcessing = false; // Mutex flag to prevent concurrent processing
    private progressHandlers: ProgressHandler[] = [];
    private issuesHandlers: IssuesHandler[] = [];
    private completeHandlers: CompleteHandler[] = [];
    private processedCount = 0;
    private totalCount = 0;

    constructor(
        private readonly astParser: AstParser,
        private readonly contextMap: ContextMap,
        private readonly suggestionEngine: SuggestionEngine,
        private readonly maxConcurrent: number = 3
    ) { }

    /**
     * Register a progress handler
     */
    onProgress(handler: ProgressHandler): void {
        this.progressHandlers.push(handler);
    }

    /**
     * Register an issues handler
     */
    onIssuesFound(handler: IssuesHandler): void {
        this.issuesHandlers.push(handler);
    }

    /**
     * Register a completion handler
     */
    onComplete(handler: CompleteHandler): void {
        this.completeHandlers.push(handler);
    }

    /**
     * Enqueue a file for analysis
     */
    async enqueue(filePath: string, content?: string, priority: number = 0): Promise<void> {
        // Check if already in queue or processing
        if (this.processing.has(filePath)) {
            return;
        }

        const existingIndex = this.queue.findIndex((item) => item.filePath === filePath);
        if (existingIndex !== -1) {
            // Update priority if higher
            if (priority > this.queue[existingIndex].priority) {
                this.queue[existingIndex].priority = priority;
                this.queue[existingIndex].content = content;
                this.sortQueue();
            }
            return;
        }

        // Add to queue
        this.queue.push({
            filePath,
            content,
            priority,
            addedAt: Date.now(),
        });

        this.totalCount++;
        this.sortQueue();

        // Start processing if not already running
        if (!this.isRunning) {
            this.startProcessing();
        }
    }

    /**
     * Start processing the queue
     */
    private async startProcessing(): Promise<void> {
        // Return immediately if already processing to prevent concurrent processing
        if (this.isProcessing) {
            return;
        }

        this.isRunning = true;
        this.isProcessing = true;

        try {
            while (this.queue.length > 0 && this.isRunning) {
                // Process up to maxConcurrent items
                const batch: QueueItem[] = [];
                while (batch.length < this.maxConcurrent && this.queue.length > 0) {
                    const item = this.queue.shift()!;
                    if (!this.processing.has(item.filePath)) {
                        batch.push(item);
                        this.processing.add(item.filePath);
                    }
                }

                if (batch.length === 0) {
                    break;
                }

                // Process batch concurrently
                await Promise.all(batch.map((item) => this.processItem(item)));
            }

            this.isRunning = false;

            // Signal completion if we processed everything
            if (this.queue.length === 0 && this.processing.size === 0 && this.totalCount > 0) {
                for (const handler of this.completeHandlers) {
                    handler();
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process a single queue item
     */
    private async processItem(item: QueueItem): Promise<void> {
        try {
            logger.debug({ filePath: item.filePath }, 'Processing file');

            // Get content if not provided
            const content = item.content || await this.contextMap.getFileContent(item.filePath);
            if (!content) {
                logger.debug({ filePath: item.filePath }, 'Empty content for file');
                return;
            }

            // Check cache before analysis
            const contentHash = getContentHash(content);
            const cacheKey = `${item.filePath}:${contentHash}:${RULES_VERSION}`;
            const cached = analysisCache.get(cacheKey);

            if (cached) {
                logger.debug({ filePath: item.filePath, cacheKey }, 'Analysis cache hit — skipping');
                // Use cached issues
                const fileContext = this.astParser.extractContext(
                    item.filePath,
                    await this.astParser.parse(item.filePath, content),
                    content
                );
                fileContext.issues = cached.issues;
                this.contextMap.updateFile(item.filePath, fileContext);

                this.processedCount++;
                for (const handler of this.progressHandlers) {
                    handler(this.processedCount, this.totalCount, item.filePath);
                }

                if (cached.issues.length > 0) {
                    for (const handler of this.issuesHandlers) {
                        handler(cached.issues);
                    }
                }
                return;
            }

            // Parse AST
            const ast = await this.astParser.parse(item.filePath, content);

            // Extract context
            const fileContext = this.astParser.extractContext(item.filePath, ast, content);

            // Analyze for issues
            const issues = await this.suggestionEngine.analyzeFile(
                item.filePath,
                content,
                fileContext
            );

            fileContext.issues = issues;

            // Update context map
            this.contextMap.updateFile(item.filePath, fileContext);

            // Store in cache
            analysisCache.set(cacheKey, {
                contentHash,
                issues,
                analyzedAt: Date.now(),
                rulesVersion: RULES_VERSION,
            });

            // Emit progress
            this.processedCount++;
            for (const handler of this.progressHandlers) {
                handler(this.processedCount, this.totalCount, item.filePath);
            }

            // Emit issues if found
            if (issues.length > 0) {
                for (const handler of this.issuesHandlers) {
                    handler(issues);
                }
            }

        } catch (error) {
            logger.error({ err: sanitizeError(error), filePath: item.filePath }, 'Error processing file');
        } finally {
            this.processing.delete(item.filePath);
        }
    }

    /**
     * Sort queue by priority (higher first) then by time added (older first)
     */
    private sortQueue(): void {
        this.queue.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            return a.addedAt - b.addedAt;
        });
    }

    /**
     * Stop processing
     */
    stop(): void {
        this.isRunning = false;
    }

    /**
     * Clear the queue and reset counters
     */
    clear(): void {
        this.queue = [];
        this.processing.clear();
        this.processedCount = 0;
        this.totalCount = 0;
    }

    /**
     * Reset analysis state (for new workspace analysis)
     */
    reset(): void {
        this.processedCount = 0;
        this.totalCount = 0;
    }

    /**
     * Get queue status
     */
    getStatus(): { queued: number; processing: number; processed: number; total: number } {
        return {
            queued: this.queue.length,
            processing: this.processing.size,
            processed: this.processedCount,
            total: this.totalCount,
        };
    }
}

/**
 * Clear the analysis cache (call when rules are reloaded or config changes)
 */
export function clearAnalysisCache(): void {
    analysisCache.clear();
    logger.info('Analysis cache cleared');
}
