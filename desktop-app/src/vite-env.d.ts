/// <reference types="vite/client" />

import type { GenerateRequest } from './types';

declare global {
  interface Window {
    xilankapuDesktopApi?: {
      submitGeneration(request: GenerateRequest): Promise<{ success: boolean; generationId: string; taskIds: string[] }>;
      checkGenerationStatus(generationId: string): Promise<Record<string, unknown>>;
      getGeneration(generationId: string): Promise<Record<string, unknown> | null>;
    };
  }
}
