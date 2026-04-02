import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserProjectSnapshots, createProject, getUserStats } from "@/lib/database";
import { createProjectSchema, validateBody, formatZodError } from "@/lib/validation";
import { validateCsrf } from "@/lib/csrf";
import { validateDbConnection } from "@/lib/supabase";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  // For unauthenticated users, return empty projects (demo mode)
  if (!session?.user?.email) {
    return NextResponse.json({ projects: [], stats: null });
  }

  // Check if DB is actually working
  const dbWorking = await validateDbConnection();
  if (!dbWorking) {
    // Return empty - user can still use upload/analyze without DB
    return NextResponse.json({ projects: [], stats: null });
  }

  const [projects, stats] = await Promise.all([
    getUserProjectSnapshots(session.user.email),
    getUserStats(session.user.email),
  ]);

  return NextResponse.json({ projects, stats });
}

export async function POST(req: NextRequest) {
  // CSRF protection for state-changing requests
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Sign in to save projects" }, { status: 401 });
  }

  const body = await req.json();
  const validation = validateBody(createProjectSchema, body);

  if (!validation.success) {
    return NextResponse.json(
      { error: formatZodError(validation.error) },
      { status: 400 }
    );
  }

  const { name, source, repoFullName } = validation.data;

  const project = await createProject(session.user.email, name, source, repoFullName);
  if (!project) {
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }

  return NextResponse.json(project);
}
