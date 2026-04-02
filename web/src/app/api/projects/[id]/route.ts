import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectSnapshot, deleteProject, getHealthHistory, HealthSnapshot } from "@/lib/database";
import { validateCsrf } from "@/lib/csrf";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const includeHistory = url.searchParams.get('includeHistory') === 'true';
  const historyLimit = Math.min(parseInt(url.searchParams.get('historyLimit') || '30', 10), 100);

  const project = await getProjectSnapshot(params.id, session.user.email, true);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Include health history if requested
  if (includeHistory) {
    const snapshots = await getHealthHistory(params.id, historyLimit);
    const trend = calculateTrend(snapshots);
    const weeklyAverage = calculateAverage(snapshots, 7);
    const monthlyAverage = calculateAverage(snapshots, 30);

    return NextResponse.json({
      project,
      healthHistory: {
        snapshots,
        trend,
        weeklyAverage,
        monthlyAverage,
      },
    });
  }

  return NextResponse.json({ project });
}

function calculateTrend(snapshots: HealthSnapshot[]): 'improving' | 'worsening' | 'stable' {
  if (snapshots.length < 2) return 'stable';
  const recentSlice = snapshots.slice(0, 3);
  const olderSlice = snapshots.slice(3, 6);
  if (olderSlice.length === 0) return 'stable';
  const recentAvg = recentSlice.reduce((sum, s) => sum + s.healthScore, 0) / recentSlice.length;
  const olderAvg = olderSlice.reduce((sum, s) => sum + s.healthScore, 0) / olderSlice.length;
  const diff = recentAvg - olderAvg;
  if (diff > 3) return 'improving';
  if (diff < -3) return 'worsening';
  return 'stable';
}

function calculateAverage(snapshots: HealthSnapshot[], days: number): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const relevantSnapshots = snapshots.filter((s) => new Date(s.scannedAt) >= cutoff);
  if (relevantSnapshots.length === 0) {
    return snapshots.length > 0 ? snapshots[0].healthScore : 0;
  }
  return Math.round(
    relevantSnapshots.reduce((sum, s) => sum + s.healthScore, 0) / relevantSnapshots.length
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // CSRF protection for state-changing operation
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

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
