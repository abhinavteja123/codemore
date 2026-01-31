/**
 * CodeMore Daemon Manager
 * 
 * Manages the lifecycle of the background Context Daemon process.
 * Handles spawning, health checks, graceful shutdown, and automatic restart.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, fork } from 'child_process';
import * as treeKill from 'tree-kill';

interface DaemonState {
    status: 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';
    pid?: number;
    startTime?: number;
    restartCount: number;
    lastError?: string;
}

export class DaemonManager implements vscode.Disposable {
    private process: ChildProcess | null = null;
    private state: DaemonState = { status: 'stopped', restartCount: 0 };
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private restartTimeout: NodeJS.Timeout | null = null;

    // Configuration
    private readonly maxRestartAttempts = 5;
    private readonly restartDelayBase = 1000; // Base delay in ms
    private readonly healthCheckIntervalMs = 30000; // 30 seconds

    // Event emitters
    private readonly outputEmitter = new vscode.EventEmitter<string>();
    readonly onDaemonOutput = this.outputEmitter.event;

    private readonly stateChangeEmitter = new vscode.EventEmitter<DaemonState>();
    readonly onStateChange = this.stateChangeEmitter.event;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly outputChannel: vscode.OutputChannel
    ) { }

    /**
     * Start the daemon process
     */
    async start(): Promise<void> {
        if (this.state.status === 'running' || this.state.status === 'starting') {
            this.outputChannel.appendLine('Daemon is already running or starting');
            return;
        }

        this.setState({ status: 'starting' });
        this.outputChannel.appendLine('=================================');
        this.outputChannel.appendLine('Starting Context Daemon...');
        this.outputChannel.appendLine(`Extension path: ${this.context.extensionPath}`);

        try {
            // Get path to daemon entry point
            const daemonPath = this.getDaemonPath();
            this.outputChannel.appendLine(`Daemon path: ${daemonPath}`);

            // Spawn the daemon process
            this.outputChannel.appendLine('Forking daemon process...');
            this.process = fork(daemonPath, [], {
                cwd: this.context.extensionPath,
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                execArgv: [], // Disable inspector to prevent port conflicts
                env: {
                    ...process.env,
                    NODE_ENV: 'production',
                    CODEMORE_EXTENSION_PATH: this.context.extensionPath,
                },
            });

            this.outputChannel.appendLine(`Daemon process forked (PID: ${this.process.pid})`);

            // Handle process events
            this.setupProcessHandlers();

            // Wait for daemon to be ready
            this.outputChannel.appendLine('Waiting for daemon ready signal...');
            await this.waitForReady();

            this.setState({
                status: 'running',
                pid: this.process.pid,
                startTime: Date.now(),
                restartCount: 0,
            });

            // Start health checks
            this.startHealthChecks();

            this.outputChannel.appendLine(`Daemon started successfully (PID: ${this.process.pid})`);
            this.outputChannel.appendLine('=================================');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            const stack = error instanceof Error ? error.stack : '';
            this.outputChannel.appendLine(`Failed to start daemon: ${message}`);
            if (stack) {
                this.outputChannel.appendLine(`Stack trace: ${stack}`);
            }
            this.outputChannel.appendLine('=================================');
            this.setState({ status: 'crashed', lastError: message });

            // Attempt restart with backoff
            this.scheduleRestart();
        }
    }

    /**
     * Stop the daemon process gracefully
     */
    async stop(): Promise<void> {
        if (this.state.status === 'stopped' || this.state.status === 'stopping') {
            return;
        }

        this.setState({ status: 'stopping' });
        this.outputChannel.appendLine('Stopping Context Daemon...');

        // Clear intervals and timeouts
        this.clearHealthChecks();
        this.clearRestartTimeout();

        if (this.process) {
            try {
                // Send shutdown signal
                this.process.send({ type: 'shutdown' });

                // Wait for graceful shutdown with timeout
                await Promise.race([
                    new Promise<void>((resolve) => {
                        this.process!.once('exit', () => resolve());
                    }),
                    new Promise<void>((resolve) => {
                        setTimeout(() => {
                            this.outputChannel.appendLine('Graceful shutdown timed out, forcing kill');
                            resolve();
                        }, 5000);
                    }),
                ]);

                // Force kill if still running
                if (this.process.pid && !this.process.killed) {
                    await this.forceKill(this.process.pid);
                }
            } catch (error) {
                this.outputChannel.appendLine(`Error stopping daemon: ${error}`);
            }

            this.process = null;
        }

        this.setState({ status: 'stopped' });
        this.outputChannel.appendLine('Daemon stopped');
    }

    /**
     * Restart the daemon
     */
    async restart(): Promise<void> {
        this.outputChannel.appendLine('Restarting Context Daemon...');
        await this.stop();
        this.state.restartCount = 0; // Reset restart count for manual restart
        await this.start();
    }

    /**
     * Send a message to the daemon
     */
    sendToDaemon(message: string): void {
        if (this.process && this.state.status === 'running') {
            try {
                this.process.send(message);
            } catch (error) {
                this.outputChannel.appendLine(`Error sending to daemon: ${error}`);
            }
        }
    }

    /**
     * Get the path to the daemon entry point
     */
    private getDaemonPath(): string {
        // The daemon is bundled by webpack to daemon/dist/index.js
        const daemonPath = path.join(this.context.extensionPath, 'daemon', 'dist', 'index.js');
        
        // Check if the daemon file exists
        if (!fs.existsSync(daemonPath)) {
            this.outputChannel.appendLine(`Daemon file not found at: ${daemonPath}`);
            throw new Error(`Daemon not found at ${daemonPath}. Please ensure the extension is properly compiled.`);
        }
        
        return daemonPath;
    }

    /**
     * Setup handlers for the child process
     */
    private setupProcessHandlers(): void {
        if (!this.process) {
            return;
        }

        // Handle IPC messages from daemon
        this.process.on('message', (message: unknown) => {
            // Convert to string if it's an object
            const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
            this.outputEmitter.fire(messageStr);
        });

        // Handle stdout (for debugging)
        this.process.stdout?.on('data', (data: Buffer) => {
            const text = data.toString().trim();
            if (text) {
                this.outputChannel.appendLine(`[Daemon] ${text}`);
            }
        });

        // Handle stderr
        this.process.stderr?.on('data', (data: Buffer) => {
            const text = data.toString().trim();
            if (text) {
                this.outputChannel.appendLine(`[Daemon Error] ${text}`);
            }
        });

        // Handle process exit
        this.process.on('exit', (code, signal) => {
            this.outputChannel.appendLine(
                `Daemon exited (code: ${code}, signal: ${signal})`
            );

            if (this.state.status !== 'stopping') {
                // Unexpected exit - attempt restart
                this.setState({
                    status: 'crashed',
                    lastError: `Exit code: ${code}, signal: ${signal}`
                });
                this.scheduleRestart();
            }
        });

        // Handle process errors
        this.process.on('error', (error) => {
            this.outputChannel.appendLine(`Daemon process error: ${error.message}`);
            this.setState({ status: 'crashed', lastError: error.message });
            this.scheduleRestart();
        });
    }

    /**
     * Wait for the daemon to signal it's ready
     */
    private waitForReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Daemon startup timeout'));
            }, 10000);

            const handler = (message: unknown) => {
                try {
                    // Handle both string and object messages
                    const msg = typeof message === 'string' ? JSON.parse(message) : message;
                    if (
                        typeof msg === 'object' &&
                        msg !== null &&
                        'type' in msg &&
                        (msg as { type: string }).type === 'ready'
                    ) {
                        clearTimeout(timeout);
                        this.process?.off('message', handler);
                        resolve();
                    }
                } catch (error) {
                    // Ignore parse errors
                }
            };

            this.process?.on('message', handler);
        });
    }

    /**
     * Schedule a daemon restart with exponential backoff
     */
    private scheduleRestart(): void {
        if (this.state.restartCount >= this.maxRestartAttempts) {
            this.outputChannel.appendLine(
                `Max restart attempts (${this.maxRestartAttempts}) reached. Manual restart required.`
            );
            vscode.window.showErrorMessage(
                'CodeMore daemon failed to start. Use "CodeMore: Restart Context Daemon" to try again.',
                'Restart'
            ).then((selection) => {
                if (selection === 'Restart') {
                    vscode.commands.executeCommand('codemore.restartDaemon');
                }
            });
            return;
        }

        const delay = this.restartDelayBase * Math.pow(2, this.state.restartCount);
        this.outputChannel.appendLine(
            `Scheduling restart in ${delay}ms (attempt ${this.state.restartCount + 1}/${this.maxRestartAttempts})`
        );

        this.restartTimeout = setTimeout(async () => {
            this.state.restartCount++;
            await this.start();
        }, delay);
    }

    /**
     * Start periodic health checks
     */
    private startHealthChecks(): void {
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.healthCheckIntervalMs);
    }

    /**
     * Perform a health check on the daemon
     */
    private performHealthCheck(): void {
        if (!this.process || this.state.status !== 'running') {
            return;
        }

        // Check if process is still alive
        try {
            // Sending signal 0 checks if process exists without killing it
            process.kill(this.process.pid!, 0);
        } catch {
            this.outputChannel.appendLine('Health check failed: daemon process not responding');
            this.setState({ status: 'crashed', lastError: 'Health check failed' });
            this.scheduleRestart();
        }
    }

    /**
     * Clear health check interval
     */
    private clearHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Clear restart timeout
     */
    private clearRestartTimeout(): void {
        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
            this.restartTimeout = null;
        }
    }

    /**
     * Force kill a process and its children
     */
    private forceKill(pid: number): Promise<void> {
        return new Promise((resolve) => {
            const kill = (treeKill as any).default || treeKill;
            kill(pid, 'SIGKILL', (error: Error | undefined) => {
                // Ignore "process not found" errors - process already exited
                if (error && !error.message.includes('not found')) {
                    this.outputChannel.appendLine(`Force kill warning: ${error.message}`);
                }
                resolve();
            });
        });
    }

    /**
     * Update daemon state and emit change event
     */
    private setState(update: Partial<DaemonState>): void {
        this.state = { ...this.state, ...update };
        this.stateChangeEmitter.fire(this.state);
    }

    /**
     * Cleanup resources
     */
    dispose(): void {
        this.clearHealthChecks();
        this.clearRestartTimeout();
        this.stop();
        this.outputEmitter.dispose();
        this.stateChangeEmitter.dispose();
    }
}
