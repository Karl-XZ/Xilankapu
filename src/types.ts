export type AppTab =
  | 'home'
  | 'workspace'
  | 'library'
  | 'projects'
  | 'teaching'
  | 'export'
  | 'about'
  | 'admin';

export type GenerationStatus = 'idle' | 'generating' | 'completed' | 'failed';
export type CanvasView = 'preview' | 'grid' | 'regions' | 'lineart' | 'path' | 'editor';
export type SymmetryMode = 'quad' | 'mirror' | 'rotation' | 'free';
export type ComplexityLevel = 1 | 2 | 3 | 4 | 5;
export type DensityLevel = 'airy' | 'balanced' | 'dense';
export type TraditionLevel = 'traditional' | 'balanced' | 'innovative';
export type PathMode = 'traditional' | 'border-first' | 'center-first' | 'color-first';
export type PathDifficulty = 'beginner' | 'standard';
export type EditorTool = 'paint' | 'lock' | 'picker';
export type PaperSize = 'a4' | 'a3';
export type PageOrientation = 'portrait' | 'landscape';
export type ExportKind =
  | 'preview'
  | 'grid'
  | 'regions'
  | 'lineart'
  | 'path'
  | 'palette'
  | 'teaching'
  | 'pdf'
  | 'craftsheet'
  | 'svg'
  | 'png'
  | 'batch';

export interface ThreadColor {
  id: string;
  name: string;
  hex: string;
  thread: string;
  family: string;
}

export interface PatternLibraryItem {
  id: string;
  title: string;
  category: string;
  meaning: string;
  structure: string;
  description: string;
  scene?: string;
  usage?: string;
  palette: string[];
  keywords: string[];
}

export interface PromptTemplates {
  system: string;
  structure: string;
  craft: string;
  negative: string;
  completion: string;
  reviewRules: string;
  exportTemplate: string;
}

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  password: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface AuthSession {
  userId: string;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
}

export interface WorkspaceState {
  projectName: string;
  theme: string;
  subjectObject: string;
  sceneType: string;
  motifCategory: string;
  culturalMeaning: string;
  promptText: string;
  symmetryMode: SymmetryMode;
  complexity: ComplexityLevel;
  density: DensityLevel;
  tradition: TraditionLevel;
  colorCount: number;
  colorMood: string;
  generationCount: number;
  aiCompletionEnabled: boolean;
  aiCompletionPrompt: string;
  selectedPaletteIds: string[];
  pathMode: PathMode;
  pathDifficulty: PathDifficulty;
  gridDensity: number;
  paperSize: PaperSize;
  pageOrientation: PageOrientation;
  paginateExport: boolean;
  notes: string;
}

export interface CandidatePlan {
  prompt: string;
  imageIndexes?: number[];
  variantLabel?: string;
}

export interface GenerateRequest {
  uploadedImages: string[];
  theme: string;
  subjectObject: string;
  sceneType: string;
  motifCategory: string;
  culturalMeaning: string;
  promptText: string;
  symmetryMode: SymmetryMode;
  complexity: ComplexityLevel;
  density: DensityLevel;
  tradition: TraditionLevel;
  colorCount: number;
  colorMood: string;
  selectedPaletteIds: string[];
  aiCompletionEnabled: boolean;
  aiCompletionPrompt?: string;
  finalPrompt: string;
  generationCount: number;
  candidatePlans?: CandidatePlan[];
}

export interface CandidateResult {
  id: string;
  name: string;
  theme: string;
  imageUrl: string;
  colors: string[];
  structureTags: string[];
  colorTags: string[];
  complexity: string;
  variantLabel?: string;
  summary: string;
  favorite?: boolean;
}

export interface GenerationTask {
  id: string;
  createdAt: string;
  request: GenerateRequest;
  status: 'processing' | 'completed' | 'failed';
  progress: {
    total: number;
    success: number;
    failed: number;
    pending: number;
  };
  candidates: CandidateResult[];
  errorMessage?: string;
}

export interface MatrixCell {
  colorId: string;
  locked?: boolean;
}

export interface PatternMatrix {
  size: number;
  palette: ThreadColor[];
  cells: MatrixCell[][];
  sourceLabel: string;
}

export interface RegionStep {
  id: string;
  index: number;
  title: string;
  description: string;
  color: ThreadColor;
  cellCount: number;
  centroid: { x: number; y: number };
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  colorChangedFromPrevious: boolean;
  orderHint: string;
}

export interface PathPlan {
  mode: PathMode;
  difficulty: PathDifficulty;
  steps: RegionStep[];
  polyline: Array<{ x: number; y: number }>;
  startPoint: { x: number; y: number } | null;
  endPoint: { x: number; y: number } | null;
  switchPoints: Array<{ x: number; y: number }>;
}

export interface PaletteSummaryItem {
  color: ThreadColor;
  count: number;
  ratio: number;
}

export interface SavedProject {
  id: string;
  ownerId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
  workspace: WorkspaceState;
  selectedCandidate: CandidateResult | null;
  matrix: PatternMatrix | null;
  pathPlan: PathPlan | null;
  exportHistory: Array<{ id: string; kind: ExportKind; createdAt: string }>;
  versions: Array<{ id: string; createdAt: string; note: string }>;
}
