import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { enqueueZipScanJob, kickScanQueue } from "@/lib/scanJobRunner";
import { createProject, createScanJob, mapDbScanJob } from "@/lib/database";
import { isDbEnabled } from "@/lib/supabase";
import { saveZipArtifact } from "@/lib/scanArtifacts";
import { Project } from "@/lib/types";
import { logger, sanitizeError } from "@/lib/logger";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  // Only validate CSRF for authenticated users
  if (session) {
    const csrfError = validateCsrf(req);
    if (csrfError) return csrfError;
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

  const userEmail = session?.user?.email || `demo-${uuidv4()}@codemore.local`;
  const isDemo = !session?.user?.email;

  try {
    // For authenticated users with DB enabled - try DB-backed scan
    if (!isDemo && isDbEnabled()) {
      try {
        const dbProject = await createProject(userEmail, projectName, "upload");
        if (dbProject) {
          const dbJob = await createScanJob(dbProject.id, "upload", archive.name);
          if (dbJob) {
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
        }
      } catch (dbError) {
        logger.warn({ err: sanitizeError(dbError) }, "DB-backed scan failed, falling back to inline");
      }
    }

    // Fallback: Process inline (works without DB)
    const arrayBuffer = await archive.arrayBuffer();
    const result = await enqueueZipScanJob({
      userEmail,
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
      demo: isDemo,
    });
  } catch (error) {
    logger.error({ err: sanitizeError(error) }, "ZIP scan job failed");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ZIP scan failed" },
      { status: 500 }
    );
  }
}
