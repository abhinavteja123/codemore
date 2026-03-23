import { Project, ScanJob } from "./types";

type ScanJobResponsePayload = {
  job?: ScanJob;
  project?: Project | null;
  error?: string;
};

// Circuit breaker configuration
const MAX_POLL_ATTEMPTS = 150; // ~3 minutes at average intervals
const MAX_CONSECUTIVE_FAILURES = 5;
const BASE_DELAY_MS = 1200;
const MAX_DELAY_MS = 5000;
const CIRCUIT_RESET_MS = 30000; // 30 seconds

// Circuit breaker state
interface CircuitBreakerState {
  consecutiveFailures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

const circuitBreaker: CircuitBreakerState = {
  consecutiveFailures: 0,
  lastFailureTime: 0,
  isOpen: false,
};

function resetCircuitBreaker(): void {
  circuitBreaker.consecutiveFailures = 0;
  circuitBreaker.isOpen = false;
}

function recordFailure(): void {
  circuitBreaker.consecutiveFailures++;
  circuitBreaker.lastFailureTime = Date.now();

  if (circuitBreaker.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    circuitBreaker.isOpen = true;
  }
}

function checkCircuitBreaker(): void {
  if (!circuitBreaker.isOpen) return;

  // Check if enough time has passed to try again
  const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailureTime;
  if (timeSinceLastFailure >= CIRCUIT_RESET_MS) {
    // Half-open state: allow one attempt
    circuitBreaker.isOpen = false;
    circuitBreaker.consecutiveFailures = Math.floor(MAX_CONSECUTIVE_FAILURES / 2);
  } else {
    throw new Error(
      "Service temporarily unavailable after multiple failures. " +
      "Please try again in a few seconds."
    );
  }
}

function calculateDelay(attempt: number): number {
  // Exponential backoff with jitter
  const exponentialDelay = BASE_DELAY_MS * Math.pow(1.5, Math.min(attempt, 10));
  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);
  const jitter = cappedDelay * 0.1 * Math.random();
  return Math.floor(cappedDelay + jitter);
}

export async function waitForScanJobCompletion(jobId: string): Promise<{
  job: ScanJob;
  project: Project | null;
}> {
  let attempt = 0;

  while (attempt < MAX_POLL_ATTEMPTS) {
    // Check circuit breaker before making request
    checkCircuitBreaker();

    try {
      const response = await fetch(`/api/scan-jobs/${jobId}`);
      const payload = (await response.json().catch(() => ({}))) as ScanJobResponsePayload;

      if (!response.ok) {
        recordFailure();

        // Check if circuit breaker just opened
        if (circuitBreaker.isOpen) {
          throw new Error(
            "Service unavailable after multiple consecutive failures. " +
            "Please try again later."
          );
        }

        throw new Error(payload.error || `Failed to fetch scan job status (HTTP ${response.status})`);
      }

      // Success - reset consecutive failure count
      resetCircuitBreaker();

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

      // Job still processing - wait with exponential backoff
      const delay = calculateDelay(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;

    } catch (error) {
      // If it's a circuit breaker error or job failure, re-throw immediately
      if (error instanceof Error) {
        if (
          error.message.includes("Service unavailable") ||
          error.message.includes("Scan failed") ||
          error.message.includes("did not include job details")
        ) {
          throw error;
        }
      }

      // Network error - record failure and continue
      recordFailure();

      if (circuitBreaker.isOpen) {
        throw new Error(
          "Network connection unstable. " +
          "Please check your connection and try again."
        );
      }

      // Wait before retry
      const delay = calculateDelay(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }

  throw new Error(
    `Scan job timed out after ${MAX_POLL_ATTEMPTS} attempts (~3 minutes). ` +
    "The analysis may still complete - check your dashboard."
  );
}
