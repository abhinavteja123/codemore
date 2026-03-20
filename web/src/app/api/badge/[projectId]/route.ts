import { NextRequest, NextResponse } from "next/server";
import { getLatestScan } from "@/lib/database";

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per minute
const WINDOW_MS = 60_000;

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  // Rate limiting
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= RATE_LIMIT) {
      return new NextResponse("Rate limited", { status: 429, headers: { "Retry-After": "60" } });
    }
    entry.count++;
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }
  // Clean old entries periodically
  if (rateLimitMap.size > 10000) {
    rateLimitMap.forEach((val, key) => {
      if (val.resetAt < now) rateLimitMap.delete(key);
    });
  }

  // Validate projectId
  if (!params.projectId || params.projectId.length > 100) {
    return new NextResponse("Invalid project ID", { status: 400 });
  }

  const scan = await getLatestScan(params.projectId);

  const score = scan ? Math.round(scan.overall_score) : null;
  const color = score === null
    ? "#9e9e9e"
    : score >= 80
    ? "#4caf50"
    : score >= 60
    ? "#ff9800"
    : "#f44336";
  const label = "CodeMore";
  const value = score !== null ? `${score}/100` : "N/A";

  const labelWidth = label.length * 7 + 10;
  const valueWidth = value.length * 7 + 10;
  const totalWidth = labelWidth + valueWidth;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="13">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="13">${value}</text>
  </g>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
}
