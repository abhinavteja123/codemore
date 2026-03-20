import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProject, deleteProject, getLatestScan, getScanIssues } from "@/lib/database";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await getProject(params.id, session.user.email);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const latestScan = await getLatestScan(params.id);
  let issues: any[] = [];
  if (latestScan) {
    issues = await getScanIssues(latestScan.id);
  }

  return NextResponse.json({ project, latestScan, issues });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const success = await deleteProject(params.id, session.user.email);
  if (!success) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
