import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enqueueZipScanJob, kickScanQueue } from "@/lib/scanJobRunner";
import { createProject, createScanJob, mapDbScanJob } from "@/lib/database";
import { isDbEnabled } from "@/lib/supabase";
import { saveZipArtifact } from "@/lib/scanArtifacts";
import { Project } from "@/lib/types";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const archive = formData.get("archive");

  if (!(archive instanceof File)) {
    return NextResponse.json({ error: "ZIP archive is required" }, { status: 400 });
  }

  if (!archive.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "Only ZIP uploads are supported" }, { status: 400 });
  }

  const projectName =
    ((formData.get("name") as string | null) || archive.name.replace(/\.zip$/i, "")).trim() || "Uploaded Project";

  try {
    if (isDbEnabled()) {
      const dbProject = await createProject(session.user.email, projectName, "upload");
      if (!dbProject) {
        throw new Error("Failed to create project for scan.");
      }

      const dbJob = await createScanJob(dbProject.id, "upload", archive.name);
      if (!dbJob) {
        throw new Error("Failed to create scan job.");
      }

      const arrayBuffer = await archive.arrayBuffer();
      await saveZipArtifact(dbJob.id, Buffer.from(arrayBuffer));
      kickScanQueue();

      return NextResponse.json({
        projectId: dbProject.id,
        project: null as Project | null,
        job: mapDbScanJob(dbJob),
        queued: true,
      });
    }

    const arrayBuffer = await archive.arrayBuffer();
    const result = await enqueueZipScanJob({
      userEmail: session.user.email,
      projectId: (formData.get("projectId") as string | null) || undefined,
      name: projectName,
      archiveName: archive.name,
      archiveBuffer: Buffer.from(arrayBuffer),
    });

    return NextResponse.json({
      projectId: result.projectId,
      project: result.project || null,
      job: result.job,
      queued: result.queued,
    });
  } catch (error) {
    console.error("ZIP scan job failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ZIP scan failed" },
      { status: 500 }
    );
  }
}
