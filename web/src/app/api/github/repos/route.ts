import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchGitHubRepoFiles } from "@/lib/sourceIngestion";

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
    const files = await fetchGitHubRepoFiles({
      accessToken,
      repoFullName,
      branch,
    });
    return NextResponse.json({ files });
  } catch (error) {
    console.error("GitHub fetch files error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch repository files" },
      { status: 500 }
    );
  }
}
