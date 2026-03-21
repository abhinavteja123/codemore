import { strict as assert } from "assert";
import { StaticAnalyzer } from "../daemon/services/staticAnalyzer";
import { FileContext } from "../shared/protocol";
import { analyzeFile as analyzeWebFile } from "../web/src/lib/analyzer";

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
});
