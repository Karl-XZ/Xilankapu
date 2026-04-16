import { getStoreJson, getStoreText, setStoreJson, setStoreText } from './storage';
import type { CloudflarePagesContext } from './runtime';
import { callVolcengineImage, getVolcengineConfig } from './volcengine';
import type {
  CandidatePlan,
  CandidateResultPayload,
  GenerateRequest,
  StoredCandidateState,
  StoredGeneration,
} from './types';

function generationKey(id: string) {
  return `generation_${id}_meta`;
}

function candidateKey(id: string, index: number) {
  return `generation_${id}_candidate_${index}`;
}

function imageKey(id: string, index: number) {
  return `generation_${id}_image_${index}`;
}

function requestKey(id: string) {
  return `generation_${id}_request`;
}

const STALE_PROCESSING_MS = 90_000;

function resolveCandidateUploadedImages(uploadedImages: string[], imageIndexes?: number[]) {
  if (!Array.isArray(imageIndexes) || imageIndexes.length === 0) {
    return uploadedImages;
  }

  const resolvedImages = imageIndexes
    .map((index) => uploadedImages[index])
    .filter((image): image is string => typeof image === 'string' && image.length > 0);

  return resolvedImages.length > 0 ? resolvedImages : uploadedImages;
}

function complexityLabel(level: number) {
  return ['极简', '简洁', '中等', '丰富', '复杂'][Math.max(0, Math.min(level - 1, 4))];
}

function buildStructureTags(request: GenerateRequest, variantLabel?: string) {
  return [
    request.motifCategory || '主题纹',
    request.symmetryMode === 'quad'
      ? '四向对称'
      : request.symmetryMode === 'mirror'
        ? '镜像对称'
        : request.symmetryMode === 'rotation'
          ? '旋转对称'
          : '自由构成',
    request.sceneType || '教学制作',
    variantLabel || '标准方案',
  ].filter(Boolean);
}

function buildColorTags(request: GenerateRequest) {
  const tags = (request.selectedPaletteIds || [])
    .slice(0, Math.max(request.colorCount, 1))
    .map((colorId) => colorId.replace(/-/g, ' '));
  if (request.colorMood) {
    tags.unshift(request.colorMood);
  }
  return tags.slice(0, 5);
}

function getPlannedCandidates(body: GenerateRequest): CandidatePlan[] {
  if (Array.isArray(body.candidatePlans) && body.candidatePlans.length > 0) {
    return body.candidatePlans;
  }

  return Array.from({ length: body.generationCount }, () => ({
    prompt: body.finalPrompt,
  }));
}

async function listCandidateStates(context: CloudflarePagesContext, id: string, count: number) {
  const states = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      getStoreJson<StoredCandidateState>(context, candidateKey(id, index)),
    ),
  );

  return states.filter((state): state is StoredCandidateState => state !== null);
}

function isCandidateProcessingStale(candidateState: StoredCandidateState) {
  if (candidateState.status !== 'processing') {
    return false;
  }
  const updatedAt = Date.parse(candidateState.updated_at);
  return Number.isNaN(updatedAt) || Date.now() - updatedAt >= STALE_PROCESSING_MS;
}

async function setCandidateState(
  context: CloudflarePagesContext,
  generationId: string,
  index: number,
  state: StoredCandidateState,
) {
  await setStoreJson(context, candidateKey(generationId, index), state);
}

export function validateGenerateRequest(body: GenerateRequest) {
  if (!body.finalPrompt?.trim()) {
    return 'finalPrompt is required';
  }

  const plannedCount = getPlannedCandidates(body).length;
  if (plannedCount < 1 || plannedCount > 8) {
    return 'generationCount must be between 1 and 8';
  }

  return null;
}

export async function createGeneration(context: CloudflarePagesContext, body: GenerateRequest) {
  const generationId = crypto.randomUUID();
  const plannedCandidates = getPlannedCandidates(body);
  const generation: StoredGeneration = {
    id: generationId,
    created_at: new Date().toISOString(),
    request: body,
    status: 'processing',
    progress: {
      total: plannedCandidates.length,
      success: 0,
      failed: 0,
      pending: plannedCandidates.length,
    },
    candidates: [],
  };

  await setStoreJson(context, generationKey(generationId), generation);
  await setStoreJson(context, requestKey(generationId), body);
  await Promise.all(
    plannedCandidates.map((candidate, index) =>
      setCandidateState(context, generationId, index, {
        index,
        status: 'pending',
        variant_label: candidate.variantLabel,
        updated_at: new Date().toISOString(),
      }),
    ),
  );

  return { generationId, generation };
}

function findCandidateToAdvance(candidateStates: StoredCandidateState[]) {
  const activeCandidate = candidateStates.find(
    (state) => state.status === 'processing' && !isCandidateProcessingStale(state),
  );
  if (activeCandidate) {
    return null;
  }

  const staleCandidate = candidateStates.find(isCandidateProcessingStale);
  if (staleCandidate) {
    return staleCandidate.index;
  }

  const pendingCandidate = candidateStates.find((state) => state.status === 'pending');
  return pendingCandidate?.index ?? null;
}

function buildCandidateResult(
  generationId: string,
  request: GenerateRequest,
  index: number,
  imageUrl: string,
  variantLabel?: string,
): CandidateResultPayload {
  return {
    id: `${generationId}-${index}`,
    name: `${request.theme || '纹样'}·${variantLabel || `候选${index + 1}`}`,
    theme: request.theme || '西兰卡普纹样',
    imageUrl,
    colors: request.selectedPaletteIds,
    structureTags: buildStructureTags(request, variantLabel),
    colorTags: buildColorTags(request),
    complexity: complexityLabel(request.complexity),
    variantLabel,
    summary: `${request.theme || '纹样'} / ${request.subjectObject || request.motifCategory || '主纹'} / ${variantLabel || '标准方案'}`,
  };
}

async function getStoredRequest(context: CloudflarePagesContext, generationId: string) {
  return getStoreJson<GenerateRequest>(context, requestKey(generationId));
}

async function getGenerationSnapshotInternal(
  context: CloudflarePagesContext,
  generationId: string,
) {
  const generation = await getStoreJson<StoredGeneration>(context, generationKey(generationId));
  if (!generation) {
    return null;
  }

  const candidateStates = await listCandidateStates(
    context,
    generationId,
    generation.progress.total,
  );

  const request = await getStoredRequest(context, generationId);
  const candidates = (
    await Promise.all(
      candidateStates
        .filter((state) => state.status === 'completed' && state.image_key && request)
        .map(async (state) => {
          const imageUrl = await getStoreText(context, state.image_key!);
          if (!imageUrl || !request) {
            return null;
          }
          return buildCandidateResult(
            generationId,
            request,
            state.index,
            imageUrl,
            state.variant_label,
          );
        }),
    )
  ).filter((candidate): candidate is CandidateResultPayload => candidate !== null);

  const failedCount = candidateStates.filter((state) => state.status === 'failed').length;
  const successCount = candidates.length;
  const pendingCount = Math.max(generation.progress.total - successCount - failedCount, 0);
  const status = pendingCount > 0 ? 'processing' : successCount > 0 ? 'completed' : 'failed';
  const errorMessage =
    failedCount > 0
      ? candidateStates
          .filter((state) => state.status === 'failed' && state.error)
          .map((state) => state.error)
          .join(' | ')
      : undefined;

  return {
    generation,
    request,
    candidateStates,
    payload: {
      ...generation,
      status,
      progress: {
        total: generation.progress.total,
        success: successCount,
        failed: failedCount,
        pending: pendingCount,
      },
      candidates,
      error_message: errorMessage,
    } satisfies StoredGeneration,
  };
}

async function generateSingleCandidate(
  context: CloudflarePagesContext,
  generationId: string,
  request: GenerateRequest,
  candidate: CandidatePlan,
  index: number,
) {
  await setCandidateState(context, generationId, index, {
    index,
    status: 'processing',
    variant_label: candidate.variantLabel,
    updated_at: new Date().toISOString(),
  });

  try {
    const config = getVolcengineConfig(context);
    const resultImage = await callVolcengineImage(
      resolveCandidateUploadedImages(request.uploadedImages, candidate.imageIndexes),
      candidate.prompt,
      config,
      candidate.variantLabel,
      request.theme,
    );
    const storedImageKey = imageKey(generationId, index);
    await setStoreText(context, storedImageKey, resultImage);
    await setCandidateState(context, generationId, index, {
      index,
      status: 'completed',
      variant_label: candidate.variantLabel,
      image_key: storedImageKey,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    await setCandidateState(context, generationId, index, {
      index,
      status: 'failed',
      variant_label: candidate.variantLabel,
      error: error instanceof Error ? error.message : String(error),
      updated_at: new Date().toISOString(),
    });
  }
}

export async function advanceGeneration(context: CloudflarePagesContext, generationId: string) {
  const snapshot = await getGenerationSnapshotInternal(context, generationId);
  if (!snapshot || !snapshot.request) {
    return null;
  }
  if (snapshot.payload.status === 'completed' || snapshot.payload.status === 'failed') {
    return snapshot.payload;
  }

  const candidateIndex = findCandidateToAdvance(snapshot.candidateStates);
  if (candidateIndex === null) {
    await setStoreJson(context, generationKey(generationId), snapshot.payload);
    return snapshot.payload;
  }

  const plannedCandidates = getPlannedCandidates(snapshot.request);
  const candidate = plannedCandidates[candidateIndex];
  if (!candidate) {
    return snapshot.payload;
  }

  await generateSingleCandidate(context, generationId, snapshot.request, candidate, candidateIndex);
  const nextSnapshot = await getGenerationSnapshotInternal(context, generationId);
  if (!nextSnapshot) {
    return null;
  }
  await setStoreJson(context, generationKey(generationId), nextSnapshot.payload);
  return nextSnapshot.payload;
}

export async function getGenerationSnapshot(context: CloudflarePagesContext, generationId: string) {
  const snapshot = await getGenerationSnapshotInternal(context, generationId);
  return snapshot?.payload ?? null;
}

export async function getGenerationResponse(context: CloudflarePagesContext, generationId: string) {
  return getGenerationSnapshot(context, generationId);
}
