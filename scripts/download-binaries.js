#!/usr/bin/env node
/**
 * Download pre-compiled binaries for external analysis tools
 * 
 * This script downloads and extracts binaries for:
 * - Semgrep (security scanning)
 * - Biome (JS/TS linting)
 * - Ruff (Python linting)
 * - TFLint (Terraform linting)
 * 
 * Note: Checkov is Python-based and difficult to bundle as a standalone binary,
 * so it's treated as optional.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const BIN_DIR = path.join(__dirname, '..', 'bin');

/**
 * Get current platform identifier
 */
function getCurrentPlatform() {
    const platform = process.platform;
    const arch = process.arch;
    
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

// Tool versions and download URLs
// Note: Semgrep doesn't provide standalone binaries anymore - install via pip or system package manager
const TOOLS = {
    biome: {
        version: 'v1.5.3',
        platforms: {
            'darwin-arm64': 'https://github.com/biomejs/biome/releases/download/cli%2Fv1.5.3/biome-darwin-arm64',
            'darwin-x64': 'https://github.com/biomejs/biome/releases/download/cli%2Fv1.5.3/biome-darwin-x64',
            'linux-x64': 'https://github.com/biomejs/biome/releases/download/cli%2Fv1.5.3/biome-linux-x64',
            'win32-x64': 'https://github.com/biomejs/biome/releases/download/cli%2Fv1.5.3/biome-win32-x64.exe',
        },
        binaryName: 'biome',
        isDirect: true, // Direct binary download, no extraction
    },
    ruff: {
        version: '0.14.14',
        platforms: {
            'darwin-arm64': 'https://github.com/astral-sh/ruff/releases/download/0.14.14/ruff-aarch64-apple-darwin.tar.gz',
            'darwin-x64': 'https://github.com/astral-sh/ruff/releases/download/0.14.14/ruff-x86_64-apple-darwin.tar.gz',
            'linux-x64': 'https://github.com/astral-sh/ruff/releases/download/0.14.14/ruff-x86_64-unknown-linux-gnu.tar.gz',
            'win32-x64': 'https://github.com/astral-sh/ruff/releases/download/0.14.14/ruff-x86_64-pc-windows-msvc.zip',
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

/**
 * Download a file from a URL
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        console.log(`  Downloading: ${url}`);
        
        const client = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);
        
        const request = client.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(destPath);
                return downloadFile(response.headers.location, destPath)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(destPath);
                return reject(new Error(`Download failed: ${response.statusCode} ${response.statusMessage}`));
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log(`  Downloaded to: ${destPath}`);
                resolve();
            });
        });
        
        request.on('error', (err) => {
            file.close();
            fs.unlinkSync(destPath);
            reject(err);
        });
        
        file.on('error', (err) => {
            file.close();
            fs.unlinkSync(destPath);
            reject(err);
        });
    });
}

/**
 * Extract archive (zip or tar.gz)
 */
async function extractArchive(archivePath, destDir, binaryName) {
    const ext = path.extname(archivePath);
    
    console.log(`  Extracting: ${archivePath}`);
    
    if (ext === '.zip') {
        // Use platform-specific unzip command
        if (process.platform === 'win32') {
            // Use PowerShell's Expand-Archive on Windows
            await execAsync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`);
        } else {
            // Use unzip command on Unix-like systems
execAsync(`unzip -o "${archivePath}" -d "${destDir}"`) // FixedexecAsync(`unzip -o "${archivePath}" -d "${destDir}"`);
        }
    } else if (archivePath.endsWith('.tar.gz')) {
        // Use tar command (available on Windows 10+ and Unix-like systems)
        await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`);
    }
    
    // Find the binary recursively (may be in a subdirectory)
    const findBinary = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                // Recursively search in subdirectories
                const found = findBinary(filePath);
                if (found) return found;
            } else if (stat.isFile() && (file === binaryName || file.startsWith(binaryName.replace(/\.exe$/, '')))) {
                return filePath;
            }
        }
        return null;
    };
    
    const binaryPath = findBinary(destDir);
    if (!binaryPath) {
        throw new Error(`Could not find binary ${binaryName} in extracted archive`);
    }
    
    const finalPath = path.join(destDir, binaryName);
    if (binaryPath !== finalPath) {
        fs.renameSync(binaryPath, finalPath);
    }
    
    // Make executable
    fs.chmodSync(finalPath, 0o755);
    console.log(`  Extracted binary: ${finalPath}`);
    
    // Clean up archive
    fs.unlinkSync(archivePath);
    
    // Clean up any extra files/directories from this extraction only
    const finalBinary = path.join(destDir, binaryName);
    for (const file of fs.readdirSync(destDir)) {
        const filePath = path.join(destDir, file);
        const isArchiveFile = file.endsWith('.tar.gz') || file.endsWith('.zip');
        const isExtractedDir = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
        
        if (filePath !== finalBinary && (isArchiveFile || isExtractedDir)) {
            try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
            } catch (err) {
                // Ignore errors
            }
        }
    }
}

/**
 * Download and setup a tool for a specific platform
 */
async function downloadToolForPlatform(toolName, toolConfig, platform) {
    const url = toolConfig.platforms[platform];
    if (!url) {
        console.log(`  ⚠️  No binary available for ${platform}`);
        return;
    }
    
    const platformDir = path.join(BIN_DIR, platform);
    if (!fs.existsSync(platformDir)) {
        fs.mkdirSync(platformDir, { recursive: true });
    }
    
    const binaryName = toolConfig.binaryName;
    const ext = platform === 'win32-x64' ? '.exe' : '';
    const finalBinaryPath = path.join(platformDir, binaryName + ext);
    
    // Check if already downloaded
    if (fs.existsSync(finalBinaryPath)) {
        console.log(`  ✓ Already downloaded: ${finalBinaryPath}`);
        return;
    }
    
    try {
        if (toolConfig.isDirect) {
            // Direct binary download
            await downloadFile(url, finalBinaryPath);
            fs.chmodSync(finalBinaryPath, 0o755);
        } else {
            // Download archive and extract
            const archiveExt = url.endsWith('.zip') ? '.zip' : '.tar.gz';
            const archivePath = path.join(platformDir, `${binaryName}${archiveExt}`);
            await downloadFile(url, archivePath);
            await extractArchive(archivePath, platformDir, binaryName + ext);
        }
        
        console.log(`  ✓ Installed: ${finalBinaryPath}`);
    } catch (error) {
        console.error(`  ✗ Failed to download ${toolName} for ${platform}:`, error.message);
    }
}

/**
 * Download all tools
 */
async function downloadAllTools(currentPlatformOnly = false) {
    console.log('📦 Downloading external analysis tool binaries...\n');
    
    let platforms;
    if (currentPlatformOnly) {
        const currentPlatform = getCurrentPlatform();
        if (!currentPlatform) {
            console.error('❌ Unsupported platform:', process.platform, process.arch);
            process.exit(1);
        }
        platforms = [currentPlatform];
        console.log(`⚡ Current platform only: ${currentPlatform}\n`);
    } else {
        platforms = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'];
        console.log('🌍 Downloading for all platforms (for packaging)\n');
    }
    
    for (const [toolName, toolConfig] of Object.entries(TOOLS)) {
        console.log(`\n🔧 ${toolName} (${toolConfig.version})`);
        
        for (const platform of platforms) {
            console.log(`\n  Platform: ${platform}`);
            await downloadToolForPlatform(toolName, toolConfig, platform);
        }
    }
    
    console.log('\n✅ Binary download complete!');
    console.log('\nNote: Checkov is Python-based and not bundled. It will be used if installed by the user.');
}

/**
 * Create placeholder .gitkeep files
 */
function createGitkeepFiles() {
    const platforms = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'];
    
    for (const platform of platforms) {
        const platformDir = path.join(BIN_DIR, platform);
        
        // Ensure directory exists first
        if (!fs.existsSync(platformDir)) {
            fs.mkdirSync(platformDir, { recursive: true });
        }
        
        const gitkeepPath = path.join(platformDir, '.gitkeep');
        if (!fs.existsSync(gitkeepPath)) {
            fs.writeFileSync(gitkeepPath, '');
        }
    }
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    const skipDownload = args.includes('--skip-download') || args.includes('--dry-run');
    const currentPlatformOnly = args.includes('--current-platform');
    
    // Ensure bin directory exists
    if (!fs.existsSync(BIN_DIR)) {
        fs.mkdirSync(BIN_DIR, { recursive: true });
    }
    
    // Create gitkeep files to ensure directories are tracked
    createGitkeepFiles();
    
    if (skipDownload) {
        console.log('📦 Skipping binary download (--skip-download flag)');
        console.log('✓ Directory structure created');
        return;
    }
    
    // Check for required commands (platform-specific)
    try {
        if (process.platform === 'win32') {
            // On Windows, check for tar (built-in on Windows 10+) and PowerShell
            await execAsync('where tar');
            await execAsync('where powershell');
        } else {
            // On Unix-like systems, check for unzip and tar
            await execAsync('which unzip');
            await execAsync('which tar');
        }
    } catch (error) {
        if (process.platform === 'win32') {
            console.error('❌ Error: tar or PowerShell commands are required');
            console.error('These should be available on Windows 10+ by default.');
            console.error('If missing, please update Windows or install Git Bash.');
        } else {
            console.error('❌ Error: unzip and tar commands are required');
            console.error('Install them with: brew install unzip (on macOS)');
        }
        process.exit(1);
    }
    
    await downloadAllTools(currentPlatformOnly);
}

// Run if executed directly
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { downloadAllTools, TOOLS };
