import { DEFAULT_THREAD_PALETTE } from '../data/threadPalette';
import type {
  CandidatePlan,
  GenerateRequest,
  PromptTemplates,
  SymmetryMode,
  ThreadColor,
  WorkspaceState,
} from '../types';

function symmetryLabel(mode: SymmetryMode) {
  switch (mode) {
    case 'quad':
      return '四向对称';
    case 'mirror':
      return '镜像对称';
    case 'rotation':
      return '旋转对称';
    default:
      return '自由构成';
  }
}

function complexityLabel(level: number) {
  return ['极简', '简洁', '中等', '丰富', '复杂'][Math.max(0, Math.min(level - 1, 4))];
}

function densityLabel(level: WorkspaceState['density']) {
  return level === 'airy' ? '留白充足' : level === 'dense' ? '纹样密集' : '疏密均衡';
}

function traditionLabel(level: WorkspaceState['tradition']) {
  return level === 'traditional' ? '传统气质优先' : level === 'innovative' ? '允许适度创新' : '传统与创新平衡';
}

function resolvePaletteDescription(selectedPaletteIds: string[], availablePalette: ThreadColor[]) {
  const resolved = availablePalette.filter((item) => selectedPaletteIds.includes(item.id));
  if (resolved.length === 0) {
    return '采用西兰卡普常用织锦色系，色块清晰，层次分明。';
  }

  return `主色建议包含：${resolved.map((item) => `${item.name}(${item.hex})`).join('、')}。`;
}

export function buildFinalPrompt(
  workspace: WorkspaceState,
  templates: PromptTemplates,
  availablePalette: ThreadColor[] = DEFAULT_THREAD_PALETTE,
  referenceImageCount = 0,
) {
  const parts = [
    templates.system,
    `主题为${workspace.theme}，纹样类型为${workspace.motifCategory}。`,
    `主体对象：${workspace.subjectObject || workspace.theme}。`,
    `应用场景：${workspace.sceneType || '礼仪、教学与手工制作'}。`,
    `文化寓意：${workspace.culturalMeaning || '突出祝福、秩序与吉祥气质。'}`,
    workspace.promptText,
    `构图要求：${symmetryLabel(workspace.symmetryMode)}，${complexityLabel(workspace.complexity)}，${densityLabel(workspace.density)}，${traditionLabel(workspace.tradition)}。`,
    `控制色彩数量在${workspace.colorCount}色以内。`,
    `色彩倾向：${workspace.colorMood || '采用传统土家织锦高对比配色，避免现代渐变。'}`,
    resolvePaletteDescription(workspace.selectedPaletteIds, availablePalette),
    templates.structure,
    templates.craft,
    templates.reviewRules,
    referenceImageCount > 0
      ? `Use the uploaded reference image${referenceImageCount > 1 ? 's' : ''} as a strong composition guide. Preserve the main subject silhouette, motif placement, visual center, and color-block rhythm from the references, then translate them into a flat geometric Xilankapu weaving pattern instead of inventing a completely unrelated composition.`
      : '',
    workspace.aiCompletionEnabled ? workspace.aiCompletionPrompt || templates.completion : '',
    templates.negative,
  ];

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

const CANDIDATE_VARIANTS: Array<{ label: string; prompt: string }> = [
  { label: '中心纹强化', prompt: '强调主纹聚焦和中心秩序，使主体更稳定。' },
  { label: '边饰连续', prompt: '强化边框、边饰和回纹的连续性，形成完整围合。' },
  { label: '节庆配色', prompt: '突出更热烈的节庆色块关系，但保持织锦平面性。' },
  { label: '教学简化', prompt: '适当简化局部细节，让结构更利于后续网格拆解和教学。' },
  { label: '层次增强', prompt: '增加主纹、辅纹和背景之间的层级差异，色块关系更清楚。' },
  { label: '创新变体', prompt: '保持传统根基下做适度创新，但不要脱离西兰卡普气质。' },
];

export function buildCandidatePlans(
  uploadedImages: string[],
  finalPrompt: string,
  generationCount: number,
): CandidatePlan[] {
  return Array.from({ length: Math.max(generationCount, 1) }, (_, index) => {
    const variant = CANDIDATE_VARIANTS[index % CANDIDATE_VARIANTS.length];
    const imageIndexes =
      uploadedImages.length > 1
        ? Array.from({ length: Math.min(2, uploadedImages.length) }, (_, offset) =>
            (index + offset) % uploadedImages.length,
          )
        : undefined;

    return {
      prompt: `${finalPrompt} ${variant.prompt} 输出为平面纹样设计稿，边界利落，适合后续转成网格与绣制路径图。`,
      variantLabel: variant.label,
      imageIndexes,
    };
  });
}

export function buildGenerationRequest(
  workspace: WorkspaceState,
  templates: PromptTemplates,
  uploadedImages: string[],
  availablePalette: ThreadColor[] = DEFAULT_THREAD_PALETTE,
): GenerateRequest {
  const finalPrompt = buildFinalPrompt(workspace, templates, availablePalette, uploadedImages.length);

  return {
    uploadedImages,
    theme: workspace.theme,
    subjectObject: workspace.subjectObject,
    sceneType: workspace.sceneType,
    motifCategory: workspace.motifCategory,
    culturalMeaning: workspace.culturalMeaning,
    promptText: workspace.promptText,
    symmetryMode: workspace.symmetryMode,
    complexity: workspace.complexity,
    density: workspace.density,
    tradition: workspace.tradition,
    colorCount: workspace.colorCount,
    colorMood: workspace.colorMood,
    selectedPaletteIds: workspace.selectedPaletteIds,
    aiCompletionEnabled: workspace.aiCompletionEnabled,
    aiCompletionPrompt: workspace.aiCompletionPrompt,
    finalPrompt,
    generationCount: workspace.generationCount,
    candidatePlans: buildCandidatePlans(uploadedImages, finalPrompt, workspace.generationCount),
  };
}
