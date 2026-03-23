/**
 * Binary Downloader Service
 *
 * Automatically downloads and installs external analysis tool binaries
 * on first run to provide a zero-install experience.
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger, sanitizeError } from '../lib/logger';

const logger = createLogger('binaryDownloader');

const execAsync = promisify(exec);

export interface DownloadProgress {
    tool: string;
    status: 'downloading' | 'extracting' | 'complete' | 'failed';
    progress?: number;
    error?: string;
}

interface ToolConfig {
    version: string;
    platforms: Record<string, string>;
    binaryName: string;
    isDirect?: boolean;
}

const TOOLS: Record<string, ToolConfig> = {
    semgrep: {
        version: 'v1.57.0',
        platforms: {
            'darwin-arm64': 'https://github.com/semgrep/semgrep/releases/download/v1.57.0/semgrep-v1.57.0-macos-arm64.zip',
            'darwin-x64': 'https://github.com/semgrep/semgrep/releases/download/v1.57.0/semgrep-v1.57.0-macos-x86_64.zip',
            'linux-x64': 'https://github.com/semgrep/semgrep/releases/download/v1.57.0/semgrep-v1.57.0-linux-x86_64.zip',
            'win32-x64': 'https://github.com/semgrep/semgrep/releases/download/v1.57.0/semgrep-v1.57.0-windows-x86_64.zip',
        },
        binaryName: 'semgrep',
    },
    biome: {
        version: 'v1.5.3',
        platforms: {
            'darwin-arm64': 'https://github.com/biomejs/biome/releases/download/cli%2Fv1.5.3/biome-darwin-arm64',
            'darwin-x64': 'https://github.com/biomejs/biome/releases/download/cli%2Fv1.5.3/biome-darwin-x64',
            'linux-x64': 'https://github.com/biomejs/biome/releases/download/cli%2Fv1.5.3/biome-linux-x64',
            'win32-x64': 'https://github.com/biomejs/biome/releases/download/cli%2Fv1.5.3/biome-win32-x64.exe',
        },
        binaryName: 'biome',
        isDirect: true,
    },
    ruff: {
        version: 'v0.1.15',
        platforms: {
            'darwin-arm64': 'https://github.com/astral-sh/ruff/releases/download/v0.1.15/ruff-aarch64-apple-darwin.tar.gz',
            'darwin-x64': 'https://github.com/astral-sh/ruff/releases/download/v0.1.15/ruff-x86_64-apple-darwin.tar.gz',
            'linux-x64': 'https://github.com/astral-sh/ruff/releases/download/v0.1.15/ruff-x86_64-unknown-linux-gnu.tar.gz',
            'win32-x64': 'https://github.com/astral-sh/ruff/releases/download/v0.1.15/ruff-x86_64-pc-windows-msvc.zip',
        },
        binaryName: 'ruff',
    },
    tflint: {
        version: 'v0.50.3',
        platforms: {
            'darwin-arm64': 'https://github.com/terraform-linters/tflint/releases/download/v0.50.3/tflint_darwin_arm64.zip',
            'darwin-x64': 'https://github.com/terraform-linters/tflint/releases/download/v0.50.3/tflint_darwin_amd64.zip',
            'linux-x64': 'https://github.com/terraform-linters/tflint/releases/download/v0.50.3/tflint_linux_amd64.zip',
            'win32-x64': 'https://github.com/terraform-linters/tflint/releases/download/v0.50.3/tflint_windows_amd64.zip',
        },
        binaryName: 'tflint',
    },
};

export class BinaryDownloader {
    private binDir: string;
    private progressCallback?: (progress: DownloadProgress) => void;

    constructor(binDir: string, progressCallback?: (progress: DownloadProgress) => void) {
        this.binDir = binDir;
        this.progressCallback = progressCallback;
    }

    /**
     * Check if all binaries are installed
     */
    async checkBinaries(): Promise<{ tool: string; installed: boolean }[]> {
        const platform = this.getPlatformKey();
        if (!platform) {
            return [];
        }

        const results: { tool: string; installed: boolean }[] = [];

        for (const [tool, config] of Object.entries(TOOLS)) {
            const binaryPath = this.getBinaryPath(tool, config, platform);
            const installed = !!(binaryPath && fs.existsSync(binaryPath));
            results.push({ tool, installed });
        }

        return results;
    }

    /**
     * Download and install missing binaries
     */
    async downloadMissing(): Promise<void> {
        const platform = this.getPlatformKey();
        if (!platform) {
            throw new Error(`Unsupported platform: ${os.platform()}-${os.arch()}`);
        }

        // Ensure bin directory exists
        const platformDir = path.join(this.binDir, platform);
        if (!fs.existsSync(platformDir)) {
            fs.mkdirSync(platformDir, { recursive: true });
        }

        const checks = await this.checkBinaries();
        const missing = checks.filter(c => !c.installed);

        if (missing.length === 0) {
            logger.info('All binaries already installed');
            return;
        }

        logger.info({ missingCount: missing.length, tools: missing.map(m => m.tool) }, 'Installing missing binaries');

        // Download missing binaries in parallel
        await Promise.all(
            missing.map(({ tool }) => this.downloadTool(tool, platform))
        );

        logger.info('All binaries installed successfully');
    }

    /**
     * Download a specific tool
     */
    private async downloadTool(tool: string, platform: string): Promise<void> {
        const config = TOOLS[tool];
        if (!config) {
            throw new Error(`Unknown tool: ${tool}`);
        }

        const url = config.platforms[platform];
        if (!url) {
            throw new Error(`No download URL for ${tool} on ${platform}`);
        }

        this.notifyProgress({ tool, status: 'downloading' });

        try {
            const platformDir = path.join(this.binDir, platform);
            const isWindows = platform.startsWith('win32');
            const ext = config.isDirect ? (isWindows ? '.exe' : '') : (url.endsWith('.zip') ? '.zip' : '.tar.gz');
            const tempFile = path.join(platformDir, `${tool}-temp${ext}`);
            const finalBinaryName = isWindows ? `${config.binaryName}.exe` : config.binaryName;
            const finalPath = path.join(platformDir, finalBinaryName);

            // Download
            await this.downloadFile(url, tempFile);

            if (config.isDirect) {
                // Direct binary - just rename and chmod
                fs.renameSync(tempFile, finalPath);
                if (!isWindows) {
                    fs.chmodSync(finalPath, 0o755);
                }
            } else {
                // Archive - extract
                this.notifyProgress({ tool, status: 'extracting' });
                await this.extractArchive(tempFile, platformDir, config.binaryName);

                // Clean up archive
                fs.unlinkSync(tempFile);
            }

            this.notifyProgress({ tool, status: 'complete' });
            logger.info({ tool }, 'Binary installed successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.notifyProgress({ tool, status: 'failed', error: errorMessage });
            logger.error({ err: sanitizeError(error), tool }, 'Binary download failed');
            throw error;
        }
    }

    /**
     * Download a file from URL
     */
    private downloadFile(url: string, destPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            const file = fs.createWriteStream(destPath);

            const request = client.get(url, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    file.close();
                    fs.unlinkSync(destPath);
                    return this.downloadFile(response.headers.location!, destPath)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    return reject(new Error(`Download failed: ${response.statusCode}`));
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            });

            request.on('error', (err) => {
                file.close();
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
                reject(err);
            });

            file.on('error', (err) => {
                file.close();
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
                reject(err);
            });
        });
    }

    /**
     * Extract archive
     */
    private async extractArchive(archivePath: string, destDir: string, binaryName: string): Promise<void> {
        const ext = path.extname(archivePath);

        if (ext === '.zip') {
            await execAsync(`unzip -o "${archivePath}" -d "${destDir}"`);
        } else if (archivePath.endsWith('.tar.gz')) {
            await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`);
        }

        // Find and rename the binary
        const files = fs.readdirSync(destDir);
        const isWindows = os.platform() === 'win32';
        const expectedName = isWindows ? `${binaryName}.exe` : binaryName;

        for (const file of files) {
            const filePath = path.join(destDir, file);
            const stat = fs.statSync(filePath);

            if (stat.isFile() && (file === binaryName || file.startsWith(binaryName))) {
                const finalPath = path.join(destDir, expectedName);
                if (filePath !== finalPath) {
                    fs.renameSync(filePath, finalPath);
                }
                if (!isWindows) {
                    fs.chmodSync(finalPath, 0o755);
                }
                break;
            }
        }
    }

    /**
     * Get platform key
     */
    private getPlatformKey(): string | null {
        const platform = os.platform();
        const arch = os.arch();

        if (platform === 'darwin' && arch === 'arm64') {
            return 'darwin-arm64';
        } else if (platform === 'darwin') {
            return 'darwin-x64';
        } else if (platform === 'linux') {
            return 'linux-x64';
        } else if (platform === 'win32') {
            return 'win32-x64';
        }

        return null;
    }

    /**
     * Get binary path for a tool
     */
    private getBinaryPath(tool: string, config: ToolConfig, platform: string): string | null {
        const isWindows = platform.startsWith('win32');
        const binaryName = isWindows ? `${config.binaryName}.exe` : config.binaryName;
        return path.join(this.binDir, platform, binaryName);
    }

    /**
     * Notify progress
     */
    private notifyProgress(progress: DownloadProgress): void {
        if (this.progressCallback) {
            this.progressCallback(progress);
        }
    }
}
