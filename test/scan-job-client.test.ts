import { strict as assert } from "assert";
import { waitForScanJobCompletion } from "../web/src/lib/scanJobClient";
import { Project, ScanJob } from "../web/src/lib/types";

describe("scan job client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("polls until the scan job completes", async () => {
    const responses: Array<{ job: ScanJob; project: Project | null }> = [
      {
        job: {
          id: "job-1",
          projectId: "project-1",
          status: "queued",
          source: "upload",
          sourceLabel: "archive.zip",
          filesDiscovered: 0,
          filesAnalyzed: 0,
          issueCount: 0,
          createdAt: new Date().toISOString(),
        },
        project: null,
      },
      {
        job: {
          id: "job-1",
          projectId: "project-1",
          status: "completed",
          source: "upload",
          sourceLabel: "archive.zip",
          filesDiscovered: 3,
          filesAnalyzed: 3,
          issueCount: 1,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        project: {
          id: "project-1",
          name: "Test Project",
          source: "upload",
          files: [],
        },
      },
    ];

    global.fetch = (async () => {
      const payload = responses.shift()!;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await waitForScanJobCompletion("job-1");
    assert.equal(result.job.status, "completed");
    assert.equal(result.project?.id, "project-1");
  });

  it("throws when the scan job fails", async () => {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          job: {
            id: "job-2",
            projectId: "project-2",
            status: "failed",
            source: "github",
            sourceLabel: "owner/repo",
            filesDiscovered: 0,
            filesAnalyzed: 0,
            issueCount: 0,
            errorMessage: "Worker failed",
            createdAt: new Date().toISOString(),
          },
          project: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )) as typeof fetch;

    await assert.rejects(
      () => waitForScanJobCompletion("job-2"),
      /Worker failed/
    );
  });
});
