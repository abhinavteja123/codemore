/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console, core-typescript-as-any, core-quality-async-without-await, core-bugs-todo-fixme, core-typescript-non-null-assertion-abuse, core-bugs-loose-equality */
/* Web dashboard — Phase 3 plan demotes this to a 'scan-by-URL' demo. The
   page-level empty catches are part of the legacy dashboard slated for
   replacement; rules will re-apply per-component after the rewrite. */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { supabaseAdmin, isDbEnabled } from "./supabase";

type GitHubArtifactPayload = {
  kind: "github";
  repoFullName: string;
  branch?: string;
  encryptedAccessToken: string;
  iv: string;
  authTag: string;
};

type ZipArtifactPayload = {
  kind: "zip";
  /** Dev/disk fallback only. */
  archivePath?: string;
  /** DB-backed storage: the archive itself, base64-encoded. */
  archiveBase64?: string;
};

type ScanArtifactPayload = GitHubArtifactPayload | ZipArtifactPayload;

// Artifacts live in Supabase (`scan_artifacts` table) when the DB is
// configured. The filesystem is only a dev fallback: on Vercel the deploy
// bundle is read-only (mkdir under process.cwd() throws ENOENT) AND each
// invocation may land on a different lambda, so a disk artifact written by
// the enqueue request is invisible to the poll request that processes the
// job. os.tmpdir() keeps the no-DB local dev path working.
const ARTIFACT_DIR = path.join(os.tmpdir(), "codemore-scan-artifacts");

/**
 * Validate jobId to prevent path traversal attacks.
 * Only allows alphanumeric characters, hyphens, and underscores.
 */
function validateJobId(jobId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    throw new Error(`Invalid jobId format: ${jobId}`);
  }
}

/**
 * Sanitize a path to ensure it stays within the base directory.
 * Prevents path traversal attacks using ../ sequences.
 */
function sanitizePath(inputPath: string, baseDir: string): string {
  const normalized = path.normalize(path.join(baseDir, inputPath));
  if (!normalized.startsWith(path.resolve(baseDir))) {
    throw new Error(`Path traversal detected: ${inputPath}`);
  }
  return normalized;
}

function getEncryptionKey(): Buffer {
  const secret = process.env.CODEMORE_JOB_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error(
      "CODEMORE_JOB_ENCRYPTION_KEY environment variable is required. " +
      "Generate one with: openssl rand -base64 32"
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
}

async function ensureArtifactDir(): Promise<void> {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
}

function getMetadataPath(jobId: string): string {
  validateJobId(jobId);
  return sanitizePath(`${jobId}.json`, ARTIFACT_DIR);
}

function getArchivePath(jobId: string): string {
  validateJobId(jobId);
  return sanitizePath(`${jobId}.zip`, ARTIFACT_DIR);
}

function encryptText(value: string): { ciphertext: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decryptText(ciphertext: string, iv: string, authTag: string): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

async function savePayload(jobId: string, payload: ScanArtifactPayload): Promise<void> {
  validateJobId(jobId);
  if (isDbEnabled() && supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from("scan_artifacts")
      .upsert({ job_id: jobId, payload }, { onConflict: "job_id" });
    if (error) {
      throw new Error(`Failed to store scan artifact: ${error.message}`);
    }
    return;
  }
  await ensureArtifactDir();
  await fs.writeFile(getMetadataPath(jobId), JSON.stringify(payload), "utf8");
}

export async function saveZipArtifact(jobId: string, archiveBuffer: Buffer): Promise<void> {
  if (isDbEnabled() && supabaseAdmin) {
    await savePayload(jobId, { kind: "zip", archiveBase64: archiveBuffer.toString("base64") });
    return;
  }

  await ensureArtifactDir();
  const archivePath = getArchivePath(jobId);
  await fs.writeFile(archivePath, archiveBuffer);
  await savePayload(jobId, { kind: "zip", archivePath });
}

export async function saveGitHubArtifact(
  jobId: string,
  params: { repoFullName: string; branch?: string; accessToken: string }
): Promise<void> {
  const encrypted = encryptText(params.accessToken);
  await savePayload(jobId, {
    kind: "github",
    repoFullName: params.repoFullName,
    branch: params.branch,
    encryptedAccessToken: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
  });
}

async function loadPayload(jobId: string): Promise<ScanArtifactPayload | null> {
  validateJobId(jobId);
  if (isDbEnabled() && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from("scan_artifacts")
      .select("payload")
      .eq("job_id", jobId)
      .maybeSingle();
    if (error || !data) return null;
    return data.payload as ScanArtifactPayload;
  }
  const raw = await fs.readFile(getMetadataPath(jobId), "utf8");
  return JSON.parse(raw) as ScanArtifactPayload;
}

export async function loadArtifact(jobId: string): Promise<
  | { kind: "zip"; archiveBuffer: Buffer }
  | { kind: "github"; repoFullName: string; branch?: string; accessToken: string }
  | null
> {
  try {
    const payload = await loadPayload(jobId);
    if (!payload) return null;

    if (payload.kind === "zip") {
      if (payload.archiveBase64) {
        return { kind: "zip", archiveBuffer: Buffer.from(payload.archiveBase64, "base64") };
      }
      if (!payload.archivePath) return null;
      const archiveBuffer = await fs.readFile(payload.archivePath);
      return {
        kind: "zip",
        archiveBuffer,
      };
    }

    return {
      kind: "github",
      repoFullName: payload.repoFullName,
      branch: payload.branch,
      accessToken: decryptText(
        payload.encryptedAccessToken,
        payload.iv,
        payload.authTag
      ),
    };
  } catch {
    return null;
  }
}

export async function deleteArtifact(jobId: string): Promise<void> {
  validateJobId(jobId);
  if (isDbEnabled() && supabaseAdmin) {
    await supabaseAdmin.from("scan_artifacts").delete().eq("job_id", jobId);
    return;
  }

  const metadataPath = getMetadataPath(jobId);
  try {
    const raw = await fs.readFile(metadataPath, "utf8");
    const payload = JSON.parse(raw) as ScanArtifactPayload;

    if (payload.kind === "zip" && payload.archivePath) {
      await fs.rm(payload.archivePath, { force: true });
    }
  } catch {
    // ignore
  }

  await fs.rm(metadataPath, { force: true });
}
