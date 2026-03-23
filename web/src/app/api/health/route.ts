import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  version: string;
  checks: {
    database: "ok" | "error";
    environment: "ok" | "missing_vars";
  };
}

const REQUIRED_ENV_VARS = [
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const checks: HealthStatus["checks"] = {
    database: "ok",
    environment: "ok",
  };

  // Check required env vars
  const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    checks.environment = "missing_vars";
  }

  // Check database connectivity
  if (supabase) {
    try {
      const { error } = await supabase.from("projects").select("id").limit(1);
      if (error) checks.database = "error";
    } catch {
      checks.database = "error";
    }
  } else {
    checks.database = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  const anyDown = checks.database === "error";

  const status: HealthStatus = {
    status: allOk ? "ok" : anyDown ? "down" : "degraded",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "unknown",
    checks,
  };

  return NextResponse.json(status, {
    status: allOk ? 200 : anyDown ? 503 : 207,
    headers: { "Cache-Control": "no-store" },
  });
}
