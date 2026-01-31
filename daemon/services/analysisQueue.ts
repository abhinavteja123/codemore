/**
 * Analysis Queue Service
 * 
 * Manages a queue of files for background analysis.
 * Supports priority-based processing and concurrency control.
 */

import { AstParser } from './astParser';
import { ContextMap } from './contextMap';
import { SuggestionEngine } from './suggestionEngine';
import { CodeIssue, FileContext } from '../../shared/protocol';

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
        this.isRunning = true;

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
    }

    /**
     * Process a single queue item
     */
    private async processItem(item: QueueItem): Promise<void> {
        try {
            console.log(`[AnalysisQueue] Processing: ${item.filePath}`);

            // Get content if not provided
            const content = item.content || await this.contextMap.getFileContent(item.filePath);
            if (!content) {
                console.log(`[AnalysisQueue] Empty content for: ${item.filePath}`);
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
            console.error(`[AnalysisQueue] Error processing ${item.filePath}:`, error);
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
