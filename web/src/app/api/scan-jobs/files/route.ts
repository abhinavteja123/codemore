import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { filterProjectFiles } from "@/lib/sourceIngestion";
import { ProjectFile } from "@/lib/types";
import { enqueueFileScanJob } from "@/lib/scanJobRunner";
import { logger, sanitizeError } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const incomingFiles = Array.isArray(body.files) ? (body.files as ProjectFile[]) : [];
  const files = filterProjectFiles(incomingFiles);
  const source = body.source === "github" ? "github" : "upload";
  const projectName = (body.name as string | undefined)?.trim() || "Uploaded Project";
  const repoFullName = source === "github" ? (body.repoFullName as string | undefined) : undefined;
  const existingProjectId = body.projectId as string | undefined;

  if (files.length === 0) {
    return NextResponse.json({ error: "No supported source files found." }, { status: 400 });
  }

  try {
    const result = await enqueueFileScanJob({
      userEmail: session.user.email,
      projectId: existingProjectId,
      name: projectName,
      source,
      repoFullName,
      files,
    });

    return NextResponse.json({
      projectId: result.projectId,
      project: result.project || null,
      job: result.job,
      queued: result.queued,
    });
  } catch (error) {
    logger.error({ err: sanitizeError(error) }, "File scan job failed");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "File scan failed" },
      { status: 500 }
    );
  }
}
