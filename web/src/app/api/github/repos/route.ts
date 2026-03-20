import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !(session as any).accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = (session as any).accessToken;

  try {
    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=30&type=owner",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    // Check rate limit
    const remaining = parseInt(response.headers.get("x-ratelimit-remaining") || "100");
    if (remaining < 5) {
      console.warn(`GitHub rate limit low: ${remaining} remaining`);
    }

    if (response.status === 403 || response.status === 429) {
      const resetAt = response.headers.get("x-ratelimit-reset");
      return NextResponse.json(
        { error: "GitHub rate limit exceeded. Try again later.", resetAt },
        { status: 429 }
      );
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const repos = await response.json();
    return NextResponse.json(repos);
  } catch (error) {
    console.error("GitHub repos error:", error);
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}

// Fetch repo files for analysis
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !(session as any).accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = (session as any).accessToken;
  const { repoFullName, branch } = await req.json();

  if (!repoFullName || !/^[\w.-]+\/[\w.-]+$/.test(repoFullName)) {
    return NextResponse.json({ error: "Invalid repository name" }, { status: 400 });
  }

  try {
    // Get the repo tree
    const branchName = branch || "main";
    const treeResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/trees/${branchName}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    // Check rate limit
    const treeRemaining = parseInt(treeResponse.headers.get("x-ratelimit-remaining") || "100");
    if (treeRemaining < 5) {
      console.warn(`GitHub rate limit low: ${treeRemaining} remaining`);
    }

    if (treeResponse.status === 403 || treeResponse.status === 429) {
      const resetAt = treeResponse.headers.get("x-ratelimit-reset");
      return NextResponse.json(
        { error: "GitHub rate limit exceeded. Try again later.", resetAt },
        { status: 429 }
      );
    }

    if (!treeResponse.ok) {
      // Try 'master' if 'main' fails
      if (branchName === "main") {
        const masterResponse = await fetch(
          `https://api.github.com/repos/${repoFullName}/git/trees/master?recursive=1`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );
        if (masterResponse.status === 403 || masterResponse.status === 429) {
          const resetAt = masterResponse.headers.get("x-ratelimit-reset");
          return NextResponse.json(
            { error: "GitHub rate limit exceeded. Try again later.", resetAt },
            { status: 429 }
          );
        }
        if (!masterResponse.ok) {
          throw new Error(`GitHub API error: ${masterResponse.status}`);
        }
        const tree = await masterResponse.json();
        return await fetchFilesFromTree(tree, repoFullName, accessToken);
      }
      throw new Error(`GitHub API error: ${treeResponse.status}`);
    }

    const tree = await treeResponse.json();
    return await fetchFilesFromTree(tree, repoFullName, accessToken);
  } catch (error) {
    console.error("GitHub fetch files error:", error);
    return NextResponse.json(
      { error: "Failed to fetch repository files" },
      { status: 500 }
    );
  }
}

async function fetchFilesFromTree(
  tree: any,
  repoFullName: string,
  accessToken: string
) {
  const supportedExtensions = [
    ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".cs", ".go",
    ".rs", ".rb", ".php", ".cpp", ".c", ".h", ".swift", ".kt",
    ".scala", ".html", ".css", ".scss", ".json", ".yaml", ".yml",
    ".sql", ".sh",
  ];

  const excludePaths = [
    "node_modules/", "dist/", "build/", ".git/", "__pycache__/",
    "vendor/", ".next/", "coverage/", ".venv/", "venv/",
  ];

  // Filter to supported source files (skip large & excluded)
  const sourceFiles = (tree.tree || [])
    .filter((item: any) => {
      if (item.type !== "blob") return false;
      if (item.size > 100000) return false; // Skip files > 100KB
      const ext = "." + (item.path.split(".").pop()?.toLowerCase() || "");
      if (!supportedExtensions.includes(ext)) return false;
      if (excludePaths.some((p) => item.path.includes(p))) return false;
      return true;
    })
    .slice(0, 50); // Limit to 50 files for performance

  // Fetch file contents in parallel (batches of 10)
  const files = [];
  for (let i = 0; i < sourceFiles.length; i += 10) {
    const batch = sourceFiles.slice(i, i + 10);
    const batchResults = await Promise.all(
      batch.map(async (item: any) => {
        try {
          const fileRes = await fetch(
            `https://api.github.com/repos/${repoFullName}/contents/${item.path}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3.raw",
              },
            }
          );
          if (!fileRes.ok) return null;
          const content = await fileRes.text();
          const ext = item.path.split(".").pop()?.toLowerCase() || "";
          return {
            path: item.path,
            content,
            language: ext,
            size: item.size,
          };
        } catch {
          return null;
        }
      })
    );
    files.push(...batchResults.filter(Boolean));
  }

  return NextResponse.json({ files });
}
