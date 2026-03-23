import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import {
  getCachedSuggestionsForProjectIssue,
  resolveSuggestionsForProjectIssue,
  SuggestionServiceError,
} from "@/lib/suggestionService";
import { logger, sanitizeError } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const issueId = req.nextUrl.searchParams.get("issueId");

  try {
    const suggestions = await getCachedSuggestionsForProjectIssue(
      params.id,
      session.user.email,
      issueId || ""
    );
    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof SuggestionServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logger.error({ err: sanitizeError(error) }, "Failed to load suggestions");
    return NextResponse.json(
      { error: "Failed to load suggestions" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const issueId = body.issueId as string | undefined;
  const includeRelatedFiles = body.includeRelatedFiles !== false;

  // Extract AI config from request body (user-provided LLM settings)
  const aiConfig = body.aiProvider && body.apiKey
    ? { aiProvider: body.aiProvider, apiKey: body.apiKey }
    : undefined;

  try {
    const result = await resolveSuggestionsForProjectIssue(
      params.id,
      session.user.email,
      issueId || "",
      includeRelatedFiles,
      aiConfig
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SuggestionServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logger.error({ err: sanitizeError(error) }, "Suggestion generation failed");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
