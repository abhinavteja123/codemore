import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getCachedSuggestionsForProjectIssue,
  resolveSuggestionsForProjectIssue,
  SuggestionServiceError,
} from "@/lib/suggestionService";

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

    console.error("Failed to load suggestions:", error);
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
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const issueId = body.issueId as string | undefined;
  const includeRelatedFiles = body.includeRelatedFiles !== false;

  try {
    const result = await resolveSuggestionsForProjectIssue(
      params.id,
      session.user.email,
      issueId || "",
      includeRelatedFiles
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SuggestionServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Suggestion generation failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
