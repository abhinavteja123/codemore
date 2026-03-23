import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enqueueGitHubScanJob, kickScanQueue } from "@/lib/scanJobRunner";
import { createProject, createScanJob, mapDbScanJob } from "@/lib/database";
import { isDbEnabled } from "@/lib/supabase";
import { saveGitHubArtifact } from "@/lib/scanArtifacts";
import { Project } from "@/lib/types";
import { createGitHubScanSchema, validateBody, formatZodError } from "@/lib/validation";
import { validateCsrf } from "@/lib/csrf";
import { getUserToken } from "@/lib/tokenStore";
import { logger, sanitizeError } from '@/lib/logger';

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

  const body = await req.json();
  const validation = validateBody(createGitHubScanSchema, body);

  if (!validation.success) {
    return NextResponse.json(
      { error: formatZodError(validation.error) },
      { status: 400 }
    );
  }

  const { repoFullName, branch, name, projectId } = validation.data;
  const projectName = name || repoFullName.split("/")[1] || "GitHub Project";

  try {
    if (isDbEnabled()) {
      const dbProject = await createProject(
        session.user.email,
        projectName,
        "github",
        repoFullName
      );
      if (!dbProject) {
        throw new Error("Failed to create project for scan.");
      }

      const dbJob = await createScanJob(dbProject.id, "github", repoFullName);
      if (!dbJob) {
        throw new Error("Failed to create scan job.");
      }

      await saveGitHubArtifact(dbJob.id, {
        repoFullName,
        branch,
        accessToken,
      });
      kickScanQueue();

      return NextResponse.json({
        projectId: dbProject.id,
        project: null as Project | null,
        job: mapDbScanJob(dbJob),
        queued: true,
      });
    }

    const result = await enqueueGitHubScanJob({
      userEmail: session.user.email,
      projectId,
      name: projectName,
      repoFullName,
      accessToken,
      branch,
    });

    return NextResponse.json({
      projectId: result.projectId,
      project: result.project || null,
      job: result.job,
      queued: result.queued,
    });
  } catch (error) {
    logger.error({ err: sanitizeError(error) }, "GitHub scan job failed");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GitHub scan failed" },
      { status: 500 }
    );
  }
}
