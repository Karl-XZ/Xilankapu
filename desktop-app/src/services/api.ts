import type { CandidateResult, GenerateRequest, GenerationTask } from '../types';

const API_BASE = '/api';
type DesktopBridge = {
  submitGeneration(request: GenerateRequest): Promise<{ success: boolean; generationId: string; taskIds: string[] }>;
  checkGenerationStatus(generationId: string): Promise<Record<string, unknown>>;
  getGeneration(generationId: string): Promise<Record<string, unknown> | null>;
};

function getDesktopBridge() {
  return (window as Window & { xilankapuDesktopApi?: DesktopBridge }).xilankapuDesktopApi;
}

async function readJson<T>(response: Response) {
  const raw = await response.text();
  const payload = raw ? (JSON.parse(raw) as T & { error?: string }) : ({} as T & { error?: string });
  if (!response.ok) {
    throw new Error(payload.error || `请求失败(${response.status})`);
  }
  return payload as T;
}

function normalizeTask(payload: Record<string, unknown>) {
  return {
    id: String(payload.id || ''),
    createdAt: String(payload.createdAt || payload.created_at || new Date().toISOString()),
    request: payload.request as GenerationTask['request'],
    status: payload.status as GenerationTask['status'],
    progress: payload.progress as GenerationTask['progress'],
    candidates: (payload.candidates || []) as CandidateResult[],
    errorMessage: (payload.errorMessage || payload.error_message || undefined) as string | undefined,
  } satisfies GenerationTask;
}

export async function submitGeneration(request: GenerateRequest) {
  const desktopBridge = getDesktopBridge();
  if (desktopBridge) {
    return desktopBridge.submitGeneration(request);
  }

  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  return readJson<{ success: boolean; generationId: string; taskIds: string[] }>(response);
}

export async function checkGenerationStatus(generationId: string) {
  const desktopBridge = getDesktopBridge();
  if (desktopBridge) {
    const payload = await desktopBridge.checkGenerationStatus(generationId);
    return normalizeTask(payload);
  }

  const response = await fetch(`${API_BASE}/generations/${generationId}/status`);
  const payload = await readJson<Record<string, unknown>>(response);
  return normalizeTask(payload);
}

export async function getGeneration(generationId: string) {
  const desktopBridge = getDesktopBridge();
  if (desktopBridge) {
    const payload = await desktopBridge.getGeneration(generationId);
    return payload ? normalizeTask(payload) : null;
  }

  const response = await fetch(`${API_BASE}/generations/${generationId}`);
  if (response.status === 404) {
    return null;
  }
  const payload = await readJson<Record<string, unknown>>(response);
  return normalizeTask(payload);
}

export function applyFavoriteToCandidates(
  candidates: CandidateResult[],
  favorites: Set<string>,
) {
  return candidates.map((candidate) => ({
    ...candidate,
    favorite: favorites.has(candidate.id),
  }));
}
