# CodeMore

CodeMore is a VS Code extension built for developers who want deep code intelligence without sacrificing privacy or performance. It combines automated quality analysis, context-aware suggestions, and smart refactoring tools into a single workflow.

## Features

* Real-time Code Analysis: Automatically detect bugs, code smells, performance bottlenecks, and security vulnerabilities as you type.
* Targeted AI Suggestions: Receive on-demand, context-aware fixes for specific issues only when you need them.
* Local-First Architecture: Most analysis happens on your hardware, ensuring maximum speed and keeping your code private.
* Code Quality Dashboard: Track health metrics and monitor issues through a dedicated visual interface.
* Zero-Friction Setup: Industry-standard tools like Biome, Ruff, and Semgrep are pre-bundled and ready to go.

---

## How It Works

CodeMore uses a multi-layered pipeline to provide immediate feedback while maintaining security.

### Layer 1: Local Analysis

When you open or save a file, CodeMore triggers high-performance local tools. No data leaves your machine during this process.

1. External Tools: We use optimized binaries for industry standards:
* Biome: High-speed linter and formatter for JavaScript and TypeScript.
* Ruff: Fast Python linting.
* Semgrep: Static analysis for security vulnerabilities across 30+ languages.
* TFLint and Checkov: Specialized analysis for Infrastructure-as-Code.


2. Built-in Static Analysis: Our custom engine inspects TypeScript ASTs to evaluate complexity and structural integrity.

Privacy Note: Layers 1 and 2 run entirely on your local machine.

### Layer 2: Targeted AI Analysis

AI is invoked only upon your direct request. This keeps costs low and ensures you remain in control of your data.

1. Trigger: Select an issue in the dashboard and choose Generate AI Fix.
2. Context Gathering: CodeMore collects relevant code snippets, imports, and dependencies to provide the AI with necessary background.
3. Processing: This specific context is sent to your configured AI provider, such as Gemini.
4. Resolution: The AI returns a tailored fix which you can review and apply.

Privacy Note: Your code is only sent to the AI provider when you explicitly request a fix.

---

## Privacy and Data Usage

We prioritize code privacy. Here is how your data is handled:

| Data Type | Handling | Location |
| --- | --- | --- |
| Source Code | Analyzed locally; sent to AI only during manual fix requests. | Local Machine |
| Analysis Results | Stored in memory or local workspace storage. | Local Machine |
| AI Prompts | Sent to your chosen provider via encrypted HTTPS. | External Provider |
| API Keys | Stored securely in the VS Code Secret Storage. | Local Machine |

We do not collect or store your source code on our servers.

---

## Getting Started

### Installation

1. Install the Extension: Find CodeMore in the VS Code Marketplace and click install.
2. Zero Setup: The extension works out of the box for JS/TS, Python, and other major languages.
3. Configure AI (Optional): To enable AI fixes, go to VS Code Settings, search for codemore.aiProvider to select your service, and add your API key under codemore.apiKey.

### Building from Source

For developers contributing to the project:

1. Clone the repository:
git clone [https://github.com/K0802s/codemore.git](https://github.com/K0802s/codemore.git)
cd codemore
2. Install dependencies:
npm install
3. Binaries:
For local development, the extension uses system-installed tools. To test the bundled experience, run:
npm run download-binaries
4. Build and Run:
npm run compile
Press F5 to launch the Extension Host.

---

## Architecture

CodeMore uses a daemon architecture to ensure the VS Code UI remains responsive during heavy tasks.

* Extension Host: Manages the UI, commands, and file system events.
* Context Daemon: A separate Node.js process that runs analysis tools and manages communication with AI services. This separation prevents the editor from freezing during intensive analysis.