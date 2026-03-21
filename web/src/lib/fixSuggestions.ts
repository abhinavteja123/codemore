import path from "path";
import { AiService } from "../../../daemon/services/aiService";
import { AstParser } from "../../../daemon/services/astParser";
import type {
  CodeIssue as SharedCodeIssue,
  DaemonConfig,
  FileContext,
} from "../../../shared/protocol";
import { AiConfig, CodeIssue, CodeSuggestion, ProjectFile } from "./types";

type FileBundle = {
  file: ProjectFile;
  context: FileContext;
};

/**
 * Get AI provider config - uses user-provided config if available,
 * otherwise falls back to server environment variables.
 * This allows the web app to work like the extension where users
 * configure their own LLM provider and API key.
 */
function getAiProviderConfig(aiConfig?: AiConfig): Pick<DaemonConfig, "aiProvider" | "apiKey"> {
  // If user provided config, use it
  if (aiConfig?.aiProvider && aiConfig?.apiKey) {
    return {
      aiProvider: aiConfig.aiProvider as DaemonConfig["aiProvider"],
      apiKey: aiConfig.apiKey,
    };
  }

  // Fall back to environment variables
  const provider = (process.env.CODEMORE_AI_PROVIDER ||
    (process.env.OPENAI_API_KEY
      ? "openai"
      : process.env.ANTHROPIC_API_KEY
        ? "anthropic"
        : process.env.GEMINI_API_KEY
          ? "gemini"
          : "openai")) as DaemonConfig["aiProvider"];

  const apiKey =
    process.env.CODEMORE_AI_API_KEY ||
    (provider === "openai"
      ? process.env.OPENAI_API_KEY
      : provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : provider === "gemini"
          ? process.env.GEMINI_API_KEY
          : undefined);

  return { aiProvider: provider, apiKey };
}

function createAiService(aiConfig?: AiConfig): AiService {
  const providerConfig = getAiProviderConfig(aiConfig);
  return new AiService({
    ...providerConfig,
    autoAnalyze: false,
    analysisDelay: 0,
    excludePatterns: [],
    maxFileSizeKB: 500,
    enableTelemetry: false,
    maxConcurrentAnalysis: 1,
    cacheEnabled: false,
    cacheTTLMinutes: 5,
    analysisTools: "internal",
  });
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

async function buildFileBundles(files: ProjectFile[]): Promise<Map<string, FileBundle>> {
  const parser = new AstParser();
  const bundles = new Map<string, FileBundle>();

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    const ast = await parser.parse(normalizedPath, file.content);
    const context = parser.extractContext(normalizedPath, ast, file.content);
    bundles.set(normalizedPath, {
      file: { ...file, path: normalizedPath },
      context,
    });
  }

  return bundles;
}

function resolveRelativeImport(
  fromPath: string,
  importPath: string,
  fileBundles: Map<string, FileBundle>
): string | null {
  if (!importPath.startsWith(".")) {
    return null;
  }

  const basePath = path.resolve(path.dirname(fromPath), importPath).replace(/\\/g, "/");
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.json`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
    `${basePath}/index.jsx`,
  ];

  for (const candidate of candidates) {
    if (fileBundles.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function gatherRelatedFiles(
  targetPath: string,
  targetContext: FileContext,
  fileBundles: Map<string, FileBundle>
): Array<{ path: string; content: string; context: FileContext }> {
  const relatedPaths = new Set<string>();

  for (const fileImport of targetContext.imports) {
    const resolved = resolveRelativeImport(targetPath, fileImport.module, fileBundles);
    if (resolved && resolved !== targetPath) {
      relatedPaths.add(resolved);
    }
    if (relatedPaths.size >= 5) {
      break;
    }
  }

  if (relatedPaths.size < 5) {
    for (const [path, bundle] of Array.from(fileBundles.entries())) {
      if (path === targetPath) {
        continue;
      }

      const importsTarget = bundle.context.imports.some((fileImport) => {
        const resolved = resolveRelativeImport(path, fileImport.module, fileBundles);
        return resolved === targetPath;
      });

      if (importsTarget) {
        relatedPaths.add(path);
      }
      if (relatedPaths.size >= 5) {
        break;
      }
    }
  }

  return Array.from(relatedPaths)
    .slice(0, 5)
    .map((path) => {
      const bundle = fileBundles.get(path)!;
      return {
        path: bundle.file.path,
        content: bundle.file.content,
        context: bundle.context,
      };
    });
}

export async function generateFixSuggestionsForIssue(
  files: ProjectFile[],
  issue: CodeIssue,
  includeRelatedFiles: boolean = true,
  aiConfig?: AiConfig
): Promise<CodeSuggestion[]> {
  const fileBundles = await buildFileBundles(files);
  const targetPath = normalizePath(issue.location.filePath);
  const targetBundle = fileBundles.get(targetPath);

  if (!targetBundle) {
    throw new Error("The file for this issue is no longer available.");
  }

  const relatedFiles = includeRelatedFiles
    ? gatherRelatedFiles(targetPath, targetBundle.context, fileBundles)
    : [];

  const aiService = createAiService(aiConfig);
  const suggestions = await aiService.generateAiFixForIssue(
    issue as unknown as SharedCodeIssue,
    targetBundle.file.content,
    targetBundle.context,
    relatedFiles
  );

  return suggestions as unknown as CodeSuggestion[];
}
