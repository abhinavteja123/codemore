import JSZip from "jszip";
import { ProjectFile } from "./types";

export const MAX_ANALYZED_FILES = 200;
export const MAX_FILE_SIZE_BYTES = 500 * 1024;
export const MAX_TOTAL_CONTENT_BYTES = 10 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "py", "java", "cs", "go", "rs", "rb",
  "php", "cpp", "c", "h", "html", "css", "json", "yaml", "yml",
  "sql", "sh", "swift", "kt", "scala", "lua", "r", "m", "vue",
  "svelte", "astro", "md", "markdown", "bash",
]);

const EXCLUDED_PATH_SEGMENTS = [
  "node_modules/",
  ".git/",
  "vendor/",
  "dist/",
  "build/",
  "__pycache__/",
  ".next/",
  "coverage/",
  ".venv/",
  "venv/",
];

function normalizePath(filePath: string): string {
  // Normalize and strip leading slashes
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");

  // Check for path traversal attempts
  if (normalized.includes("../") || normalized.includes("..\\") || normalized === "..") {
    throw new Error(`Path traversal detected: ${filePath}`);
  }

  return normalized;
}

function getExtension(filePath: string): string {
  const normalized = normalizePath(filePath).toLowerCase();
  if (normalized.endsWith("dockerfile")) {
    return "dockerfile";
  }

  const ext = normalized.split(".").pop() || "";
  return ext.toLowerCase();
}

function shouldSkipPath(filePath: string): boolean {
  const normalized = normalizePath(filePath).toLowerCase();
  return EXCLUDED_PATH_SEGMENTS.some((segment) => normalized.includes(segment));
}

function sortProjectFiles(files: ProjectFile[]): ProjectFile[] {
  return [...files].sort((a, b) => {
    if (a.path.length !== b.path.length) {
      return a.path.length - b.path.length;
    }
    return a.path.localeCompare(b.path);
  });
}

export function filterProjectFiles(files: ProjectFile[]): ProjectFile[] {
  const filtered: ProjectFile[] = [];
  const seenPaths = new Set<string>();
  let totalBytes = 0;

  for (const file of sortProjectFiles(files)) {
    const path = normalizePath(file.path);
    const extension = getExtension(path);

    if (!SUPPORTED_EXTENSIONS.has(extension) && extension !== "dockerfile") {
      continue;
    }
    if (shouldSkipPath(path)) {
      continue;
    }
    if (!file.content || file.size <= 0) {
      continue;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      continue;
    }
    if (seenPaths.has(path)) {
      continue;
    }
    if (filtered.length >= MAX_ANALYZED_FILES) {
      break;
    }
    if (totalBytes + file.size > MAX_TOTAL_CONTENT_BYTES) {
      break;
    }

    seenPaths.add(path);
    totalBytes += file.size;
    filtered.push({
      path,
      content: file.content,
      language: extension || file.language || "unknown",
      size: file.size,
    });
  }

  return filtered;
}

export async function extractProjectFilesFromZipBuffer(buffer: Buffer): Promise<ProjectFile[]> {
  const zip = await JSZip.loadAsync(buffer);
  const entries: ProjectFile[] = [];

  for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) {
      continue;
    }

    const normalizedPath = normalizePath(relativePath);
    if (shouldSkipPath(normalizedPath)) {
      continue;
    }

    try {
      const content = await zipEntry.async("string");
      const size = Buffer.byteLength(content, "utf8");
      entries.push({
        path: normalizedPath,
        content,
        language: getExtension(normalizedPath),
        size,
      });
    } catch {
      // Skip unreadable entries.
    }
  }

  return filterProjectFiles(entries);
}

async function fetchGitHubTree(
  accessToken: string,
  repoFullName: string,
  branchName: string
): Promise<any> {
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/git/trees/${branchName}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (response.status === 404 && branchName === "main") {
    return fetchGitHubTree(accessToken, repoFullName, "master");
  }

  if (response.status === 403 || response.status === 429) {
    throw new Error("GitHub rate limit exceeded. Try again later.");
  }

  if (!response.ok) {
    throw new Error(`GitHub tree fetch failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchGitHubRepoFiles(params: {
  accessToken: string;
  repoFullName: string;
  branch?: string;
}): Promise<ProjectFile[]> {
  const { accessToken, repoFullName, branch } = params;
  const tree = await fetchGitHubTree(accessToken, repoFullName, branch || "main");

  const sourceFiles = ((tree.tree || []) as Array<{
    path: string;
    type: string;
    size: number;
  }>)
    .filter((item) => item.type === "blob")
    .map((item) => ({
      path: normalizePath(item.path),
      size: item.size || 0,
    }))
    .filter((item) => !shouldSkipPath(item.path))
    .filter((item) => {
      const extension = getExtension(item.path);
      return SUPPORTED_EXTENSIONS.has(extension) || extension === "dockerfile";
    })
    .filter((item) => item.size > 0 && item.size <= MAX_FILE_SIZE_BYTES)
    .slice(0, MAX_ANALYZED_FILES);

  const files: ProjectFile[] = [];

  for (let i = 0; i < sourceFiles.length; i += 10) {
    const batch = sourceFiles.slice(i, i + 10);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const response = await fetch(
            `https://api.github.com/repos/${repoFullName}/contents/${item.path}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3.raw",
              },
            }
          );

          if (!response.ok) {
            return null;
          }

          const content = await response.text();
          return {
            path: item.path,
            content,
            language: getExtension(item.path),
            size: Buffer.byteLength(content, "utf8"),
          } satisfies ProjectFile;
        } catch {
          return null;
        }
      })
    );

    files.push(...batchResults.filter((file): file is ProjectFile => Boolean(file)));
  }

  return filterProjectFiles(files);
}
