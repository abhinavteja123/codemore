import { Project, ScanJob } from "./types";

type ScanJobResponsePayload = {
  job?: ScanJob;
  project?: Project | null;
  error?: string;
};

export async function waitForScanJobCompletion(jobId: string): Promise<{
  job: ScanJob;
  project: Project | null;
}> {
  for (;;) {
    const response = await fetch(`/api/scan-jobs/${jobId}`);
    const payload = (await response
      .json()
      .catch(() => ({}))) as ScanJobResponsePayload;

    if (!response.ok) {
      throw new Error(payload.error || "Failed to fetch scan job status");
    }

    if (!payload.job) {
      throw new Error("Scan job response did not include job details");
    }

    const job = payload.job;
    if (job.status === "completed") {
      return {
        job,
        project: payload.project || null,
      };
    }

    if (job.status === "failed") {
      throw new Error(job.errorMessage || "Scan failed");
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}
