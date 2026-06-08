/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console, core-typescript-as-any, core-quality-async-without-await, core-bugs-todo-fixme, core-typescript-non-null-assertion-abuse, core-bugs-loose-equality */
/* Test file — pragmatic shimming + console output during test runs are
   intentional. The test-path heuristic already downgrades severity to
   MINOR/INFO; this directive removes the noise from CI summaries. */

import { strict as assert } from "assert";
import { StaticAnalyzer } from "../daemon/services/staticAnalyzer";
import { FileContext } from "../shared/protocol";
import { analyzeFile as analyzeWebFile } from "../web/src/lib/analyzer";
import {
  shouldIgnoreFile,
  getFileAnalyzerOverride,
  DEFAULT_CONFIG,
  CodemoreConfig,
} from "../daemon/services/configLoader";

function createContext(filePath: string, language: string): FileContext {
  return {
    filePath,
    language,
    size: 0,
    lastModified: Date.now(),
    lastAnalyzed: Date.now(),
    symbols: [],
    imports: [],
    exports: [],
    dependencies: [],
    issues: [],
  };
}

describe("analyzer regressions", () => {
  it("does not flag ON DELETE CASCADE as DELETE without WHERE", () => {
    const analyzer = new StaticAnalyzer();
    const content = [
      "create table scans (",
      "  id uuid primary key,",
      "  project_id uuid not null references projects(id) on delete cascade,",
      ");",
    ].join("\n");

    const issues = analyzer.analyze(
      "schema.sql",
      content,
      createContext("schema.sql", "sql")
    );

    assert.equal(
      issues.some((issue) => issue.id.includes("sql-delete-no-where")),
      false
    );
  });

  it("does not flag shell execAsync commands as SQL injection", () => {
    const analyzer = new StaticAnalyzer();
    const content = 'await execAsync(`unzip -o "${archivePath}" -d "${destDir}"`);';

    const issues = analyzer.analyze(
      "scripts/download-binaries.js",
      content,
      createContext("scripts/download-binaries.js", "javascript")
    );

    assert.equal(
      issues.some((issue) => issue.title === "Potential SQL injection risk"),
      false
    );
  });

  it("does not flag debugger inside strings as a debugger statement", () => {
    const analyzer = new StaticAnalyzer();
    const content = 'const ruleId = `style-debugger-${counter}`;';

    const issues = analyzer.analyze(
      "daemon/services/staticAnalyzer.ts",
      content,
      createContext("daemon/services/staticAnalyzer.ts", "typescript")
    );

    assert.equal(
      issues.some((issue) => issue.title === "Debugger statement"),
      false
    );
  });

  it("web analyzer does not flag execAsync shell commands as SQL injection", () => {
    const issues = analyzeWebFile({
      path: "scripts/download-binaries.js",
      content: 'await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`);',
      language: "js",
      size: 64,
    });

    assert.equal(
      issues.some((issue) => issue.title === "Potential SQL injection"),
      false
    );
  });

  it("does not apply TypeScript equality rules to Python files", () => {
    const analyzer = new StaticAnalyzer();
    // Python ORM equality (SQLAlchemy): Model.col == value is a WHERE clause, not a JS == comparison
    const content = [
      "from sqlalchemy.orm import Session",
      "from app.models import User",
      "",
      "def get_user(db: Session, user_id: int):",
      "    return db.query(User).filter(User.id == user_id).first()",
    ].join("\n");

    const issues = analyzer.analyze(
      "backend/app/services/user_service.py",
      content,
      createContext("backend/app/services/user_service.py", "python")
    );

    assert.equal(
      issues.some((issue) => issue.title === "Use strict equality"),
      false,
      "Python ORM equality should not be flagged as JS == comparison"
    );
  });

  it("does not apply TypeScript equality rules to Ruby, Go, Java, or Rust files", () => {
    const analyzer = new StaticAnalyzer();
    const cases: [string, string][] = [
      ["models/user.rb", "if user.role == 'admin'\n  true\nend"],
      ["main.go", "if err == nil {\n  return nil\n}"],
      ["User.java", "if (user.getRole() == Role.ADMIN) {\n  return true;\n}"],
      ["main.rs", "if result == Ok(()) {\n  println!(\"ok\");\n}"],
    ];

    for (const [filePath, content] of cases) {
      const issues = analyzer.analyze(
        filePath,
        content,
        createContext(filePath, "unknown")
      );
      assert.equal(
        issues.some((issue) => issue.title === "Use strict equality"),
        false,
        `${filePath} should not be flagged for JS equality rule`
      );
    }
  });

  it("does not flag == inside regex literals as a style violation", () => {
    const analyzer = new StaticAnalyzer();
    // This is the actual pattern from staticAnalyzer.ts itself — a self-scan regression
    const content = `
      if (/[^=!<>]==[^=]/.test(line) && !/['"\`]/.test(line.split('==')[0].slice(-5))) {
        // flag equality
      }
    `;

    const issues = analyzer.analyze(
      "daemon/services/staticAnalyzer.ts",
      content,
      createContext("daemon/services/staticAnalyzer.ts", "typescript")
    );

    assert.equal(
      issues.some((issue) => issue.title === "Use strict equality"),
      false,
      "== inside a regex literal should not be flagged"
    );
  });

  it("respects maxFunctionLength config override", () => {
    const analyzer = new StaticAnalyzer({ maxFunctionLength: 80 });
    // A 65-line function — below 80 threshold, above default 50
    const bodyLines = Array.from({ length: 65 }, (_, i) => `  const x${i} = ${i};`).join("\n");
    const content = `function longButAcceptable() {\n${bodyLines}\n}`;

    const issues = analyzer.analyze(
      "src/utils.ts",
      content,
      createContext("src/utils.ts", "typescript")
    );

    assert.equal(
      issues.some((issue) => issue.title?.includes("lines long")),
      false,
      "65-line function should not be flagged when maxFunctionLength is 80"
    );
  });

  it("does not flag == inside a comment line", () => {
    const analyzer = new StaticAnalyzer();
    const content = `
      // == instead of ===
      // != instead of !==
      // Use === for strict equality == comparisons
    `;
    const issues = analyzer.analyze(
      "src/utils.ts",
      content,
      createContext("src/utils.ts", "typescript")
    );
    assert.equal(
      issues.some((i) => i.title === "Use strict equality" || i.title === "Use strict inequality"),
      false,
      "== or != inside comment lines should not be flagged"
    );
  });

  it("does not flag == inside a long string literal", () => {
    const analyzer = new StaticAnalyzer();
    // == is 24+ chars from the opening quote — old 5-char check would miss this
    const content = `const msg = "Use of loose equality (== or !=) is bad";`;
    const issues = analyzer.analyze(
      "src/rules.ts",
      content,
      createContext("src/rules.ts", "typescript")
    );
    assert.equal(
      issues.some((i) => i.title === "Use strict equality"),
      false,
      "== inside a string literal should not be flagged regardless of distance from quote"
    );
  });

  it("does not flag != inside a regex literal as inequality violation", () => {
    const analyzer = new StaticAnalyzer();
    const content = `if (/[^!]!=[^=]/.test(line) || /!=[^=]/.test(line)) { check(); }`;
    const issues = analyzer.analyze(
      "daemon/services/staticAnalyzer.ts",
      content,
      createContext("daemon/services/staticAnalyzer.ts", "typescript")
    );
    assert.equal(
      issues.some((i) => i.title === "Use strict inequality"),
      false,
      "!= inside a regex literal should not be flagged"
    );
  });

  it("getFileContext returns daemon-service for relative paths without leading slash", () => {
    const analyzer = new StaticAnalyzer();
    // Simulate web scan path: relative, no leading /
    const content = `import * as fs from 'fs';\nconst exists = fs.existsSync(configPath);`;
    const issues = analyzer.analyze(
      "daemon/services/configLoader.ts",
      content,
      createContext("daemon/services/configLoader.ts", "typescript")
    );
    assert.equal(
      issues.some((i) => i.title?.includes("existsSync") || i.title?.includes("Synchronous")),
      false,
      "existsSync in daemon/services should not be flagged (daemon-service context)"
    );
  });
});

describe("configLoader", () => {
  it("shouldIgnoreFile matches glob pattern against absolute path filename", () => {
    const config: CodemoreConfig = { ...DEFAULT_CONFIG, ignore: ["accuracy*.mjs"] };
    assert.equal(
      shouldIgnoreFile("/Users/dev/project/accuracy2.mjs", config),
      true,
      "accuracy*.mjs should match accuracy2.mjs by filename"
    );
  });

  it("shouldIgnoreFile does not match unrelated file against glob pattern", () => {
    const config: CodemoreConfig = { ...DEFAULT_CONFIG, ignore: ["accuracy*.mjs"] };
    assert.equal(
      shouldIgnoreFile("/Users/dev/project/src/utils.ts", config),
      false
    );
  });

  it("getFileAnalyzerOverride returns override thresholds for matching path", () => {
    const config: CodemoreConfig = {
      ...DEFAULT_CONFIG,
      overrides: [{ files: ["daemon/services/**"], maxLineLength: 160 }],
    };
    const result = getFileAnalyzerOverride("daemon/services/staticAnalyzer.ts", config);
    assert.equal(result?.maxLineLength, 160);
  });

  it("getFileAnalyzerOverride returns null for non-matching path", () => {
    const config: CodemoreConfig = {
      ...DEFAULT_CONFIG,
      overrides: [{ files: ["daemon/services/**"], maxLineLength: 160 }],
    };
    assert.equal(getFileAnalyzerOverride("src/utils.ts", config), null);
  });

  it("getFileAnalyzerOverride merges multiple matching override blocks", () => {
    const config: CodemoreConfig = {
      ...DEFAULT_CONFIG,
      overrides: [
        { files: ["daemon/**"], maxLineLength: 160 },
        { files: ["daemon/services/**"], maxFunctionLength: 100 },
      ],
    };
    const result = getFileAnalyzerOverride("daemon/services/aiService.ts", config);
    assert.equal(result?.maxLineLength, 160);
    assert.equal(result?.maxFunctionLength, 100);
  });
});
