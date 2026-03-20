import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProject, getProjectScans } from "@/lib/database";

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

  const scans = await getProjectScans(params.id);
  return NextResponse.json({ scans });
}
