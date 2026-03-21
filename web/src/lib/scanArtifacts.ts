import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

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
  archivePath: string;
};

type ScanArtifactPayload = GitHubArtifactPayload | ZipArtifactPayload;

const ARTIFACT_DIR = path.join(process.cwd(), ".scan-artifacts");

function getEncryptionKey(): Buffer {
  const secret =
    process.env.CODEMORE_JOB_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "codemore-dev-secret";

  return crypto.createHash("sha256").update(secret).digest();
}

async function ensureArtifactDir(): Promise<void> {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
}

function getMetadataPath(jobId: string): string {
  return path.join(ARTIFACT_DIR, `${jobId}.json`);
}

function getArchivePath(jobId: string): string {
  return path.join(ARTIFACT_DIR, `${jobId}.zip`);
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

export async function saveZipArtifact(jobId: string, archiveBuffer: Buffer): Promise<void> {
  await ensureArtifactDir();

  const archivePath = getArchivePath(jobId);
  await fs.writeFile(archivePath, archiveBuffer);

  const payload: ZipArtifactPayload = {
    kind: "zip",
    archivePath,
  };

  await fs.writeFile(getMetadataPath(jobId), JSON.stringify(payload), "utf8");
}

export async function saveGitHubArtifact(
  jobId: string,
  params: { repoFullName: string; branch?: string; accessToken: string }
): Promise<void> {
  await ensureArtifactDir();

  const encrypted = encryptText(params.accessToken);
  const payload: GitHubArtifactPayload = {
    kind: "github",
    repoFullName: params.repoFullName,
    branch: params.branch,
    encryptedAccessToken: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
  };

  await fs.writeFile(getMetadataPath(jobId), JSON.stringify(payload), "utf8");
}

export async function loadArtifact(jobId: string): Promise<
  | { kind: "zip"; archiveBuffer: Buffer }
  | { kind: "github"; repoFullName: string; branch?: string; accessToken: string }
  | null
> {
  try {
    const raw = await fs.readFile(getMetadataPath(jobId), "utf8");
    const payload = JSON.parse(raw) as ScanArtifactPayload;

    if (payload.kind === "zip") {
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
  const metadataPath = getMetadataPath(jobId);
  try {
    const raw = await fs.readFile(metadataPath, "utf8");
    const payload = JSON.parse(raw) as ScanArtifactPayload;

    if (payload.kind === "zip") {
      await fs.rm(payload.archivePath, { force: true });
    }
  } catch {
    // ignore
  }

  await fs.rm(metadataPath, { force: true });
}
