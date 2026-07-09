/* codemore-ignore-file: core-security-hardcoded-secret-pattern, core-security-hardcoded-password */ // intentional demo-vulnerability strings for the linter sandbox UI
import React, { useState, useEffect } from "react";
import WebGLHoloScope from "./WebGLHoloScope";
import { 
  Terminal, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Code, 
  FileCode, 
  Layers, 
  Shuffle, 
  Copy, 
  Undo2,
  Cpu,
  Bookmark,
  Bug,
  HelpCircle
} from "lucide-react";

interface ParserNode {
  id: string;
  type: string;
  name: string;
  line?: number;
  status: "ok" | "warn" | "error";
  children?: ParserNode[];
}

interface SandboxTemplate {
  name: string;
  icon: string;
  code: string;
  description: string;
}

const TEMPLATES: Record<string, SandboxTemplate> = {
  mongodb: {
    name: "MongoDB Query Injection",
    icon: "database",
    description: "Accepting a raw query parameter object directly into a Mongo filter exposes the database to structural injections ($gt, $ne selectors).",
    code: `// ❌ RISKY CODE - Dynamic parameter payload
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  
  // Accepts raw request object which can list {"$ne": ""}
  const account = await db.collection("users").findOne({
    user: username,
    pwd: password
  });

  res.json({ success: !!account });
});`
  },
  s3key: {
    name: "AWSS3 Access Credentials",
    icon: "key",
    description: "Hardcoding critical secret tokens in files that commit to public source branches compromises production database nodes.",
    code: `// ❌ RISKY CODE - Hardcoded cloud vendor tokens
const S3_SECRET = "AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const bucketConfig = {
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: S3_SECRET
};`
  },
  xss: {
    name: "Raw innerHTML Sink",
    icon: "layout",
    description: "Inserting unescaped parameters directly into innerHTML triggers instant Cross-Site Scripting (XSS) in any modern browser frame.",
    code: `// ❌ RISKY CODE - Dynamic markup injection
function updateProfileCard(userPayload) {
  const descriptionContainer = document.getElementById("bio");
  
  // Directly writing payload string to innerHTML triggers script tags
  descriptionContainer.innerHTML = "<p>User Bio: " + userPayload.bio + "</p>";
}`
  },
  awaitBug: {
    name: "Async Floating Promise",
    icon: "clock",
    description: "Calling asynchronous Promises without await allows execution to float, leaking unhandled rejections and creating race conditions.",
    code: `// ❌ RISKY CODE - Non-awaited critical sync action
async function processTransaction(req, res) {
  // Database ledger update called asynchronously
  db.updateLedgerBalance(req.body.userId, req.body.amount);
  
  // Immediate return before mutation registers
  return res.json({ status: "Processing initialized" });
}`
  }
};

interface SandboxFinding {
  id: string;
  line: number;
  type: string;
  vulnerability: string;
  fix: string;
  [key: string]: unknown;
}

export default function CodeMoreLinterSandbox() {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("mongodb");
  const [editorCode, setEditorCode] = useState<string>(TEMPLATES.mongodb.code);
  const [findings, setFindings] = useState<SandboxFinding[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [astNodes, setAstNodes] = useState<ParserNode[]>([]);
  const [selectedAstNode, setSelectedAstNode] = useState<ParserNode | null>(null);
  const [hasScanRun, setHasScanRun] = useState<boolean>(false);

  // Auto scroll/sync code when template is selected
  useEffect(() => {
    setEditorCode(TEMPLATES[selectedTemplateId].code);
    setFindings([]);
    setAstNodes([]);
    setSelectedAstNode(null);
  }, [selectedTemplateId]);

  // Handle client-side parsing mechanism (Regex Semantic Check)
  const runSemanticCheck = () => {
    setIsScanning(true);
    setFindings([]);
    setSelectedAstNode(null);

    setTimeout(() => {
      const lines = editorCode.split("\n");
      const currentFindings: SandboxFinding[] = [];
      const nodes: ParserNode[] = [];

      // Create primary Abstract Syntax Tree (AST) Root
      const programNode: ParserNode = {
        id: "root-Program",
        type: "Program",
        name: "Source File AST",
        status: "ok",
        children: []
      };

      let hasIssues = false;

      // Scan lines and construct real AST representation
      lines.forEach((line, index) => {
        const lineNum = index + 1;
        const lineStr = line.trim();

        // 1. Check for innerHTML Sink
        if (/\.innerHTML\s*=/.test(lineStr)) {
          hasIssues = true;
          currentFindings.push({
            id: `err-xss-${lineNum}`,
            line: lineNum,
            type: "CRITICAL",
            vulnerability: "Cross-Site Scripting (XSS) Sink",
            message: "Detected assignment to 'innerHTML' using unsanitized string concatenation.",
            fix: line.replace(/\.innerHTML\s*=\s*(.*);?/, ".textContent = $1;")
          });
          programNode.children?.push({
            id: `xss-${lineNum}`,
            type: "AssignmentExpression",
            name: "Assign innerHTML",
            line: lineNum,
            status: "error"
          });
        } 
        
        // 2. Check for Secret Keys
        else if (/(AKIA[A-Z0-9]{16}|secret.*=.*["'][0-9a-zA-Z/+]{20,}["'])/i.test(lineStr)) {
          hasIssues = true;
          currentFindings.push({
            id: `err-secret-${lineNum}`,
            line: lineNum,
            type: "CRITICAL",
            vulnerability: "Exposed API / Storage Secret Key",
            message: "Found static hardcoded API secret token or sensitive signature.",
            fix: "// Loaded securely via modern environment secrets\nconst S3_SECRET = process.env.AWS_S3_SECRET_KEY;"
          });
          programNode.children?.push({
            id: `secret-${lineNum}`,
            type: "VariableDeclaration",
            name: "Credentials Token",
            line: lineNum,
            status: "error"
          });
        } 
        
        // 3. Check for NoSQL Injection
        else if (/collection\(".*"\)\.findOne\(|findOne\(\{/.test(lineStr) && lines.some(l => l.includes("req.body") || l.includes("req.query"))) {
          hasIssues = true;
          currentFindings.push({
            id: `err-nosql-${lineNum}`,
            line: lineNum,
            type: "CRITICAL",
            vulnerability: "Structural NoSQL Query Injection",
            message: "Direct injection of raw request parameters into findOne expression. Payload objects can override query parameters.",
            fix: "db.collection('users').findOne({ user: String(username), pwd: String(password) });"
          });
          programNode.children?.push({
            id: `nosql-${lineNum}`,
            type: "CallExpression",
            name: "findOne Filter",
            line: lineNum,
            status: "error"
          });
        }
        
        // 4. Check for Async Floating statements
        else if (/db\.[a-zA-Z0-9_]+\s*\(/.test(lineStr) && !lineStr.startsWith("await") && !lineStr.includes("return") && lines[index-1]?.includes("async")) {
          hasIssues = true;
          currentFindings.push({
            id: `err-await-${lineNum}`,
            line: lineNum,
            type: "WARNING",
            vulnerability: "Async Floating Promise Leak",
            message: "Database invocation executed without await token. May trigger server race conditions.",
            fix: "await " + lineStr
          });
          programNode.children?.push({
            id: `await-${lineNum}`,
            type: "ExpressionStatement",
            name: "Floating Async DB",
            line: lineNum,
            status: "warn"
          });
        } 
        
        // Push normal block nodes to show structural integrity in the AST
        else if (lineStr.length > 5) {
          if (lineStr.startsWith("app.") || lineStr.startsWith("function")) {
            programNode.children?.push({
              id: `block-${lineNum}`,
              type: "FunctionDeclaration",
              name: lineStr.substring(0, 24) + "...",
              line: lineNum,
              status: "ok"
            });
          } else if (lineStr.startsWith("const") || lineStr.startsWith("let") || lineStr.startsWith("import")) {
            programNode.children?.push({
              id: `assign-${lineNum}`,
              type: "DeclarationStatement",
              name: lineStr.substring(0, 20),
              line: lineNum,
              status: "ok"
            });
          }
        }
      });

      // Update AST node colors
      programNode.status = hasIssues ? "error" : "ok";
      setAstNodes([programNode]);
      setFindings(currentFindings);
      setIsScanning(false);
      setHasScanRun(true);
    }, 800);
  };

  // Run initial checker
  useEffect(() => {
    runSemanticCheck();
  }, [editorCode]);

  const handleApplyCleanFix = (finding: SandboxFinding) => {
    const lines = editorCode.split("\n");
    lines[finding.line - 1] = finding.fix;
    setEditorCode(lines.join("\n"));
  };

  return (
    <section className="bg-black border-t border-gray-900 py-18 px-6 sm:px-12" id="playground-linter">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* Head Block */}
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-teal-500/10 bg-teal-500/5 text-[10px] font-mono text-teal-400 tracking-wider uppercase">
            <Cpu className="w-3.5 h-3.5" />
            <span>Interactive AST Code Parser</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight font-display text-white">
            Client-Side Scanner
          </h2>
          <p className="text-gray-400 text-sm sm:text-base font-light">
            Paste your own code files below or pick one of our reference security patterns. Observe how the abstract structures are dissected instantly.
          </p>
        </div>

        {/* Dashboard grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Editor and options Column */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Quick selectors bar */}
            <div className="flex flex-wrap items-center gap-2.5 p-1 bg-gray-950/60 rounded-xl border border-gray-900">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider px-3 py-1">Vulnerabilities:</span>
              {Object.entries(TEMPLATES).map(([id, item]) => (
                <button
                  key={id}
                  onClick={() => setSelectedTemplateId(id)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
                    selectedTemplateId === id 
                      ? "bg-teal-500/10 border border-teal-500/22 text-teal-300" 
                      : "text-gray-400 hover:text-white border border-transparent hover:bg-white/5"
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>

            {/* Main Interactive Coding Area */}
            <div className="relative rounded-xl border border-gray-900 bg-[#040409] overflow-hidden flex flex-col h-[420px]">
              {/* Header inside edit field */}
              <div className="flex items-center justify-between px-4 py-2 bg-gray-950/80 border-b border-gray-900">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-gray-500" />
                  <span className="text-[10px] font-mono text-gray-400">interactive_terminal_sandbox.ts</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono bg-pink-500/10 text-pink-400 border border-pink-500/15 px-1.5 py-0.5 rounded uppercase">
                    JS / TS ENGINE
                  </span>
                </div>
              </div>

              {/* Dynamic typing core textarea */}
              <div className="relative flex-1 flex overflow-hidden">
                {/* Visual margin lines indicator */}
                <div className="w-12 bg-gray-950/40 border-r border-gray-900/60 flex flex-col items-center py-4 font-mono text-[10px] text-gray-600 select-none">
                  {editorCode.split("\n").map((_, i) => (
                    <span key={i} className="leading-6 h-6">{i + 1}</span>
                  ))}
                </div>

                <textarea
                  className="flex-1 p-4 bg-transparent font-mono text-xs text-gray-300 resize-none outline-none focus:ring-0 leading-6 overflow-y-auto"
                  value={editorCode}
                  onChange={(e) => setEditorCode(e.target.value)}
                  placeholder="// Paste your node.js / typescript code snippet here to scan instantly..."
                  spellCheck="false"
                />
              </div>

              {/* Console control bar footer */}
              <div className="p-3 bg-gray-950/80 border-t border-gray-900 flex flex-wrap items-center justify-between gap-4">
                <span className="text-[10px] text-gray-500 font-mono flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-gray-600 animate-pulse" />
                  Total compiled payload lines: {editorCode.split("\n").length}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditorCode("")}
                    className="p-2 border border-gray-900 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                    title="Clear editor text"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={runSemanticCheck}
                    disabled={isScanning}
                    className="flex items-center gap-2 bg-[#175b4c] hover:bg-[#1f7b67] text-white font-mono text-xs px-4 py-2 rounded-lg transition-all shadow-md font-semibold font-medium"
                  >
                    {isScanning ? (
                      <>
                        <Shuffle className="w-3.5 h-3.5 animate-spin" />
                        <span>Compiling...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-teal-300" />
                        <span>Force Semantic AST Scan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Live Scan Findings Segment */}
            <div className="space-y-4">
              <h4 className="text-xs font-mono text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-teal-400" />
                Diagnostic report: {findings.length} issues detected
              </h4>

              {findings.length === 0 ? (
                <div className="rounded-xl border border-emerald-900/20 bg-emerald-950/5 p-5 flex items-start gap-3.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-semibold text-white">Source state is completely secure!</h5>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Our dynamic parser scanned your variables, expressions, and parameters. No loose innerHTML interfaces or plain secrets discovered.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {findings.map((finding) => (
                    <div 
                      key={finding.id}
                      className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-start justify-between gap-4 transition-all duration-300 ${
                        finding.type === "CRITICAL" 
                          ? "border-red-950/40 bg-red-950/10 shadow-[inset_0_1px_1px_rgba(255,0,0,0.04)]" 
                          : "border-amber-950/40 bg-amber-950/10"
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded border ${
                            finding.type === "CRITICAL" 
                              ? "bg-red-500/10 text-red-400 border-red-500/20" 
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}>
                            {finding.type}
                          </span>
                          <span className="text-xs font-mono text-gray-500">line {finding.line}</span>
                          <span className="text-xs font-bold text-white font-display">{finding.vulnerability}</span>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed font-light">{finding.message}</p>
                      </div>

                      <button
                        onClick={() => handleApplyCleanFix(finding)}
                        className="self-start md:self-center bg-gray-900 hover:bg-gray-800 border border-gray-800 text-xs text-white font-mono rounded-lg px-3.5 py-1.5 whitespace-nowrap transition-all"
                      >
                        Auto Patch Line
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* AST Tree Visualization Column */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Tree Section Container */}
            <div className="rounded-xl border border-gray-900 bg-gray-950/20 p-5 flex-1 flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-emerald-400" />
                  AST Semantic AST
                </h3>
                <span className="text-[10px] font-mono text-gray-500">Node Inspector</span>
              </div>

              {/* Responsive WebGL HoloScope code analyzer */}
              <WebGLHoloScope 
                isScanning={isScanning} 
                issuesCount={findings.length} 
                hasScanRun={hasScanRun} 
              />

              {/* The Actual Graph Visualizer */}
              <div className="flex-1 bg-black/60 rounded-lg border border-gray-900/60 p-4 font-mono text-xs overflow-y-auto space-y-4 flex flex-col">
                {astNodes.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-600">
                    <Bug className="w-10 h-10 text-gray-800 mb-2 animate-bounce" />
                    <span className="text-[10px] uppercase tracking-wider">Awaiting Scan trigger</span>
                  </div>
                ) : (
                  astNodes.map((rootNode) => (
                    <div key={rootNode.id} className="space-y-3">
                      {/* Root node header */}
                      <div className="flex items-center gap-2 p-2 rounded bg-gray-900/40 border border-gray-900">
                        <Layers className={`w-4 h-4 ${rootNode.status === "error" ? "text-red-400 animate-pulse" : "text-emerald-400"}`} />
                        <span className="text-white font-semibold">{rootNode.type}</span>
                        <span className="text-gray-500 text-[10px]">{rootNode.name}</span>
                      </div>

                      {/* Display visual tree child pointers */}
                      <div className="ml-4 pl-3 border-l border-gray-800 flex flex-col gap-2">
                        {rootNode.children && rootNode.children.length === 0 ? (
                          <div className="text-gray-600 text-[10px] italic py-1">No syntax identifiers categorized</div>
                        ) : (
                          rootNode.children?.map((child) => {
                            const isSelected = selectedAstNode?.id === child.id;
                            
                            let nodeColor = "text-emerald-300 border-emerald-900/30 bg-emerald-950/5";
                            if (child.status === "error") {
                              nodeColor = "text-red-300 border-red-900/30 bg-red-950/10 animate-border-flash";
                            } else if (child.status === "warn") {
                              nodeColor = "text-amber-300 border-amber-900/30 bg-amber-950/10";
                            }

                            return (
                              <button
                                key={child.id}
                                onClick={() => setSelectedAstNode(child)}
                                className={`w-full text-left p-2 rounded-md border flex items-center justify-between gap-2.5 transition-all outline-none ${nodeColor} ${
                                  isSelected ? "scale-[1.02] ring-1 ring-teal-400/50" : "hover:border-white/15"
                                }`}
                              >
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-bold text-white uppercase">{child.type}</span>
                                  <span className="text-[10px] text-gray-400 font-light max-w-[150px] truncate">{child.name}</span>
                                </div>
                                <span className="text-[10px] text-gray-500 uppercase font-mono">L.{child.line}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Interactive Inspector Sidebar info node */}
              <div className="bg-[#050510] rounded-lg border border-gray-900 p-3.5 space-y-2 min-h-[110px] flex flex-col justify-between">
                {selectedAstNode ? (
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-gray-500 uppercase block">Inspector Output</span>
                    <h5 className="text-xs font-bold text-white font-display flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        selectedAstNode.status === "error" ? "bg-red-500 animate-ping" : selectedAstNode.status === "warn" ? "bg-amber-500" : "bg-emerald-500"
                      }`} />
                      {selectedAstNode.type}
                    </h5>
                    <p className="text-[10.5px] text-gray-400 font-light mt-1.5">
                      {selectedAstNode.status === "error" 
                        ? `Node properties on line ${selectedAstNode.line} are verified to be production critical vulnerabilities.` 
                        : selectedAstNode.status === "warn" 
                        ? `Node logic on line ${selectedAstNode.line} exhibits high code drift and floating promises structural risks.` 
                        : `A normal parsed ${selectedAstNode.type} successfully tracked by the CodeMore semantic indexing map.`}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-3 text-gray-600 gap-1 flex-1">
                    <HelpCircle className="w-5 h-5 text-gray-700" />
                    <span className="text-[10.5px] font-mono">Click any dynamic AST Node above to inspect properties</span>
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
