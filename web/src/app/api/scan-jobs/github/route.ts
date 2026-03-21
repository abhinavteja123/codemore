import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enqueueGitHubScanJob, kickScanQueue } from "@/lib/scanJobRunner";
import { createProject, createScanJob, mapDbScanJob } from "@/lib/database";
import { isDbEnabled } from "@/lib/supabase";
import { saveGitHubArtifact } from "@/lib/scanArtifacts";
import { Project } from "@/lib/types";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !(session as any).accessToken || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const repoFullName = body.repoFullName as string | undefined;
  const branch = body.branch as string | undefined;
  const projectName = (body.name as string | undefined) || repoFullName?.split("/")[1] || "GitHub Project";

  if (!repoFullName || !/^[\w.-]+\/[\w.-]+$/.test(repoFullName)) {
    return NextResponse.json({ error: "Invalid repository name" }, { status: 400 });
  }

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
        accessToken: (session as any).accessToken,
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
      projectId: body.projectId as string | undefined,
      name: projectName,
      repoFullName,
      accessToken: (session as any).accessToken,
      branch,
    });

    return NextResponse.json({
      projectId: result.projectId,
      project: result.project || null,
      job: result.job,
      queued: result.queued,
    });
  } catch (error) {
    console.error("GitHub scan job failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GitHub scan failed" },
      { status: 500 }
    );
  }
}
