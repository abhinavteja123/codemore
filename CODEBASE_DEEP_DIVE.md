# CodeMore Codebase Deep Dive Analysis

**Date:** 2026-03-22
**Analyst:** Claude Opus 4.6
**Files Analyzed:**
- `daemon/services/staticAnalyzer.ts` (2514 lines)
- `daemon/services/analysisQueue.ts` (304 lines)
- `web/src/lib/database.ts` (1051 lines)
- `web/src/app/project/[id]/page.tsx` (~900 lines)
- `shared/protocol.ts` (455 lines)

---

## Table of Contents

1. [Unused Variable Detection](#question-1-staticanalyzerts--unused-variable-detection)
2. [Async/Await Detection](#question-2-staticanalyzerts--asyncawait-detection)
3. [Overall Structure](#question-3-staticanalyzerts--overall-structure)
4. [Pipeline Orchestration](#question-4-analysisqueuets--pipeline-orchestration)
5. [N+1 Query Situation](#question-5-databasets--the-n1-situation)
6. [Empty Catch Blocks](#question-6-projectidpagetsx--user-experience-on-failure)
7. [IPC Contract](#question-7-sharedprotocolts--ipc-contract)
8. [Health Score Calculation](#question-8-health-score-calculation)
9. [False Positive Fix Assessment](#question-9-the-self-scan-false-positive-fix-assessment)
10. [Missing Feature Recommendation](#question-10-what-would-you-add)

---

## Question 1: staticAnalyzer.ts — Unused Variable Detection

### Exact Code Location

The unused variable detection is in `analyzeDeadCode()` at **lines 1003-1077**.

### How It Works (Lines 1008-1077)

```typescript
// Lines 1008-1010: Track declared and used identifiers
const declared = new Map<string, { node: ts.Node; used: boolean }>();
const used = new Set<string>();

// Lines 1013-1038: First pass - collect declarations
this.visitNodes(this.sourceFile, (node) => {
    // Variable declarations (line 1015)
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        ...
    }
    // Function declarations (line 1023)
    if (ts.isFunctionDeclaration(node) && node.name) {
        ...
    }
    // Parameters (line 1032)
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
        // Skip underscore-prefixed params (line 1035)
        if (!name.startsWith('_') && !declared.has(name)) {
            declared.set(name, { node: node.name, used: false });
        }
    }
});

// Lines 1041-1057: Second pass - collect usages
this.visitNodes(this.sourceFile, (node) => {
    if (ts.isIdentifier(node)) {
        // Skip if this is a declaration (lines 1046-1053)
        const parent = node.parent;
        if (parent && (
            (ts.isVariableDeclaration(parent) && parent.name === node) ||
            (ts.isFunctionDeclaration(parent) && parent.name === node) ||
            (ts.isParameter(parent) && parent.name === node) ||
            ...
        )) {
            return;
        }
        used.add(node.text);
    }
});

// Lines 1060-1077: Flag unused declarations
for (const [name, info] of Array.from(declared.entries())) {
    if (!used.has(name)) {
        issues.push(this.createIssue({
            id: `unused-${this.issueCounter++}`,
            title: `Unused variable '${name}'`,
            ...
        }));
    }
}
```

### Guards for Type Alias Parameters

**NO GUARDS EXIST.** There is:
- No check for `ts.isTypeAliasDeclaration`
- No check for `ts.isFunctionTypeNode`
- No check for `ts.isTypeParameterDeclaration`

The only guard is at **line 1035**:
```typescript
if (!name.startsWith('_') && !declared.has(name)) {
```

### Trigger Condition

**Line 1061:** `if (!used.has(name))` — if the identifier was declared but never appears in the `used` set, it's flagged.

### Type Checker vs AST

**Pure AST inspection.** The code uses `ts.isIdentifier()`, `ts.isParameter()`, etc. The TypeScript `checker` is **never used** in this function. It's purely syntactic pattern matching without semantic type analysis.

---

## Question 2: staticAnalyzer.ts — Async/Await Detection

### Exact Code Location

The "missing await" detection is in `analyzeAsyncPatterns()` at **lines 1656-1735**.

### Exact Lines Where It Flags Missing Await

```typescript
// Lines 1656-1735: Detect missing await on async calls
this.visitNodes(this.sourceFile, (node) => {
    if (ts.isCallExpression(node)) {
        // Lines 1661-1668: Get method name
        const expr = node.expression;
        let methodName = '';
        if (ts.isPropertyAccessExpression(expr)) {
            methodName = expr.name.text;
        } else if (ts.isIdentifier(expr)) {
            methodName = expr.text;
        }

        // Lines 1671-1673: High-confidence async patterns (name-based!)
        const highConfidenceAsync = ['fetch', 'axios', 'request'];
        const mediumConfidenceAsync = ['findOne', 'findAll', 'findById', ...];

        // Lines 1676-1682: Sync exclusions
        const syncExclusions = [
            'updateState', 'updateConfig', 'updateFile', ...
        ];

        // Lines 1691-1693: Check if method name looks async
        const isHighConfidence = highConfidenceAsync.some(p => lowerName.includes(p.toLowerCase()));
        const isMediumConfidence = mediumConfidenceAsync.some(p => lowerName.includes(p.toLowerCase()));
        const isLikelyAsync = isHighConfidence || isMediumConfidence;

        // Lines 1695-1732: Flag if async-looking but not awaited
        if (isLikelyAsync && parent && !ts.isAwaitExpression(parent) && !ts.isReturnStatement(parent)) {
            // ... check if in async context ...
            if (inAsyncContext) {
                issues.push(this.createIssue({
                    id: `async-missing-await-${this.issueCounter++}`,
                    title: `Possibly missing await on '${methodName}'`,
                    ...
                }));
            }
        }
    }
});
```

### Does It Use checker.getReturnTypeOfSignature() or checker.getTypeAtLocation()?

**NO.** It uses a **NAME-BASED HEURISTIC ONLY**.

The detection logic is:
1. Get the method name from the AST node (lines 1661-1668)
2. Check if the name matches patterns like `fetch`, `axios`, `findOne`, etc. (lines 1671-1693)
3. Check if the parent is NOT an `await` expression (line 1695)
4. Check if we're inside an async function (lines 1702-1714)

**There is NO type checking.** A sync function named `myFetch()` would be flagged. A promise-returning function named `getData()` would NOT be flagged.

### The Exact Trigger Condition (Line 1695)

```typescript
if (isLikelyAsync && parent && !ts.isAwaitExpression(parent) && !ts.isReturnStatement(parent))
```

---

## Question 3: staticAnalyzer.ts — Overall Structure

### Total Lines

**2514 lines** (the file ends at line 2514)

### Rules Implemented

| Rule ID Pattern | Category | Severity | Lines | Uses Checker? |
|-----------------|----------|----------|-------|---------------|
| `cyclomatic-*` | maintainability | MAJOR/CRITICAL | 798-811 | No |
| `cognitive-*` | maintainability | MAJOR | 814-830 | No |
| `nesting-*` | code-smell | MAJOR | 833-849 | No |
| `params-*` | code-smell | INFO | 852-868 | No |
| `func-length-*` | maintainability | MAJOR | 871-887 | No |
| `unused-*` | code-smell | MAJOR | 1063-1076 | No |
| `unreachable-*` | bug | MAJOR | 1092-1105 | No |
| `unused-import-*` | code-smell | INFO | 1162-1175 | No |
| `security-eval-*` | security | CRITICAL | 1200-1212 | No |
| `security-xss-*` | security | MAJOR | 1224-1237 | No |
| `security-secret-*` | security | CRITICAL | 1260-1273 | No |
| `security-sql-*` | security | CRITICAL | 1308-1321 | No |
| `security-func-*` | security | MAJOR | 1332-1345 | No |
| `ts-any-*` | best-practice | MAJOR | 1371-1384 | No |
| `ts-as-any-*` | best-practice | MAJOR | 1393-1406 | No |
| `ts-non-null-*` | best-practice | INFO | 1417-1430 | No |
| `ts-return-type-*` | best-practice | INFO | 1439-1452 | No |
| `ts-ignore-*` | best-practice | MAJOR | 1460-1473 | No |
| `perf-nested-loop-*` | performance | INFO | 1501-1514 | No |
| `perf-array-in-loop-*` | performance | INFO | 1530-1543 | No |
| `perf-string-concat-*` | performance | INFO | 1560-1573 | No |
| `perf-sync-*` | performance | INFO | 1598-1610 | No |
| `async-await-loop-*` | performance | INFO | 1637-1651 | No |
| `async-missing-await-*` | bug | MAJOR | 1719-1732 | No |
| `async-promise-executor-*` | bug | MAJOR | 1752-1765 | No |
| `async-then-catch-*` | maintainability | INFO | 1786-1798 | No |
| `async-floating-promise-*` | bug | MAJOR | 1839-1851 | No |
| `react-missing-key-*` | bug | MAJOR | 1902-1915 | No |
| `react-useeffect-deps-*` | bug | MAJOR | 1928-1941 | No |
| `react-usestate-init-*` | best-practice | INFO | 1953-1965 | No |
| `react-state-mutation-*` | bug | MAJOR | 1983-1995 | No |
| `react-inline-handler-*` | performance | INFO | 2011-2024 | No |
| `react-conditional-hook-*` | bug | CRITICAL | 2041-2053 | No |
| `style-long-line-*` | code-smell | INFO | 2090-2103 | No |
| `style-todo/fixme-*` | maintainability | MAJOR/MINOR | 2110-2123 | No |
| `style-console-*` | best-practice | MAJOR/INFO | 2145-2159 | No |
| `style-debugger-*` | best-practice | CRITICAL | 2177-2190 | No |
| `style-equality-*` | best-practice | MAJOR | 2195-2208 | No |
| `style-inequality-*` | best-practice | MAJOR | 2213-2226 | No |
| `style-empty-catch-*` | bug | MAJOR | 2238-2251 | No |
| `style-magic-number-*` | maintainability | INFO | 2313-2326 | No |
| `style-no-docs-*` | maintainability | INFO | 2337-2351 | No |
| SQL rules (6) | varies | varies | 297-435 | No |
| YAML rules (3) | varies | varies | 494-553 | No |
| Shell rules (4) | varies | varies | 560-639 | No |
| Dockerfile rules (4) | varies | varies | 645-723 | No |
| JSON rules (2) | varies | varies | 441-488 | No |

**Total: ~50+ unique rules**

**NONE of them use the TypeScript type checker.** All are pure AST/regex-based.

---

## Question 4: analysisQueue.ts — Pipeline Orchestration

### Reading analysisQueue.ts, the Three Layers

**The `AnalysisQueue` class does NOT directly implement the three-layer architecture.**

Looking at **line 208**:
```typescript
const issues = await this.suggestionEngine.analyzeFile(
    item.filePath,
    content,
    fileContext
);
```

The queue delegates to `SuggestionEngine.analyzeFile()`, which in turn calls `AiService.analyzeCode()`.

### The Actual Pipeline (in aiService.ts, lines 363-412)

```typescript
// Lines 385-397: Step 1 - External tools OR static analysis
if (analysisMode === 'both' || analysisMode === 'external') {
    externalIssues = await this.runExternalTools(filePath, content);  // LAYER 1
}
if (analysisMode === 'both' || analysisMode === 'internal') {
    staticIssues = this.performStaticAnalysis(filePath, content, context);  // LAYER 2
}

// Line 400: Step 2 - Merge
const combinedIssues = this.mergeIssues(externalIssues, staticIssues);

// Lines 404-406: IMPORTANT - AI is NEVER called automatically
// AI is only used when explicitly requested via generateAiFixForIssue()
```

### Sequential or Parallel?

**External tools (Layer 1) and static analysis (Layer 2) run SEQUENTIALLY** (lines 389-397 use sequential `await`).

### What If Layer 2 Fails?

Looking at `performStaticAnalysis()` — it has a try/catch and returns `[]` on error. **Layer 3 (AI) does NOT run automatically** — it's only invoked when the user clicks "Generate Fix" (see lines 404-406 comment).

### How Results Are Merged (Line 400)

```typescript
const combinedIssues = this.mergeIssues(externalIssues, staticIssues);
```

This deduplicates issues based on file path and line numbers.

### Where Is Health Score Calculated?

**contextMap.ts, lines 357-380:**
```typescript
// Lines 360-368: Health score formula
let overallScore = filesAnalyzed > 0 ? 100 : 0;

if (filesAnalyzed > 0) {
    overallScore -= issuesBySeverity.BLOCKER * 15;
    overallScore -= issuesBySeverity.CRITICAL * 10;
    overallScore -= issuesBySeverity.MAJOR * 5;
    overallScore -= issuesBySeverity.MINOR * 2;
    overallScore -= issuesBySeverity.INFO * 1;
    overallScore = Math.max(0, Math.min(100, overallScore));
}
```

---

## Question 5: database.ts — The N+1 Situation

### getUserProjectSnapshots (Lines 291-346)

```typescript
export async function getUserProjectSnapshots(userEmail: string): Promise<Project[]> {
  if (!isDbEnabled()) return [];

  // Lines 294-314: Single query with nested select to avoid N+1
  const { data: projects, error } = await supabase!
    .from("projects")
    .select(`
      *,
      scans (
        id,
        overall_score,
        files_analyzed,
        total_files,
        lines_of_code,
        avg_complexity,
        tech_debt_minutes,
        issues_by_severity,
        issues_by_category,
        issue_count,
        scanned_at
      )
    `)
    .eq("user_email", userEmail)
    .order("updated_at", { ascending: false });
```

### Was the N+1 Fix Applied?

**YES.** The comment at line 294 explicitly states: `"Single query with nested select to avoid N+1"`.

The query uses Supabase's nested select feature (`scans (...)`) which performs a single query with a JOIN, rather than `Promise.all()` with multiple queries.

**This is the fixed version.** No `Promise.all` is used here.

---

## Question 6: project/[id]/page.tsx — User Experience on Failure

### Empty Catch Blocks Identified

Based on grep results, the empty catch blocks are at lines **139, 163, 184, 226, 299, 457**.

| Line | Try Block Operation | Catch Block Content | User Experience | Error State Set? |
|------|---------------------|---------------------|-----------------|------------------|
| **139** | `JSON.parse(saved)` for AI settings | Empty (silent fail) | Uses default AI settings | No |
| **163** | `JSON.parse(saved)` for local project | `localProject = null` | Falls through to API fetch | No |
| **184** | `fetch('/api/projects/${projectId}')` | Comment: "fall back to local cache below" | Uses local cache silently | No |
| **226** | `fetch('/api/projects/${projectId}/scans')` for history | Comment: "DB not configured" | No scan history shown | No |
| **299** | `fetch()` for cached suggestions | Comment: "Ignore cache hydration failures" | Manual generation still works | No |
| **457** | `fetch(...DELETE)` for project deletion | Comment: "DB not available" | Project still deleted from localStorage | No |

### Summary

All 6 catch blocks are silent failures with no error state variables set. Users see:
- Default values (AI settings)
- Missing data (scan history, suggestions)
- No indication that a backend operation failed

---

## Question 7: shared/protocol.ts — IPC Contract

### Total Lines

**455 lines**

### Message Types Defined

#### Daemon → Extension Notifications (Lines 200-209)

```typescript
export interface DaemonNotifications {
    'daemon/ready': { version: string };
    'daemon/fileDiscovery': { totalFiles: number; fileTypes: Record<string, number> };
    'daemon/analysisProgress': { filePath: string; progress: number; total: number };
    'daemon/analysisComplete': { filePath: string; issues: CodeIssue[] };
    'daemon/analysisStopped': {};
    'daemon/issuesUpdated': { issues: CodeIssue[] };
    'daemon/metricsUpdated': { metrics: CodeHealthMetrics };
    'daemon/error': { message: string; details?: unknown };
}
```

#### Extension → Daemon Methods (Lines 212-285)

```typescript
export interface DaemonMethods {
    'initialize': { params: {...}; result: {...} };
    'shutdown': { params: {}; result: {...} };
    'analyzeFile': { params: {...}; result: {...} };
    // ... 14 more methods
}
```

#### Webview ↔ Extension Messages (Lines 365-399)

```typescript
export type WebviewToExtensionMessage =
    | { type: 'ready' }
    | { type: 'requestMetrics' }
    // ... 12 more message types

export type ExtensionToWebviewMessage =
    | { type: 'metricsUpdate'; metrics: CodeHealthMetrics }
    // ... 10 more message types
```

### Request/Response Pairing

**STRONGLY TYPED.** `DaemonMethods` (lines 212-285) defines both `params` and `result` types for each method:
```typescript
'analyzeFile': {
    params: { filePath: string; content?: string };
    result: { issues: CodeIssue[]; context: FileContext };
};
```

### Places Using `any` Type

**NONE.** The file uses `unknown` instead of `any`:
- Line 158: `params?: unknown;`
- Line 164: `result?: unknown;`
- Line 171: `params?: unknown;`
- Line 177: `data?: unknown;`
- Line 208: `details?: unknown;`

**Good practice!** `unknown` is type-safe unlike `any`.

### Protocol Versioning

**NO VERSION FIELD.** There's no `version` property in `JsonRpcRequest` or `JsonRpcResponse`. The only version mentioned is in `'daemon/ready': { version: string }` which is the daemon version, not protocol version.

---

## Question 8: Health Score Calculation

### Exact Location

**contextMap.ts, lines 357-380** (daemon) and **productionAnalyzer.ts, lines 106-114** (web)

### The Exact Formula

```typescript
// Start at 100 (perfect score), deduct for issues
let overallScore = filesAnalyzed > 0 ? 100 : 0;

if (filesAnalyzed > 0) {
    overallScore -= issuesBySeverity.BLOCKER * 15;    // -15 per BLOCKER
    overallScore -= issuesBySeverity.CRITICAL * 10;   // -10 per CRITICAL
    overallScore -= issuesBySeverity.MAJOR * 5;       // -5 per MAJOR
    overallScore -= issuesBySeverity.MINOR * 2;       // -2 per MINOR
    overallScore -= issuesBySeverity.INFO * 1;        // -1 per INFO
    overallScore = Math.max(0, Math.min(100, overallScore));  // Clamp to 0-100
}
```

### What Inputs Go In

- `issuesBySeverity.BLOCKER` (count)
- `issuesBySeverity.CRITICAL` (count)
- `issuesBySeverity.MAJOR` (count)
- `issuesBySeverity.MINOR` (count)
- `issuesBySeverity.INFO` (count)

### What 0 vs 100 Means

- **100** = No issues found (or no files analyzed)
- **0** = Many issues (e.g., 7 BLOCKERs or 10 CRITICALs or 20 MAJORs)

### Documentation

**NOT DOCUMENTED.** There's no JSDoc comment explaining the formula. The weights (15, 10, 5, 2, 1) are magic numbers.

---

## Question 9: The Self-Scan False Positive Fix Assessment

### Bug 1: Type Alias Parameters Flagged as Unused Variables

#### Root Cause

In `analyzeDeadCode()` (lines 1003-1077), when collecting declarations at lines 1032-1038:

```typescript
// Line 1032: Parameters
if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
    const name = node.name.text;
    if (!name.startsWith('_') && !declared.has(name)) {
        declared.set(name, { node: node.name, used: false });
    }
}
```

**Problem:** It collects ALL parameters, including those in `type` declarations like:
```typescript
type FetchFunction = (url: string, options: RequestInit) => Promise<Response>;
```

The parameters `url` and `options` are type annotations, not runtime variables.

#### Lines That Need Changing

**Lines 1032-1038** in `staticAnalyzer.ts`

#### Minimal Diff to Fix

```diff
// Line 1032
- if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
+ if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
+     // Skip parameters in type aliases, function types, and type parameter declarations
+     let parent: ts.Node | undefined = node.parent;
+     while (parent) {
+         if (ts.isTypeAliasDeclaration(parent) ||
+             ts.isFunctionTypeNode(parent) ||
+             ts.isTypeParameterDeclaration(parent) ||
+             ts.isInterfaceDeclaration(parent) ||
+             ts.isCallSignatureDeclaration(parent) ||
+             ts.isMethodSignature(parent)) {
+             return; // Skip - this is a type parameter, not a runtime parameter
+         }
+         parent = parent.parent;
+     }
+
      const name = node.name.text;
```

#### Other Places Calling This Detection

Only `analyzeDeadCode()` performs unused variable detection. It's called from:
- `analyzeTypeScriptFile()` line 263: `issues.push(...this.analyzeDeadCode(context));`

---

### Bug 2: Sync Functions Flagged as Missing Await

#### Root Cause

In `analyzeAsyncPatterns()` (lines 1656-1735), the detection uses **name-based heuristics**:

```typescript
// Lines 1671-1673
const highConfidenceAsync = ['fetch', 'axios', 'request'];
const mediumConfidenceAsync = ['findOne', 'findAll', 'findById', 'findMany', ...];
```

**Problem:** A sync function like `updateFile()` containing `update` in its name would be flagged even though it doesn't return a Promise.

#### Lines That Need Changing

**Lines 1656-1735** in `staticAnalyzer.ts`

#### Option A: Reduce False Positives (Minimal Change)

```diff
// Around line 1676
  const syncExclusions = [
      'updateState', 'updateConfig', 'updateFile', 'updateUI', 'updateView',
      'updateCache', 'updateLocal', 'updateCounter', 'updateIndex',
+     'analyzeCode', 'analyzeFile', 'performStaticAnalysis',  // Add CodeMore's own methods
+     'createIssue', 'createLogger', 'extractContext',
      'saveLocal', 'saveToCache', 'saveState',
```

#### Option B: Use TypeScript Type Checker (Proper Fix)

This would require creating a TypeChecker in `StaticAnalyzer` and using:

```typescript
const signature = checker.getResolvedSignature(node);
const returnType = checker.getReturnTypeOfSignature(signature);
const isPromise = returnType.symbol?.name === 'Promise' ||
                  checker.typeToString(returnType).startsWith('Promise<');
```

This is a significant architectural change requiring:
1. Creating a TypeScript Program object
2. Passing the checker to `analyzeAsyncPatterns()`
3. ~50 lines of new code

#### Other Places Calling This Detection

`analyzeAsyncPatterns()` is called from:
- `analyzePerformancePatterns()` line 1617: `issues.push(...this.analyzeAsyncPatterns());`

---

## Question 10: What Would You Add

### The Gap: No Historical Trend Analysis / Regression Detection

#### What's Missing

CodeMore scans your code and tells you "you have 15 issues." But it doesn't answer:
- "Did this PR introduce new bugs?"
- "Is code health improving or declining over time?"
- "Which files are getting worse vs better?"

The `health_history` table exists (database.ts lines 951-1050), but there's **no UI to visualize trends** and **no CI integration to fail PRs that regress**.

#### What It Would Look Like

##### 1. Trend Graph on Project Page
- Line chart showing health score over last 30 scans
- Red/green indicators for improving/worsening files

##### 2. GitHub Action Integration
```yaml
- uses: codemore/scan@v1
  with:
    fail-on-regression: true
    baseline: main
```

##### 3. PR Comment Bot
```
CodeMore found 3 NEW issues introduced in this PR:
- [CRITICAL] SQL injection in src/api/users.ts:45
- [MAJOR] Unused variable 'config' in src/lib/auth.ts:23

Health impact: 85 → 78 (-7 points)
```

#### Why It Matters

Without regression detection, CodeMore is a "one-time scan" tool. Developers run it once, fix issues, then forget about it. **Regression detection makes it a continuous quality gate** — the difference between a linter and a quality platform.

The database infrastructure exists (`health_history` table, `recordHealthSnapshot()`, `getHealthHistory()`). The missing piece is:
1. A `/api/compare` endpoint that compares two scans
2. A GitHub PR webhook handler
3. A trend visualization component

---

## Summary Table

| Question | Key Finding | Action Required |
|----------|-------------|-----------------|
| Q1 | Unused var detection uses pure AST, no type guards | Add `ts.isTypeAliasDeclaration` check |
| Q2 | Missing await uses name heuristics, not types | Add exclusions or use type checker |
| Q3 | 50+ rules, 2514 lines, all AST-based | Consider adding type checker for accuracy |
| Q4 | 2-layer pipeline (external + static), AI on-demand | Architecture is correct |
| Q5 | N+1 fix applied, uses nested Supabase select | No action needed |
| Q6 | 6 empty catch blocks, silent failures | Add error states and user feedback |
| Q7 | Protocol well-typed, uses `unknown` not `any` | Add protocol version field |
| Q8 | Health = 100 - (15×BLOCKER + 10×CRITICAL + ...) | Document the formula |
| Q9 | Two false positive bugs identified | Fix both with diffs provided |
| Q10 | Missing trend/regression detection | Build CI integration |
