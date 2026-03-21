import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScanJob, mapDbScanJob } from "@/lib/database";
import { getCompletedProjectSnapshot, kickScanQueue } from "@/lib/scanJobRunner";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await getScanJob(params.id, session.user.email);
  if (!job) {
    return NextResponse.json({ error: "Scan job not found" }, { status: 404 });
  }

  const mappedJob = mapDbScanJob(job);
  if (mappedJob.status === "queued" || mappedJob.status === "running") {
    kickScanQueue();
  }
  const project =
    mappedJob.status === "completed"
      ? await getCompletedProjectSnapshot(mappedJob.projectId, session.user.email)
      : null;

  return NextResponse.json({ job: mappedJob, project });
}
