import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserProjects, createProject, getUserStats } from "@/lib/database";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [projects, stats] = await Promise.all([
    getUserProjects(session.user.email),
    getUserStats(session.user.email),
  ]);

  return NextResponse.json({ projects, stats });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, source, repoFullName } = await req.json();
  if (!name || !source) {
    return NextResponse.json({ error: "Name and source required" }, { status: 400 });
  }

  const project = await createProject(session.user.email, name, source, repoFullName);
  if (!project) {
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }

  return NextResponse.json(project);
}
