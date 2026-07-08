import type { ClaudeOrchestratorApi } from '../preload/index';

declare global {
  interface Window {
    claudeOrchestrator: ClaudeOrchestratorApi;
  }
}

export {};
