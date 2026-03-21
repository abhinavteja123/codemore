/**
 * File Watcher Service
 * 
 * Watches for file system changes with efficient debouncing.
 * Triggers analysis when files are modified.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { minimatch } from 'minimatch';

type FileChangeHandler = (filePath: string, content: string) => void;

export class FileWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private changeHandlers: FileChangeHandler[] = [];
    private excludePatterns: string[];
    private debounceDelay: number;
    private maxFileSizeKB: number;

    constructor(
        private readonly workspacePath: string,
        excludePatterns: string[] = [],
        debounceDelay: number = 2000,
        maxFileSizeKB: number = 500
    ) {
        this.excludePatterns = excludePatterns;
        this.debounceDelay = debounceDelay;
        this.maxFileSizeKB = maxFileSizeKB;
        this.start();
    }

    /**
     * Register a file change handler
     */
    onFileChange(handler: FileChangeHandler): void {
        this.changeHandlers.push(handler);
    }

    /**
     * Start watching for file changes
     */
    start(): void {
        if (this.watcher) {
            return;
        }

        console.log(`[FileWatcher] Starting watch on: ${this.workspacePath}`);

        this.watcher = chokidar.watch(this.workspacePath, {
            ignored: [
                ...this.excludePatterns,
                /(^|[\/\\])\../, // Dotfiles
                /node_modules/,
                /\.git/,
                /dist/,
                /build/,
                /out/,
            ],
            persistent: true,
            ignoreInitial: true,
            followSymlinks: false,
            awaitWriteFinish: {
                stabilityThreshold: 300,
                pollInterval: 100,
            },
        });

        this.watcher.on('change', (filePath) => this.handleChange(filePath));
        this.watcher.on('add', (filePath) => this.handleChange(filePath));
        this.watcher.on('error', (error) => {
            console.error('[FileWatcher] Error:', error);
        });
    }

    /**
     * Stop watching for file changes
     */
    stop(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }

        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }

    /**
     * Update exclude patterns
     */
    updateConfig(patterns: string[], maxFileSizeKB: number): void {
        this.excludePatterns = patterns;
        this.maxFileSizeKB = maxFileSizeKB;
        // Restart watcher with new patterns
        this.stop();
        this.start();
    }

    /**
     * Handle a file change event
     */
    private handleChange(filePath: string): void {
        // Check if file should be analyzed
        if (!this.shouldAnalyze(filePath)) {
            return;
        }

        // Clear existing debounce timer
        const existingTimer = this.debounceTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new debounce timer
        const timer = setTimeout(async () => {
            this.debounceTimers.delete(filePath);

            try {
                const content = await this.readFile(filePath);
                if (content !== null) {
                    for (const handler of this.changeHandlers) {
                        handler(filePath, content);
                    }
                }
            } catch (error) {
                console.error(`[FileWatcher] Error reading file ${filePath}:`, error);
            }
        }, this.debounceDelay);

        this.debounceTimers.set(filePath, timer);
    }

    /**
     * Check if a file should be analyzed
     */
    private shouldAnalyze(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath).toLowerCase();

        if (this.excludePatterns.some((pattern) => minimatch(filePath, pattern, { dot: true }))) {
            return false;
        }

        // Supported file extensions
        const supportedExtensions = [
            // JavaScript/TypeScript
            '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
            // Python
            '.py', '.pyw', '.pyx', '.pxd', '.pxi',
            // Other languages
            '.java', '.cs', '.go', '.rs', '.rb', '.php',
            '.cpp', '.c', '.h', '.hpp', '.cc', '.cxx',
            '.swift', '.kt', '.kts', '.scala',
            // Web
            '.html', '.htm', '.css', '.scss', '.sass', '.less',
            '.vue', '.svelte', '.astro',
            // Config/Data
            '.json', '.yaml', '.yml', '.toml', '.xml',
            '.md', '.mdx', '.markdown',
            // Shell/Scripts
            '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
            // Other
            '.sql', '.graphql', '.gql', '.prisma',
            '.env', '.ini', '.cfg',
        ];

        // Docker files (no extension)
        const dockerFiles = [
            'dockerfile', 'dockerfile.dev', 'dockerfile.prod',
            'docker-compose.yml', 'docker-compose.yaml',
            'compose.yml', 'compose.yaml',
            '.dockerignore',
        ];

        // Special files without extension
        const specialFiles = [
            'makefile', 'rakefile', 'gemfile', 'procfile',
            '.gitignore', '.eslintrc', '.prettierrc',
            '.babelrc', '.editorconfig', '.env.local',
            '.env.development', '.env.production',
        ];

        // Check special files
        if (dockerFiles.includes(fileName) || specialFiles.includes(fileName)) {
            return true;
        }

        if (!supportedExtensions.includes(ext)) {
            return false;
        }

        return true;
    }

    /**
     * Read file content
     */
    private async readFile(filePath: string): Promise<string | null> {
        try {
            const stats = await fs.promises.stat(filePath);

            // Skip large files based on configured limit
            if (stats.size > this.maxFileSizeKB * 1024) {
                console.log(`[FileWatcher] Skipping large file: ${filePath} (${stats.size} bytes)`);
                return null;
            }

            return await fs.promises.readFile(filePath, 'utf-8');
        } catch (error) {
            console.error(`[FileWatcher] Error reading ${filePath}:`, error);
            return null;
        }
    }
}
