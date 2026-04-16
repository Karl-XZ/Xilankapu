export type SymmetryMode = 'quad' | 'mirror' | 'rotation' | 'free';
export type DensityLevel = 'airy' | 'balanced' | 'dense';
export type TraditionLevel = 'traditional' | 'balanced' | 'innovative';

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
  complexity: 1 | 2 | 3 | 4 | 5;
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

export interface CandidateResultPayload {
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
}

export interface StoredGeneration {
  id: string;
  created_at: string;
  request: GenerateRequest;
  status: 'processing' | 'completed' | 'failed';
  progress: {
    total: number;
    success: number;
    failed: number;
    pending: number;
  };
  candidates: CandidateResultPayload[];
  error_message?: string;
}

export interface StoredCandidateState {
  index: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  image_key?: string;
  error?: string;
  variant_label?: string;
  updated_at: string;
}
