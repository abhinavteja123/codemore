import {
  CodeIssue,
  CodeHealthMetrics,
  Severity,
  IssueCategory,
  ProjectFile,
} from "./types";

// ============================================================================
// Language Detection
// ============================================================================

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    java: "java",
    cs: "csharp",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
  };
  return langMap[ext] || ext || "unknown";
}

function getFileContext(filePath: string): "production-web" | "daemon-service" | "build-script" | "general" {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();

  if (normalized.includes("/web/src/") || normalized.includes("/src/app/") || normalized.includes("/src/components/")) {
    return "production-web";
  }

  if (normalized.includes("/daemon/") || normalized.includes("/services/")) {
    return "daemon-service";
  }

  if (normalized.includes("/scripts/") || normalized.endsWith(".config.js") || normalized.includes("/webpack")) {
    return "build-script";
  }

  return "general";
}

function createIssue(
  filePath: string,
  title: string,
  description: string,
  category: IssueCategory,
  severity: Severity,
  line: number,
  column: number,
  codeSnippet: string,
  confidence: number,
  impact: number,
  id: string
): CodeIssue {
  return {
    id,
    title,
    description,
    category,
    severity,
    location: {
      filePath,
      range: {
        start: { line, column },
        end: { line, column: column + Math.max(codeSnippet.length, 1) },
      },
    },
    codeSnippet,
    confidence,
    impact,
    createdAt: Date.now(),
  };
}

// ============================================================================
// Static Analysis Rules
// ============================================================================

interface AnalysisRule {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  severity: Severity;
  pattern: RegExp;
  languages?: string[];
  confidence: number;
  impact: number;
}

const analysisRules: AnalysisRule[] = [
  // Security
  {
    id: "sec-eval",
    title: "Use of eval()",
    description:
      "eval() executes arbitrary code and is a security vulnerability. Use safer alternatives like JSON.parse() or Function constructor with proper sandboxing.",
    category: "security",
    severity: "CRITICAL",
    pattern: /\beval\s*\(/g,
    languages: ["javascript", "typescript"],
    confidence: 95,
    impact: 90,
  },
  {
    id: "sec-innerhtml",
    title: "Unsafe innerHTML assignment",
    description:
      "Direct innerHTML assignment can lead to XSS attacks. Use textContent, or sanitize input with DOMPurify.",
    category: "security",
    severity: "MAJOR",
    pattern: /\.innerHTML\s*=/g,
    languages: ["javascript", "typescript"],
    confidence: 85,
    impact: 80,
  },
  {
    id: "sec-hardcoded-secret",
    title: "Possible hardcoded secret",
    description:
      "Hardcoded credentials or API keys detected. Move secrets to environment variables or a secret manager.",
    category: "security",
    severity: "BLOCKER",
    pattern:
      /(?:password|secret|api_key|apikey|token|auth)\s*[:=]\s*['"][^'"\n]{8,64}['"]/gi,
    confidence: 75,
    impact: 95,
  },
  {
    id: "sec-sql-injection",
    title: "Potential SQL injection",
    description:
      "String concatenation in SQL queries can lead to SQL injection. Use parameterized queries instead.",
    category: "security",
    severity: "BLOCKER",
    pattern:
      /(?:query|execute|exec)\s*\(\s*['"`][^'"`]{0,200}\$\{|(?:query|execute|exec)\s*\(\s*['"`][^'"`]{0,200}\+/g,
    languages: ["javascript", "typescript", "python"],
    confidence: 70,
    impact: 95,
  },

  // Performance
  {
    id: "perf-console-log",
    title: "Console.log in production code",
    description:
      "console.log statements should be removed from production code. Use a proper logging library with log levels.",
    category: "performance",
    severity: "MINOR",
    pattern: /\bconsole\.(log|debug|info)\s*\(/g,
    languages: ["javascript", "typescript"],
    confidence: 90,
    impact: 30,
  },
  {
    id: "perf-nested-loop",
    title: "Deeply nested loops (O(n^3+) complexity)",
    description:
      "Three or more nested loops result in cubic or worse time complexity. Consider refactoring with hash maps or different algorithms.",
    category: "performance",
    severity: "MAJOR",
    pattern:
      /for\s*\(.*?\)\s*\{[\s\S]{0,500}for\s*\(.*?\)\s*\{[\s\S]{0,500}for\s*\(.*?\)\s*\{/g,
    confidence: 80,
    impact: 75,
  },
  {
    id: "perf-sync-fs",
    title: "Synchronous file system operation",
    description:
      "Synchronous fs operations block the event loop. Use async alternatives (fs.promises) instead.",
    category: "performance",
    severity: "MAJOR",
    pattern: /\bfs\.(readFileSync|writeFileSync|mkdirSync|readdirSync)\b/g,
    languages: ["javascript", "typescript"],
    confidence: 90,
    impact: 70,
  },

  // Bug
  {
    id: "bug-loose-equality",
    title: "Use of loose equality (== or !=)",
    description:
      "Loose equality can lead to unexpected type coercion. Use strict equality (=== or !==) instead.",
    category: "bug",
    severity: "MINOR",
    pattern: /[^=!<>]==[^=]|[^!]=!=[^=]/g,
    languages: ["javascript", "typescript"],
    confidence: 85,
    impact: 40,
  },
  {
    id: "bug-missing-await",
    title: "Possible missing await",
    description:
      "An async function call appears without await, which may lead to unhandled promise or race conditions.",
    category: "bug",
    severity: "MAJOR",
    pattern: /(?:^|;|\{)\s*(?!return|await|const|let|var|if|for|while)\w+\.\w+\([^)]*\)\s*;/gm,
    languages: ["javascript", "typescript"],
    confidence: 30,
    impact: 60,
  },

  // Code Smell
  {
    id: "smell-todo",
    title: "TODO/FIXME/HACK comment found",
    description:
      "Unresolved TODO, FIXME, or HACK comment indicates incomplete or temporary code that needs attention.",
    category: "code-smell",
    severity: "INFO",
    pattern: /\/\/\s*(TODO|FIXME|HACK|XXX|TEMP)\b/gi,
    confidence: 95,
    impact: 20,
  },
  {
    id: "smell-magic-number",
    title: "Magic number in code",
    description:
      "Unnamed numeric constants make code harder to understand. Extract to named constants.",
    category: "code-smell",
    severity: "MINOR",
    pattern: /(?<![.\w])(?:return|===?|!==?|[<>]=?|[+\-*/]=?)\s*(?:(?!0\b|1\b|2\b|-1\b)\d{3,}|\d+\.\d+(?!px|em|rem|%))/g,
    confidence: 60,
    impact: 30,
  },
  {
    id: "smell-long-function",
    title: "Function exceeds 50 lines",
    description:
      "Long functions are harder to understand, test, and maintain. Consider breaking into smaller, focused functions.",
    category: "maintainability",
    severity: "MAJOR",
    pattern: /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/g,
    confidence: 70,
    impact: 50,
  },

  // Best Practice
  {
    id: "bp-any-type",
    title: "Use of 'any' type",
    description:
      "The 'any' type defeats TypeScript's type system. Use specific types, 'unknown', or generics instead.",
    category: "best-practice",
    severity: "MINOR",
    pattern: /:\s*any\b(?!\w)/g,
    languages: ["typescript"],
    confidence: 90,
    impact: 40,
  },
  {
    id: "bp-var-declaration",
    title: "Use of 'var' declaration",
    description:
      "'var' has function-scoped hoisting that leads to bugs. Use 'const' or 'let' with block scoping instead.",
    category: "best-practice",
    severity: "MINOR",
    pattern: /\bvar\s+\w/g,
    languages: ["javascript", "typescript"],
    confidence: 95,
    impact: 35,
  },
  {
    id: "bp-empty-catch",
    title: "Empty catch block",
    description:
      "Empty catch blocks silently swallow errors. At minimum, log the error or add a comment explaining why it's ignored.",
    category: "bug",
    severity: "MAJOR",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    confidence: 90,
    impact: 65,
  },

  // Python-specific
  {
    id: "py-bare-except",
    title: "Bare except clause",
    description:
      "Bare 'except:' catches all exceptions including SystemExit and KeyboardInterrupt. Use 'except Exception:' instead.",
    category: "bug",
    severity: "MAJOR",
    pattern: /\bexcept\s*:/g,
    languages: ["python"],
    confidence: 90,
    impact: 60,
  },
  {
    id: "py-mutable-default",
    title: "Mutable default argument",
    description:
      "Mutable default arguments (list, dict) are shared across calls. Use None as default and create inside the function.",
    category: "bug",
    severity: "MAJOR",
    pattern: /def\s+\w+\([^)]*(?:=\s*\[\]|=\s*\{\}|=\s*set\(\))/g,
    languages: ["python"],
    confidence: 85,
    impact: 70,
  },
];

const CUSTOM_RULE_IDS = new Set([
  "sec-sql-injection",
  "perf-console-log",
  "perf-sync-fs",
  "smell-magic-number",
]);

function analyzeSqlInjectionRisks(file: ProjectFile, language: string): CodeIssue[] {
  if (!["javascript", "typescript", "python"].includes(language)) {
    return [];
  }

  const issues: CodeIssue[] = [];
  const lines = file.content.split("\n");
  const sqlMethodPattern =
    /\b(?:db\.)?(?:query|execute|executequery|executeraw|rawquery|createnativequery)\s*\(\s*([`'"])/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!sqlMethodPattern.test(line)) {
      continue;
    }
    if (!/(select|insert|update|delete|from|where)\b/i.test(line)) {
      continue;
    }
    if (!/(\$\{|["'`]\s*\+|\+\s*["'`])/.test(line)) {
      continue;
    }

    issues.push(
      createIssue(
        file.path,
        "Potential SQL injection",
        "String interpolation in SQL queries can lead to SQL injection. Use parameterized queries instead.",
        "security",
        "CRITICAL",
        i,
        0,
        line.trim(),
        80,
        95,
        `sec-sql-injection-${i}`
      )
    );
  }

  return issues;
}

function analyzeConsoleStatements(file: ProjectFile, language: string): CodeIssue[] {
  if (!["javascript", "typescript"].includes(language)) {
    return [];
  }

  const issues: CodeIssue[] = [];
  const lines = file.content.split("\n");
  const context = getFileContext(file.path);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/\bconsole\.(log|debug|info|warn|error)\s*\(/);
    if (!match) {
      continue;
    }

    if (match[1] === "error" && context !== "production-web") {
      continue;
    }

    const severity: Severity = context === "production-web" ? "MINOR" : "INFO";
    issues.push(
      createIssue(
        file.path,
        "Console.log in production code",
        context === "production-web"
          ? "Console statements should be removed from production code. Use a proper logging library with log levels."
          : "Console statements are acceptable in tooling code, but a structured logger is usually preferable.",
        "performance",
        severity,
        i,
        0,
        line.trim(),
        context === "production-web" ? 90 : 70,
        context === "production-web" ? 30 : 10,
        `perf-console-log-${i}`
      )
    );
  }

  return issues;
}

function analyzeSyncFsUsage(file: ProjectFile, language: string): CodeIssue[] {
  if (!["javascript", "typescript"].includes(language)) {
    return [];
  }

  const context = getFileContext(file.path);
  if (context === "daemon-service" || context === "build-script") {
    return [];
  }

  const issues: CodeIssue[] = [];
  const lines = file.content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/\bfs\.(readFileSync|writeFileSync|statSync|readdirSync|existsSync)\b/);
    if (!match) {
      continue;
    }

    issues.push(
      createIssue(
        file.path,
        "Synchronous file system operation",
        "Synchronous fs operations block the event loop. Prefer async alternatives in request/response or UI-facing code.",
        "performance",
        "INFO",
        i,
        0,
        line.trim(),
        75,
        35,
        `perf-sync-fs-${i}`
      )
    );
  }

  return issues;
}

function analyzeMagicNumbers(file: ProjectFile, language: string): CodeIssue[] {
  if (!["javascript", "typescript", "python", "java", "csharp", "go"].includes(language)) {
    return [];
  }

  const issues: CodeIssue[] = [];
  const lines = file.content.split("\n");
  const occurrenceMap = new Map<string, number>();
  const lineValues = new Map<number, string[]>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(const|let|var|enum|interface|type)\b/.test(line)) {
      continue;
    }
    if (/(timeout|max|min|limit|threshold|port|size|width|height|delay|interval|confidence|impact)/i.test(line)) {
      continue;
    }

    const matches = Array.from(line.matchAll(/(?<![\w.])(-?\d{3,}|\d+\.\d+)(?![\w.])/g))
      .map((match) => match[1])
      .filter((value) => !["-1", "0", "1", "2", "100"].includes(value));

    if (matches.length === 0) {
      continue;
    }

    lineValues.set(i, matches);
    for (const value of matches) {
      occurrenceMap.set(value, (occurrenceMap.get(value) || 0) + 1);
    }
  }

  for (const [line, values] of Array.from(lineValues)) {
    const repeatedValue = values.find((value) => (occurrenceMap.get(value) || 0) >= 2);
    if (!repeatedValue) {
      continue;
    }

    issues.push(
      createIssue(
        file.path,
        "Magic number in code",
        "Repeated numeric literals can make logic harder to understand. Consider extracting the value to a named constant.",
        "code-smell",
        "INFO",
        line,
        0,
        lines[line].trim(),
        55,
        20,
        `smell-magic-number-${line}`
      )
    );
  }

  return issues;
}

// ============================================================================
// Function Length Analysis
// ============================================================================

function analyzeFunctionLengths(
  content: string,
  filePath: string,
  language: string
): CodeIssue[] {
  const issues: CodeIssue[] = [];
  const lines = content.split("\n");

  if (!["javascript", "typescript"].includes(language)) return issues;

  // Track brace depth to find function boundaries
  let braceDepth = 0;
  const funcStack: Array<{ name: string; line: number; depth: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect function declarations
    const funcMatch = line.match(
      /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/
    );
    if (funcMatch) {
      const name = funcMatch[1] || funcMatch[2] || "anonymous";
      funcStack.push({ name, line: i, depth: braceDepth });
    }

    // Count braces
    for (const char of line) {
      if (char === "{") braceDepth++;
      if (char === "}") {
        braceDepth--;
        // Check if a tracked function is closing
        if (
          funcStack.length > 0 &&
          braceDepth === funcStack[funcStack.length - 1].depth
        ) {
          const func = funcStack.pop()!;
          const length = i - func.line;
          if (length > 50) {
            issues.push({
              id: `long-func-${func.line}`,
              title: `Function '${func.name}' is ${length} lines long`,
              description: `This function exceeds 50 lines (currently ${length}). Long functions are harder to understand and test. Consider extracting logical blocks into separate functions.`,
              category: "maintainability",
              severity: length > 100 ? "CRITICAL" : "MAJOR",
              location: {
                filePath,
                range: {
                  start: { line: func.line, column: 0 },
                  end: { line: i, column: lines[i].length },
                },
              },
              codeSnippet: lines
                .slice(func.line, Math.min(func.line + 3, lines.length))
                .join("\n"),
              confidence: 85,
              impact: length > 100 ? 75 : 50,
              createdAt: Date.now(),
            });
          }
        }
      }
    }
  }

  return issues;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export function analyzeFile(file: ProjectFile): CodeIssue[] {
  // Skip files too large for regex analysis
  if (file.content.length > 200 * 1024) {
    return [{
      id: "skip-large-file-0",
      title: "File too large for analysis",
      description: `This file (${Math.round(file.content.length / 1024)}KB) exceeds the 200KB limit. Split into smaller modules for analysis.`,
      category: "maintainability" as IssueCategory,
      severity: "INFO" as Severity,
      location: { filePath: file.path, range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
      codeSnippet: "",
      confidence: 100,
      impact: 20,
      createdAt: Date.now(),
    }];
  }

  const issues: CodeIssue[] = [];
  const language = detectLanguage(file.path);
  const lines = file.content.split("\n");

  // Apply pattern-based rules
  for (const rule of analysisRules) {
    if (CUSTOM_RULE_IDS.has(rule.id)) continue;
    // Skip rules not applicable to this language
    if (rule.languages && !rule.languages.includes(language)) continue;

    // Reset regex state
    rule.pattern.lastIndex = 0;

    let match;
    let matchCount = 0;
    while ((match = rule.pattern.exec(file.content)) !== null) {
      if (++matchCount > 1000) break; // prevent runaway regex
      // Calculate line number from character offset
      const beforeMatch = file.content.slice(0, match.index);
      const lineNumber = beforeMatch.split("\n").length - 1;
      const lineContent = lines[lineNumber] || "";
      const column = match.index - beforeMatch.lastIndexOf("\n") - 1;

      issues.push({
        id: `${rule.id}-${lineNumber}`,
        title: rule.title,
        description: rule.description,
        category: rule.category,
        severity: rule.severity,
        location: {
          filePath: file.path,
          range: {
            start: { line: lineNumber, column: Math.max(0, column) },
            end: {
              line: lineNumber,
              column: Math.max(0, column) + match[0].length,
            },
          },
        },
        codeSnippet: lineContent.trim(),
        confidence: rule.confidence,
        impact: rule.impact,
        createdAt: Date.now(),
      });
    }
  }

  issues.push(...analyzeSqlInjectionRisks(file, language));
  issues.push(...analyzeConsoleStatements(file, language));
  issues.push(...analyzeSyncFsUsage(file, language));
  issues.push(...analyzeMagicNumbers(file, language));

  // Analyze function lengths
  issues.push(...analyzeFunctionLengths(file.content, file.path, language));

  // Sort by severity
  const severityOrder: Record<Severity, number> = {
    BLOCKER: 0,
    CRITICAL: 1,
    MAJOR: 2,
    MINOR: 3,
    INFO: 4,
  };
  issues.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return issues;
}

// ============================================================================
// Analyze Full Project
// ============================================================================

export function analyzeProject(files: ProjectFile[]): {
  issues: CodeIssue[];
  metrics: CodeHealthMetrics;
} {
  const allIssues: CodeIssue[] = [];

  for (const file of files) {
    const fileIssues = analyzeFile(file);
    allIssues.push(...fileIssues);
  }

  // Calculate metrics
  const issuesByCategory: Record<IssueCategory, number> = {
    bug: 0,
    "code-smell": 0,
    performance: 0,
    security: 0,
    maintainability: 0,
    accessibility: 0,
    "best-practice": 0,
  };

  const issuesBySeverity: Record<Severity, number> = {
    BLOCKER: 0,
    CRITICAL: 0,
    MAJOR: 0,
    MINOR: 0,
    INFO: 0,
  };

  for (const issue of allIssues) {
    issuesByCategory[issue.category]++;
    issuesBySeverity[issue.severity]++;
  }

  const totalLines = files.reduce(
    (acc, f) => acc + f.content.split("\n").length,
    0
  );

  // Calculate health score
  let overallScore = 100;
  overallScore -= issuesBySeverity.BLOCKER * 15;
  overallScore -= issuesBySeverity.CRITICAL * 10;
  overallScore -= issuesBySeverity.MAJOR * 5;
  overallScore -= issuesBySeverity.MINOR * 2;
  overallScore -= issuesBySeverity.INFO * 1;
  overallScore = Math.max(0, Math.min(100, overallScore));

  const technicalDebtMinutes =
    issuesBySeverity.BLOCKER * 120 +
    issuesBySeverity.CRITICAL * 60 +
    issuesBySeverity.MAJOR * 30 +
    issuesBySeverity.MINOR * 10 +
    issuesBySeverity.INFO * 5;

  const metrics: CodeHealthMetrics = {
    overallScore,
    issuesByCategory,
    issuesBySeverity,
    filesAnalyzed: files.length,
    totalFiles: files.length,
    linesOfCode: totalLines,
    averageComplexity: allIssues.length > 0 ? allIssues.length / files.length : 0,
    technicalDebtMinutes,
  };

  return { issues: allIssues, metrics };
}
