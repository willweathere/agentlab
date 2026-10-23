import type { AgentRole } from '../types';
import type { StageProcessor } from './shared';

/**
 * The future AI-processing seam. Nothing in v1 calls a model.
 *
 * An AI-backed processor would implement `StageProcessor` with `mode: 'ai'`, receive the same
 * envelope and parsed instructions (including the free-text notes the deterministic
 * processors ignore), and return the same typed payload. It would have to run behind a
 * server-side endpoint, because API keys must never ship in the frontend bundle. Its output
 * would still pass through the Reviewer, which already assumes the Analyst can be wrong.
 */
export interface AiProcessorAdapter {
  role: AgentRole;
  /** Server endpoint that holds the API key and calls the model. Never a key in the client. */
  endpoint: string;
  toProcessor(): StageProcessor;
}

/** v1 ships with no AI adapters. The registry in ./index.ts only knows deterministic processors. */
export const AI_ADAPTERS: readonly AiProcessorAdapter[] = [];
