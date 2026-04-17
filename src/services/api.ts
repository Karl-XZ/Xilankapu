import type { CandidatePlan, CandidateResult, GenerateRequest, GenerationTask } from '../types';

const generationStore = new Map<string, GenerationTask>();
const generationListeners = new Map<string, Set<(task: GenerationTask) => void>>();

const DEFAULT_ARK_MODEL_ID = 'doubao-seedream-4-5-251128';
const DEFAULT_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

interface ArkImagesResponse {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    code?: string;
    message?: string;
  };
}

interface BrowserApiSettings {
  apiKey: string;
  modelId: string;
  baseUrl: string;
  useMock: boolean;
}

const runtimeSettings: BrowserApiSettings = {
  apiKey: '',
  modelId: DEFAULT_ARK_MODEL_ID,
  baseUrl: DEFAULT_ARK_BASE_URL,
  useMock: false,
};

function normalizeBaseUrl(baseUrl: string) {
  return (baseUrl || DEFAULT_ARK_BASE_URL).replace(/\/+$/, '');
}

function isSeedEditModel(modelId: string) {
  return modelId.toLowerCase().includes('seededit');
}

function normalizeInputImage(image: string) {
  return image.startsWith('data:') ? image : `data:image/png;base64,${image}`;
}

function buildArkImageInput(modelId: string, uploadedImages: string[]) {
  const normalizedImages = uploadedImages
    .filter((image): image is string => typeof image === 'string' && image.length > 0)
    .map(normalizeInputImage);

  if (normalizedImages.length === 0) {
    throw new Error('At least one reference image is required.');
  }

  if (normalizedImages.length === 1 || isSeedEditModel(modelId)) {
    return normalizedImages[0];
  }

  return normalizedImages.slice(0, 8);
}

function getPlannedCandidates(request: GenerateRequest): CandidatePlan[] {
  if (Array.isArray(request.candidatePlans) && request.candidatePlans.length > 0) {
    return request.candidatePlans;
  }

  return Array.from({ length: Math.max(1, request.generationCount) }, () => ({
    prompt: request.finalPrompt,
  }));
}

function complexityLabel(level: number) {
  return ['极简', '简洁', '中等', '丰富', '复杂'][Math.max(0, Math.min(level - 1, 4))];
}

function buildStructureTags(request: GenerateRequest, variantLabel?: string) {
  return [
    request.motifCategory || '主题纹样',
    request.sceneType || '工艺应用',
    request.symmetryMode,
    variantLabel || '标准方案',
  ].filter(Boolean);
}

function buildColorTags(request: GenerateRequest) {
  const tags = request.selectedPaletteIds
    .slice(0, Math.max(request.colorCount, 1))
    .map((item) => item.replace(/-/g, ' '));

  if (request.colorMood) {
    tags.unshift(request.colorMood);
  }

  return tags.slice(0, 5);
}

function buildCandidateResult(
  generationId: string,
  request: GenerateRequest,
  candidate: CandidatePlan,
  index: number,
  imageUrl: string,
): CandidateResult {
  return {
    id: `${generationId}-${index}`,
    name: `${request.theme || '纹样'} · ${candidate.variantLabel || `候选 ${index + 1}`}`,
    theme: request.theme || '西兰卡普纹样',
    imageUrl,
    colors: request.selectedPaletteIds,
    structureTags: buildStructureTags(request, candidate.variantLabel),
    colorTags: buildColorTags(request),
    complexity: complexityLabel(request.complexity),
    variantLabel: candidate.variantLabel,
    summary: `${request.theme || '纹样'} / ${request.subjectObject || request.motifCategory || '主体'} / ${candidate.variantLabel || '标准方案'}`,
  };
}

function hash(input: string) {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 31 + input.charCodeAt(index)) >>> 0;
  }
  return value;
}

function paletteFromHash(value: number) {
  const palettes = [
    ['#c45c26', '#2c4a7c', '#f0e6d3', '#c9a227', '#1a1814'],
    ['#a63d40', '#8b6914', '#3d5a3d', '#ebe4d4', '#111827'],
    ['#1e4d6b', '#f59e0b', '#c45c26', '#f8fafc', '#0f172a'],
  ];
  return palettes[value % palettes.length];
}

function createMockPatternImage(prompt: string, label: string, theme: string, index = 0) {
  const seed = hash(`${prompt}:${label}:${theme}:${index}`);
  const palette = paletteFromHash(seed);
  const rotation = (seed % 40) - 20;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <rect width="640" height="640" fill="${palette[4]}"/>
  <g transform="translate(320 320) rotate(${rotation})">
    <polygon points="0,-220 220,0 0,220 -220,0" fill="none" stroke="${palette[0]}" stroke-width="18"/>
    <polygon points="0,-160 160,0 0,160 -160,0" fill="${palette[1]}" stroke="${palette[3]}" stroke-width="12"/>
    <polygon points="0,-96 96,0 0,96 -96,0" fill="${palette[2]}" stroke="${palette[3]}" stroke-width="8"/>
  </g>
  <g fill="${palette[0]}" opacity="0.92">
    <polygon points="96,96 144,144 96,192 48,144"/>
    <polygon points="544,96 592,144 544,192 496,144"/>
    <polygon points="96,448 144,496 96,544 48,496"/>
    <polygon points="544,448 592,496 544,544 496,496"/>
  </g>
  <text x="320" y="590" text-anchor="middle" font-size="28" fill="${palette[3]}" font-family="serif">${theme} · ${label}</text>
</svg>`.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getArkErrorMessage(payload: ArkImagesResponse, status: number) {
  return payload.error?.message || payload.error?.code || `Image request failed (${status})`;
}

async function callArkImage(uploadedImages: string[], prompt: string, settings: BrowserApiSettings) {
  const modelId = settings.modelId || DEFAULT_ARK_MODEL_ID;
  const requestBody: Record<string, unknown> = {
    model: modelId,
    prompt,
    image: buildArkImageInput(modelId, uploadedImages),
    watermark: false,
    response_format: 'b64_json',
  };

  if (!isSeedEditModel(modelId)) {
    requestBody.sequential_image_generation = 'disabled';
  }

  const response = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const payload = (await response.json()) as ArkImagesResponse;
  const firstImage = payload.data?.[0];

  if (!response.ok || (!firstImage?.b64_json && !firstImage?.url)) {
    throw new Error(getArkErrorMessage(payload, response.status));
  }

  if (firstImage.b64_json) {
    return `data:image/png;base64,${firstImage.b64_json}`;
  }

  const imageResponse = await fetch(firstImage.url!);
  if (!imageResponse.ok) {
    throw new Error(`Generated image download failed (${imageResponse.status})`);
  }

  return blobToDataUrl(await imageResponse.blob());
}

function ensureRuntimeSettings() {
  if (runtimeSettings.useMock || runtimeSettings.apiKey) {
    return runtimeSettings;
  }

  const apiKey = window.prompt(
    '请输入图片 API Key（仅本次打开有效）。\n如果只想先看界面，可输入 mock 使用演示图。',
    '',
  );

  if (!apiKey) {
    throw new Error('未提供 API Key。');
  }

  if (apiKey.trim().toLowerCase() === 'mock') {
    runtimeSettings.useMock = true;
    return runtimeSettings;
  }

  runtimeSettings.apiKey = apiKey.trim();

  const modelId = window.prompt('请输入模型 ID', runtimeSettings.modelId) || runtimeSettings.modelId;
  const baseUrl = window.prompt('请输入 Base URL', runtimeSettings.baseUrl) || runtimeSettings.baseUrl;

  runtimeSettings.modelId = modelId.trim() || DEFAULT_ARK_MODEL_ID;
  runtimeSettings.baseUrl = baseUrl.trim() || DEFAULT_ARK_BASE_URL;

  return runtimeSettings;
}

function createTask(generationId: string, request: GenerateRequest): GenerationTask {
  const total = Math.max(1, getPlannedCandidates(request).length);
  return {
    id: generationId,
    createdAt: new Date().toISOString(),
    request,
    status: 'processing',
    progress: {
      total,
      success: 0,
      failed: 0,
      pending: total,
    },
    candidates: [],
  };
}

function updateTask(generationId: string, updater: (task: GenerationTask) => GenerationTask) {
  const current = generationStore.get(generationId);
  if (!current) {
    return;
  }

  const nextTask = updater(current);
  generationStore.set(generationId, nextTask);
  const listeners = generationListeners.get(generationId);
  if (!listeners || listeners.size === 0) {
    return;
  }

  const snapshot = cloneTask(nextTask);
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function cloneTask(task: GenerationTask) {
  return {
    ...task,
    progress: { ...task.progress },
    request: {
      ...task.request,
      uploadedImages: [...task.request.uploadedImages],
      selectedPaletteIds: [...task.request.selectedPaletteIds],
      candidatePlans: task.request.candidatePlans?.map((candidate) => ({
        ...candidate,
        imageIndexes: candidate.imageIndexes ? [...candidate.imageIndexes] : undefined,
      })),
    },
    candidates: task.candidates.map((candidate) => ({
      ...candidate,
      colors: [...candidate.colors],
      structureTags: [...candidate.structureTags],
      colorTags: [...candidate.colorTags],
    })),
  };
}

async function processCandidate(
  generationId: string,
  request: GenerateRequest,
  candidate: CandidatePlan,
  index: number,
  settings: BrowserApiSettings,
) {
  try {
    const uploadedImages =
      Array.isArray(candidate.imageIndexes) && candidate.imageIndexes.length > 0
        ? candidate.imageIndexes
            .map((imageIndex) => request.uploadedImages[imageIndex])
            .filter((image): image is string => typeof image === 'string' && image.length > 0)
        : request.uploadedImages;

    const imageUrl = settings.useMock
      ? createMockPatternImage(candidate.prompt, candidate.variantLabel || `候选 ${index + 1}`, request.theme, index)
      : await callArkImage(uploadedImages, candidate.prompt, settings);

    updateTask(generationId, (task) => ({
      ...task,
      progress: {
        total: task.progress.total,
        success: task.progress.success + 1,
        failed: task.progress.failed,
        pending: Math.max(task.progress.pending - 1, 0),
      },
      candidates: [...task.candidates, buildCandidateResult(generationId, request, candidate, index, imageUrl)],
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    updateTask(generationId, (task) => ({
      ...task,
      progress: {
        total: task.progress.total,
        success: task.progress.success,
        failed: task.progress.failed + 1,
        pending: Math.max(task.progress.pending - 1, 0),
      },
      errorMessage: task.errorMessage ? `${task.errorMessage} | ${message}` : message,
    }));
  }
}

async function processGeneration(generationId: string, request: GenerateRequest) {
  try {
    const settings = ensureRuntimeSettings();
    const candidates = getPlannedCandidates(request);

    await Promise.all(
      candidates.map((candidate, index) => processCandidate(generationId, request, candidate, index, settings)),
    );

    updateTask(generationId, (task) => ({
      ...task,
      status: task.progress.success > 0 ? 'completed' : 'failed',
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    updateTask(generationId, (task) => ({
      ...task,
      status: 'failed',
      progress: {
        total: task.progress.total,
        success: 0,
        failed: task.progress.total,
        pending: 0,
      },
      errorMessage: message,
    }));
  }
}

export async function submitGeneration(request: GenerateRequest) {
  const generationId = crypto.randomUUID();
  const task = createTask(generationId, request);
  generationStore.set(generationId, task);
  void processGeneration(generationId, request);
  return { success: true, generationId, taskIds: [] };
}

export async function checkGenerationStatus(generationId: string) {
  const task = generationStore.get(generationId);
  if (!task) {
    throw new Error('Generation not found');
  }
  return cloneTask(task);
}

export async function getGeneration(generationId: string) {
  const task = generationStore.get(generationId);
  return task ? cloneTask(task) : null;
}

export function subscribeGenerationUpdates(
  generationId: string,
  listener: (task: GenerationTask) => void,
) {
  const listeners = generationListeners.get(generationId) || new Set<(task: GenerationTask) => void>();
  listeners.add(listener);
  generationListeners.set(generationId, listeners);

  const current = generationStore.get(generationId);
  if (current) {
    listener(cloneTask(current));
  }

  return () => {
    const currentListeners = generationListeners.get(generationId);
    if (!currentListeners) {
      return;
    }

    currentListeners.delete(listener);
    if (currentListeners.size === 0) {
      generationListeners.delete(generationId);
    }
  };
}

export function applyFavoriteToCandidates(candidates: CandidateResult[], favorites: Set<string>) {
  return candidates.map((candidate) => ({
    ...candidate,
    favorite: favorites.has(candidate.id),
  }));
}
