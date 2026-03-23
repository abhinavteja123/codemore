import {
  claimNextQueuedScanJob,
  createProject,
  getProjectById,
  getProjectFiles,
  getProjectSnapshot,
  mapDbScanJob,
  recordHealthSnapshot,
  resetStaleRunningScanJobs,
  saveProjectFiles,
  saveScan,
  updateScanJob,
} from "./database";
import { analyzeProjectWithProductionCore } from "./productionAnalyzer";
import { createScanJob, getProject } from "./database";
import { extractProjectFilesFromZipBuffer, fetchGitHubRepoFiles, filterProjectFiles } from "./sourceIngestion";
import { Project, ProjectFile, ScanJob } from "./types";
import { isDbEnabled } from "./supabase";
import { deleteArtifact, loadArtifact } from "./scanArtifacts";
import { logger, sanitizeError } from './logger';

type JobSource = "upload" | "github";

type BaseJobRequest = {
  userEmail: string;
  projectId?: string;
  name: string;
  source: JobSource;
  repoFullName?: string;
  sourceLabel: string;
};

type FileScanRequest = BaseJobRequest & {
  type: "files";
  files: ProjectFile[];
};

type GitHubScanRequest = BaseJobRequest & {
  type: "github";
  repoFullName: string;
  accessToken: string;
  branch?: string;
};

type ZipScanRequest = BaseJobRequest & {
  type: "zip";
  archiveName: string;
  archiveBuffer: Buffer;
};

type ScanJobRequest = FileScanRequest | GitHubScanRequest | ZipScanRequest;

type EnqueueResult = {
  job: ScanJob | null;
  projectId: string;
  project?: Project;
  queued: boolean;
};

let workerScheduled = false;
let workerActive = false;

export function kickScanQueue(): void {
  if (workerScheduled || workerActive || !isDbEnabled()) {
    return;
  }

  workerScheduled = true;
  setTimeout(() => {
    workerScheduled = false;
    void processQueueLoop();
  }, 0);
}

async function processQueueLoop(): Promise<void> {
  if (workerActive || !isDbEnabled()) {
    return;
  }

  workerActive = true;

  try {
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await resetStaleRunningScanJobs(staleBefore);

    for (;;) {
      const job = await claimNextQueuedScanJob();
      if (!job) {
        break;
      }

      try {
        await executePersistedJob(job.id, job.project_id);
      } catch (error) {
        logger.error({ err: sanitizeError(error) }, "[scanJobRunner] Job failed");
        await updateScanJob(job.id, {
          status: "failed",
          error_message: error instanceof Error ? error.message : "Scan failed",
          completed_at: new Date().toISOString(),
        });
        await deleteArtifact(job.id);
      }
    }
  } finally {
    workerActive = false;
  }
}

async function executePersistedJob(jobId: string, projectId: string): Promise<void> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error("Failed to resolve project for scan job.");
  }

  let files = await getProjectFiles(project.id);
  if (files.length === 0) {
    const artifact = await loadArtifact(jobId);
    if (artifact?.kind === "zip") {
      files = await extractProjectFilesFromZipBuffer(artifact.archiveBuffer);
    } else if (artifact?.kind === "github") {
      files = await fetchGitHubRepoFiles({
        accessToken: artifact.accessToken,
        repoFullName: artifact.repoFullName,
        branch: artifact.branch,
      });
    }

    if (files.length > 0) {
      const persisted = await saveProjectFiles(project.id, files);
      if (!persisted) {
        throw new Error("Failed to persist fetched source files.");
      }
    }
  }

  if (files.length === 0) {
    throw new Error("No supported source files found for analysis.");
  }

  const result = await analyzeProjectWithProductionCore(files);
  const scan = await saveScan(project.id, result.metrics, result.issues);

  // Record health snapshot for trend tracking and regression detection
  if (scan) {
    await recordHealthSnapshot(
      project.id,
      scan.id,
      result.issues,
      result.metrics.filesAnalyzed,
      result.metrics.overallScore
    );
  }

  await updateScanJob(jobId, {
    status: "completed",
    files_discovered: files.length,
    files_analyzed: result.metrics.filesAnalyzed,
    issue_count: result.issues.length,
    completed_at: new Date().toISOString(),
  });
  await deleteArtifact(jobId);
}

async function runInlineFallback(request: ScanJobRequest): Promise<Project> {
  const project =
    (request.projectId
      ? await getProject(request.projectId, request.userEmail)
      : await createProject(
          request.userEmail,
          request.name,
          request.source,
          request.repoFullName
        )) || null;

  let files: ProjectFile[] = [];
  switch (request.type) {
    case "files":
      files = filterProjectFiles(request.files);
      break;
    case "github":
      files = await fetchGitHubRepoFiles({
        accessToken: request.accessToken,
        repoFullName: request.repoFullName,
        branch: request.branch,
      });
      break;
    case "zip":
      files = await extractProjectFilesFromZipBuffer(request.archiveBuffer);
      break;
  }

  if (files.length === 0) {
    throw new Error("No supported source files found for analysis.");
  }

  const result = await analyzeProjectWithProductionCore(files);

  if (project) {
    await saveProjectFiles(project.id, files);
    await saveScan(project.id, result.metrics, result.issues);
  }

  return {
    id: project?.id || request.projectId || `${request.source}-${Date.now()}`,
    name: project?.name || request.name,
    source: request.source,
    repoFullName: request.repoFullName,
    files,
    analyzedAt: Date.now(),
    metrics: result.metrics,
    issues: result.issues,
  };
}

async function enqueuePreparedFilesScan(
  request: BaseJobRequest & { files: ProjectFile[] }
): Promise<EnqueueResult> {
  if (!isDbEnabled()) {
    const project = await runInlineFallback({
      type: "files",
      ...request,
      files: request.files,
    });
    return {
      job: null,
      projectId: project.id,
      project,
      queued: false,
    };
  }

  const project =
    (request.projectId
      ? await getProject(request.projectId, request.userEmail)
      : await createProject(
          request.userEmail,
          request.name,
          request.source,
          request.repoFullName
        )) || null;

  if (!project) {
    throw new Error("Failed to create project for scan.");
  }

  const persisted = await saveProjectFiles(project.id, request.files);
  if (!persisted) {
    throw new Error("Failed to persist project files for scan.");
  }

  const dbJob = await createScanJob(project.id, request.source, request.sourceLabel);
  if (!dbJob) {
    throw new Error("Failed to create scan job.");
  }

  const updatedJob = await updateScanJob(dbJob.id, {
    files_discovered: request.files.length,
  });
  kickScanQueue();

  return {
    job: mapDbScanJob(updatedJob || dbJob),
    projectId: project.id,
    queued: true,
  };
}

export async function enqueueFileScanJob(params: {
  userEmail: string;
  projectId?: string;
  name: string;
  source?: JobSource;
  repoFullName?: string;
  files: ProjectFile[];
}): Promise<EnqueueResult> {
  const files = filterProjectFiles(params.files);
  if (files.length === 0) {
    throw new Error("No supported source files found for analysis.");
  }

  return enqueuePreparedFilesScan({
    userEmail: params.userEmail,
    projectId: params.projectId,
    name: params.name,
    source: params.source || "upload",
    repoFullName: params.repoFullName,
    sourceLabel: params.repoFullName || params.name,
    files,
  });
}

export async function enqueueGitHubScanJob(params: {
  userEmail: string;
  projectId?: string;
  name: string;
  repoFullName: string;
  accessToken: string;
  branch?: string;
}): Promise<EnqueueResult> {
  const files = await fetchGitHubRepoFiles({
    accessToken: params.accessToken,
    repoFullName: params.repoFullName,
    branch: params.branch,
  });

  if (files.length === 0) {
    throw new Error("No analyzable source files found in this repository.");
  }

  return enqueuePreparedFilesScan({
    userEmail: params.userEmail,
    projectId: params.projectId,
    name: params.name,
    source: "github",
    repoFullName: params.repoFullName,
    sourceLabel: params.repoFullName,
    files,
  });
}

export async function enqueueZipScanJob(params: {
  userEmail: string;
  projectId?: string;
  name: string;
  archiveName: string;
  archiveBuffer: Buffer;
}): Promise<EnqueueResult> {
  const files = await extractProjectFilesFromZipBuffer(params.archiveBuffer);
  if (files.length === 0) {
    throw new Error("No supported source files found in the ZIP archive.");
  }

  return enqueuePreparedFilesScan({
    userEmail: params.userEmail,
    projectId: params.projectId,
    name: params.name,
    source: "upload",
    sourceLabel: params.archiveName,
    files,
  });
}

export async function getCompletedProjectSnapshot(
  projectId: string,
  userEmail: string
): Promise<Project | null> {
  return getProjectSnapshot(projectId, userEmail, true);
}
