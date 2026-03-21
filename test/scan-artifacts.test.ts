import { strict as assert } from "assert";
import crypto from "crypto";
import { deleteArtifact, loadArtifact, saveGitHubArtifact, saveZipArtifact } from "../web/src/lib/scanArtifacts";

describe("scan artifacts", () => {
  it("round-trips encrypted GitHub metadata", async () => {
    const jobId = `job-${crypto.randomUUID()}`;

    await saveGitHubArtifact(jobId, {
      repoFullName: "owner/repo",
      branch: "main",
      accessToken: "secret-token",
    });

    const artifact = await loadArtifact(jobId);
    assert.equal(artifact?.kind, "github");
    assert.equal(artifact?.repoFullName, "owner/repo");
    assert.equal(artifact?.branch, "main");
    assert.equal(artifact?.accessToken, "secret-token");

    await deleteArtifact(jobId);
    const deleted = await loadArtifact(jobId);
    assert.equal(deleted, null);
  });

  it("round-trips ZIP payloads", async () => {
    const jobId = `job-${crypto.randomUUID()}`;
    const zipBuffer = Buffer.from("fake-zip-content");

    await saveZipArtifact(jobId, zipBuffer);

    const artifact = await loadArtifact(jobId);
    assert.equal(artifact?.kind, "zip");
    assert.equal(Buffer.compare(artifact!.archiveBuffer, zipBuffer), 0);

    await deleteArtifact(jobId);
    const deleted = await loadArtifact(jobId);
    assert.equal(deleted, null);
  });
});
