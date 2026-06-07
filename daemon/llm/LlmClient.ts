/**
 * LlmClient — Unified LLM Provider Interface
 *
 * The aiService.ts monolith (~1.8k LOC) embeds OpenAI, Anthropic, Gemini, and
 * local-LLM call paths inline. New work goes through this interface; the
 * monolith is migrated provider-by-provider in subsequent phases.
 *
 * Design rules:
 *   - Provider adapters are stateless. State (rate limits, retries, caches)
 *     lives in the caller or in a wrapper, not in the adapter.
 *   - No provider-specific types leak through. Inputs/outputs are plain.
 *   - Errors are normalised to LlmError so the agentic loop can branch on
 *     reason (rate-limit, content-filter, transport) without sniffing strings.
 */

export type LlmProviderId = 'openai' | 'anthropic' | 'gemini' | 'local';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  /** Provider-specific model id (e.g. 'gpt-4o-mini', 'claude-haiku-4-5'). */
  model: string;
  messages: LlmMessage[];
  /** 0..2. Adapters clamp to provider-valid range. */
  temperature?: number;
  maxTokens?: number;
  /** Stop sequences. */
  stop?: string[];
  /**
   * If the caller wants structured JSON, set this to a JSON Schema.
   * Adapters use the provider-native structured-output mode when available
   * and fall back to prompt-instructed JSON otherwise.
   */
  responseSchema?: object;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmResponse {
  text: string;
  /** Parsed JSON when responseSchema was set and parsing succeeded. */
  json?: unknown;
  usage?: LlmUsage;
  finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-use' | 'error';
  raw?: unknown;
}

export type LlmErrorReason =
  | 'auth'
  | 'rate-limit'
  | 'context-length'
  | 'content-filter'
  | 'invalid-request'
  | 'transport'
  | 'server'
  | 'cancelled'
  | 'unknown';

export class LlmError extends Error {
  constructor(
    public readonly reason: LlmErrorReason,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmClient {
  readonly provider: LlmProviderId;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/**
 * Tiny factory placeholder. Concrete adapters land in
 *   daemon/llm/openai.ts
 *   daemon/llm/anthropic.ts
 *   daemon/llm/gemini.ts
 *   daemon/llm/local.ts
 * during the aiService.ts decomposition.
 */
export interface LlmClientFactory {
  create(provider: LlmProviderId, apiKey: string, opts?: Record<string, unknown>): LlmClient;
}
