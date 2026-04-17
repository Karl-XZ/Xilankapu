import type { PatternLibraryItem, PromptTemplates, UserAccount, WorkspaceState } from '../types';
import { DEFAULT_LIBRARY_PALETTES } from './threadPalette';

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  projectName: '未命名西兰卡普项目',
  theme: '太阳纹',
  subjectObject: '太阳与山地礼仪纹样',
  sceneType: '节庆礼仪',
  motifCategory: '中心纹',
  culturalMeaning: '祈福、丰收、生命延续',
  promptText: '以太阳纹为主纹，强调土家织锦的几何秩序、四向对称和强烈节奏感。',
  symmetryMode: 'quad',
  complexity: 3,
  density: 'balanced',
  tradition: 'traditional',
  colorCount: 5,
  colorMood: '暖红金黄为主，辅以靛蓝和米白形成传统礼仪配色',
  generationCount: 1,
  aiCompletionEnabled: true,
  aiCompletionPrompt: '补全边饰、中心纹和连续纹之间的连接，使纹样更适合转为格纹绣制稿。',
  selectedPaletteIds: DEFAULT_LIBRARY_PALETTES[0],
  pathMode: 'traditional',
  pathDifficulty: 'standard',
  gridDensity: 32,
  paperSize: 'a4',
  pageOrientation: 'portrait',
  paginateExport: true,
  notes: '',
};

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplates = {
  system:
    '生成西兰卡普风格纹样设计稿。必须以土家族织锦纹样语言为核心，强调几何秩序、平面构成、强对称和重复节奏。',
  structure:
    '构图应以中心纹、边饰纹、连续纹或角饰纹形成稳定组织，避免现代插画感、照片感、3D光影和随机涂抹。',
  craft:
    '结果应适合后续转为网格图、配色编号图和绣制路径参考图，边界清晰、色块明确、轮廓利落。',
  negative:
    '不要写实场景、不要人物摄影、不要金属材质、不要水彩渐变、不要厚重阴影、不要现代UI图标感。',
  completion:
    '在不破坏西兰卡普传统气质的前提下，补全重复单元、边框衔接和主纹细节，使结构更完整。',
  reviewRules:
    '审核结果时重点检查几何秩序、纹样对称性、色块边界清晰度，以及是否偏离西兰卡普传统气质。',
  exportTemplate:
    '导出单应包含项目名称、主题寓意、纹样预览、线稿、区域编号图、色卡、路径步骤和页码。',
};

export const DEFAULT_LIBRARY: PatternLibraryItem[] = [
  {
    id: 'sun',
    title: '太阳纹',
    category: '中心纹',
    meaning: '光明、生命、丰收',
    structure: '中心放射 + 四向对称',
    scene: '节庆礼仪',
    usage: '主纹中心',
    description: '适合作为主视觉中心，强调土家织锦的稳定感和礼仪气质。',
    palette: DEFAULT_LIBRARY_PALETTES[0],
    keywords: ['太阳', '中心纹', '祈福', '放射'],
  },
  {
    id: 'bird',
    title: '吉祥鸟纹',
    category: '主题纹',
    meaning: '祥瑞、团圆、欢庆',
    structure: '双向对称 + 翼展造型',
    scene: '婚嫁庆典',
    usage: '主题主纹',
    description: '常用于婚嫁、节庆和祝福主题，可与边饰和回纹组合。',
    palette: DEFAULT_LIBRARY_PALETTES[1],
    keywords: ['吉祥鸟', '双飞', '婚嫁', '祝福'],
  },
  {
    id: 'ladder',
    title: '梯玛纹',
    category: '象征纹',
    meaning: '祭祀、祈愿、传承',
    structure: '阶梯递进 + 线性重复',
    scene: '祭祀仪式',
    usage: '边饰辅助',
    description: '适合表现仪式感和向上延展的秩序，可作为边饰和辅助纹使用。',
    palette: DEFAULT_LIBRARY_PALETTES[0],
    keywords: ['梯玛', '祭祀', '阶梯', '传承'],
  },
  {
    id: 'mountain',
    title: '山水纹',
    category: '主题纹',
    meaning: '家园、自然、绵延',
    structure: '层叠山形 + 对称边框',
    scene: '山地家园',
    usage: '主辅组合',
    description: '适合表现山地文化与空间层次，可与太阳纹形成主辅关系。',
    palette: DEFAULT_LIBRARY_PALETTES[2],
    keywords: ['山水', '自然', '层叠', '家园'],
  },
  {
    id: 'diamond',
    title: '菱格纹',
    category: '连续纹',
    meaning: '秩序、丰饶、延续',
    structure: '菱形单元连续重复',
    scene: '日常织锦',
    usage: '底纹边框',
    description: '适合作为底纹和边饰，便于转网格和教学演示。',
    palette: DEFAULT_LIBRARY_PALETTES[2],
    keywords: ['菱形', '连续', '四方连续', '秩序'],
  },
  {
    id: 'border',
    title: '边饰回纹',
    category: '边饰纹',
    meaning: '守护、围合、圆满',
    structure: '回折折线 + 外框包裹',
    scene: '礼服包边',
    usage: '外围边饰',
    description: '适合用于主体外围包边，强化作品完整性。',
    palette: DEFAULT_LIBRARY_PALETTES[1],
    keywords: ['边饰', '回纹', '围合', '装饰'],
  },
];

export const DEFAULT_USERS: UserAccount[] = [
  {
    id: 'admin-seed',
    username: 'admin',
    displayName: '系统管理员',
    password: 'admin123',
    role: 'admin',
    createdAt: new Date('2026-04-16T00:00:00.000Z').toISOString(),
  },
];
