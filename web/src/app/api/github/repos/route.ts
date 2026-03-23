import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchGitHubRepoFiles } from "@/lib/sourceIngestion";
import { getUserToken } from "@/lib/tokenStore";
import { validateCsrf } from "@/lib/csrf";
import { logger, sanitizeError } from '@/lib/logger';

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch GitHub token from database (not from session)
  const accessToken = await getUserToken(session.user.email, "github");
  if (!accessToken) {
    return NextResponse.json({ error: "GitHub not connected. Please re-authenticate with GitHub." }, { status: 401 });
  }

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
      logger.warn({ remaining }, "GitHub rate limit low");
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
    logger.error({ err: sanitizeError(error) }, "GitHub repos error");
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}

// Fetch repo files for analysis
export async function POST(req: NextRequest) {
  // CSRF protection for state-changing requests
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch GitHub token from database (not from session)
  const accessToken = await getUserToken(session.user.email, "github");
  if (!accessToken) {
    return NextResponse.json({ error: "GitHub not connected. Please re-authenticate with GitHub." }, { status: 401 });
  }

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
    logger.error({ err: sanitizeError(error) }, "GitHub fetch files error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch repository files" },
      { status: 500 }
    );
  }
}
