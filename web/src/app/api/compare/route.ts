import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { validateCsrf } from '@/lib/csrf';
import { getScanIssues, getHealthHistory } from '@/lib/database';
import { UuidSchema } from '@/lib/validation';
import { z } from 'zod';

const CompareSchema = z.object({
  baseScanId: UuidSchema,
  headScanId: UuidSchema,
});

export interface ScanComparison {
  baseScanId: string;
  headScanId: string;
  baseScore: number;
  headScore: number;
  scoreDelta: number;
  newIssues: Array<{ severity: string; title: string; filePath: string; line: number }>;
  fixedIssues: Array<{ severity: string; title: string; filePath: string; line: number }>;
  newBlockers: number;
  newCriticals: number;
  regressionDetected: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse<ScanComparison | { error: string }>> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError as NextResponse<{ error: string }>;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CompareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { baseScanId, headScanId } = parsed.data;

  try {
    const [baseIssues, headIssues] = await Promise.all([
      getScanIssues(baseScanId),
      getScanIssues(headScanId),
    ]);

    // Create lookup keys for deduplication
    const makeKey = (i: { file_path?: string | null; line_start?: number | null; title?: string }) =>
      `${i.file_path ?? ''}:${i.line_start ?? 0}:${i.title ?? ''}`;

    const baseKeys = new Set(baseIssues.map(makeKey));
    const headKeys = new Set(headIssues.map(makeKey));

    const newIssues = headIssues.filter(i => !baseKeys.has(makeKey(i)));
    const fixedIssues = baseIssues.filter(i => !headKeys.has(makeKey(i)));

    const countSeverity = (issues: typeof newIssues, sev: string) =>
      issues.filter(i => i.severity?.toUpperCase() === sev).length;

    // Get health scores from history for both scans
    // We need to find the project ID first - assume both scans belong to same project
    const baseHistory = await getHealthHistory(baseScanId);
    const headHistory = await getHealthHistory(headScanId);

    const baseScore = baseHistory.find(h => h.scan_id === baseScanId)?.health_score ?? 0;
    const headScore = headHistory.find(h => h.scan_id === headScanId)?.health_score ?? 0;

    const comparison: ScanComparison = {
      baseScanId,
      headScanId,
      baseScore,
      headScore,
      scoreDelta: headScore - baseScore,
      newIssues: newIssues.map(i => ({
        severity: i.severity,
        title: i.title,
        filePath: i.file_path ?? '',
        line: i.line_start ?? 0,
      })),
      fixedIssues: fixedIssues.map(i => ({
        severity: i.severity,
        title: i.title,
        filePath: i.file_path ?? '',
        line: i.line_start ?? 0,
      })),
      newBlockers: countSeverity(newIssues, 'BLOCKER'),
      newCriticals: countSeverity(newIssues, 'CRITICAL'),
      regressionDetected: countSeverity(newIssues, 'BLOCKER') > 0 ||
                          countSeverity(newIssues, 'CRITICAL') > 0,
    };

    return NextResponse.json(comparison);
  } catch (error) {
    console.error('Compare endpoint error:', error);
    return NextResponse.json({ error: 'Failed to compare scans' }, { status: 500 });
  }
}
