import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { analyzeProjectWithProductionCore } from "@/lib/productionAnalyzer";
import { ProjectFile } from "@/lib/types";
import { logger, sanitizeError } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const files: ProjectFile[] = body.files;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided for analysis" },
        { status: 400 }
      );
    }

    // Limit total payload size
    const totalSize = files.reduce((acc: number, f: any) => acc + (f.content?.length || 0), 0);
    if (totalSize > 10 * 1024 * 1024) { // 10MB limit
      return NextResponse.json({ error: "Payload too large. Max 10MB." }, { status: 413 });
    }
    if (files.length > 200) {
      return NextResponse.json({ error: "Too many files. Max 200." }, { status: 413 });
    }

    // Run analysis
    const result = await analyzeProjectWithProductionCore(files);

    // Save to database if projectId provided
    let scanId = null;
    if (body.projectId) {
      const { saveScan, saveProjectFiles, getProject } = await import("@/lib/database");
      // Verify user owns this project
      const project = await getProject(body.projectId, session.user?.email || "");
      if (project) {
        await saveProjectFiles(body.projectId, files);
        const scan = await saveScan(body.projectId, result.metrics, result.issues);
        if (scan) scanId = scan.id;
      }
    }

    return NextResponse.json({ ...result, scanId });
  } catch (error) {
    logger.error({ err: sanitizeError(error) }, "Analysis error");
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}
