import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import './App.css';

import { DEFAULT_LIBRARY, DEFAULT_PROMPT_TEMPLATES, DEFAULT_WORKSPACE_STATE } from './data/library';
import { DEFAULT_THREAD_PALETTE } from './data/threadPalette';
import { downloadCandidateBatch, downloadCandidateImage, downloadPdf, downloadPng, downloadSvg } from './lib/export';
import {
    buildPathPlan,
    createSeedMatrix,
    imageToMatrix,
    matrixToSvg,
    mirrorMatrix,
    paintCell,
    repeatMatrix,
    replacePaletteColor,
    resolvePalette,
    rotateMatrix,
    simplifyMatrixForTeaching,
    strengthenBorderPattern,
    strengthenMainMotif,
    summarizePalette,
    toggleCellLock,
  } from './lib/matrix';
import { buildGenerationRequest } from './lib/prompt';
import { createSeedPatternDataUrl } from './lib/seedImage';
import {
  getCurrentSession,
  getFavoriteCandidateIds,
  getLibraryItems,
  getProjects,
  getPromptTemplates,
  getThreadPalette,
  getUsers,
  saveLibraryItems,
  saveProjects,
  savePromptTemplates,
  saveThreadPalette,
  saveUsers,
  seedStorage,
  setCurrentSession,
  toggleFavoriteCandidate,
} from './lib/storage';
import { applyFavoriteToCandidates, checkGenerationStatus, submitGeneration } from './services/api';
import type {
  AppTab,
  AuthSession,
  CanvasView,
  CandidateResult,
  EditorTool,
  ExportKind,
  GenerationTask,
  MatrixCell,
  PathPlan,
  PatternLibraryItem,
  PatternMatrix,
  PromptTemplates,
  SavedProject,
  ThreadColor,
  UserAccount,
  WorkspaceState,
} from './types';

const STORAGE_NOTE = '当前浏览器端实现包含游客模式、本地项目保存、知识库与管理台。';

function XilankapuPattern({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(100, 100)">
        <polygon points="0,-80 80,0 0,80 -80,0" fill="none" stroke="#c45c26" strokeWidth="3" />
        <polygon points="0,-60 60,0 0,60 -60,0" fill="#2c4a7c" stroke="#c9a227" strokeWidth="2" />
        <polygon points="0,-40 40,0 0,40 -40,0" fill="#a63d40" stroke="#f0e6d3" strokeWidth="1.5" />
        <polygon points="0,-20 20,0 0,20 -20,0" fill="#c9a227" stroke="#1a1814" strokeWidth="1" />
        <circle r="8" fill="#f0e6d3" />
        <circle r="4" fill="#c45c26" />
      </g>
      {[
        [30, 30],
        [170, 30],
        [30, 170],
        [170, 170],
      ].map(([x, y], index) => (
        <g key={index} transform={`translate(${x}, ${y})`}>
          <polygon points="0,-15 15,0 0,15 -15,0" fill="#3d5a3d" stroke="#c9a227" strokeWidth="1" />
          <circle r="5" fill="#c45c26" />
        </g>
      ))}
      <rect
        x="10"
        y="10"
        width="180"
        height="180"
        fill="none"
        stroke="#8b6914"
        strokeWidth="2"
        strokeDasharray="8 4"
      />
    </svg>
  );
}

function PatternTile({ style }: { style?: CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="60" fill="transparent" />
      <polygon
        points="30,5 55,30 30,55 5,30"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.15"
      />
      <polygon points="30,15 45,30 30,45 15,30" fill="currentColor" opacity="0.08" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function complexityText(value: number) {
  return ['极简', '简洁', '中等', '丰富', '复杂'][Math.max(0, Math.min(value - 1, 4))];
}

function densityText(value: WorkspaceState['density']) {
  return value === 'airy' ? '疏朗' : value === 'dense' ? '紧密' : '均衡';
}

function traditionText(value: WorkspaceState['tradition']) {
  return value === 'traditional' ? '传统' : value === 'innovative' ? '创新' : '平衡';
}

function toSvgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImageForGeneration(file: File) {
  const rawDataUrl = await fileToDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = rawDataUrl;
  });

  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return rawDataUrl;
  }
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9);
}

async function readImageDimensions(file: File) {
  const dataUrl = await fileToDataUrl(file);
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function buildMatrixFingerprint(candidateId: string | null, workspace: WorkspaceState) {
  return `${candidateId || 'seed'}|${workspace.gridDensity}|${workspace.colorCount}|${workspace.selectedPaletteIds.join(',')}|${workspace.symmetryMode}|${workspace.pathDifficulty}`;
}

function createEmptyTask(
  workspace: WorkspaceState,
  templates: PromptTemplates,
  threadPalette: ThreadColor[],
): GenerationTask {
  return {
    id: '',
    createdAt: new Date().toISOString(),
    request: buildGenerationRequest(workspace, templates, [], threadPalette),
    status: 'processing',
    progress: {
      total: workspace.generationCount,
      success: 0,
      failed: 0,
      pending: workspace.generationCount,
    },
    candidates: [],
  };
}

function AuthModal({
  mode,
  onClose,
  onLogin,
  onRegister,
}: {
  mode: 'login' | 'register';
  onClose: () => void;
  onLogin: (username: string, password: string) => string | null;
  onRegister: (username: string, displayName: string, password: string) => string | null;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const result =
      mode === 'login'
        ? onLogin(username.trim(), password)
        : onRegister(username.trim(), displayName.trim(), password);

    if (result) {
      setError(result);
      return;
    }

    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card auth-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{mode === 'login' ? '登录平台' : '注册账号'}</h3>
          <button className="icon-ghost" onClick={onClose} type="button">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          <label className="field-label">用户名</label>
          <input className="param-input" value={username} onChange={(event) => setUsername(event.target.value)} />
          {mode === 'register' && (
            <>
              <label className="field-label">显示名称</label>
              <input
                className="param-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </>
          )}
          <label className="field-label">密码</label>
          <input
            className="param-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="inline-error">{error}</p>}
          {mode === 'login' && (
            <p className="form-hint">默认管理员账号：`admin` / `admin123`</p>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} type="button">
            取消
          </button>
          <button className="btn-primary" onClick={submit} type="button">
            {mode === 'login' ? '登录' : '注册'}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [canvasView, setCanvasView] = useState<CanvasView>('preview');
  const [editorTool, setEditorTool] = useState<EditorTool>('paint');
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [threadPalette, setThreadPalette] = useState<ThreadColor[]>(DEFAULT_THREAD_PALETTE);
  const [libraryItems, setLibraryItems] = useState<PatternLibraryItem[]>(DEFAULT_LIBRARY);
  const [templates, setTemplates] = useState<PromptTemplates>(DEFAULT_PROMPT_TEMPLATES);
  const [projects, setProjectsState] = useState<SavedProject[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceState>(DEFAULT_WORKSPACE_STATE);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadedPreviews, setUploadedPreviews] = useState<string[]>([]);
  const [generationTask, setGenerationTask] = useState<GenerationTask | null>(null);
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [matrix, setMatrix] = useState<PatternMatrix | null>(null);
  const [pathPlan, setPathPlan] = useState<PathPlan | null>(null);
  const [matrixFingerprint, setMatrixFingerprint] = useState('');
  const [selectedColorId, setSelectedColorId] = useState<string>('ochre-red');
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [projectFeedback, setProjectFeedback] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [uploadFeedback, setUploadFeedback] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('全部');
  const [libraryMeaningFilter, setLibraryMeaningFilter] = useState('全部寓意');
  const [librarySceneFilter, setLibrarySceneFilter] = useState('全部场景');
  const [libraryStructureFilter, setLibraryStructureFilter] = useState('全部结构');
  const [libraryUsageFilter, setLibraryUsageFilter] = useState('全部用途');
  const [libraryPaletteFilter, setLibraryPaletteFilter] = useState('全部配色');
  const [editingLibraryId, setEditingLibraryId] = useState<string | null>(null);
  const [editingLibraryDraft, setEditingLibraryDraft] = useState<PatternLibraryItem | null>(null);
  const [editingThreadColorId, setEditingThreadColorId] = useState<string | null>(null);
  const [editingThreadColorDraft, setEditingThreadColorDraft] = useState<ThreadColor | null>(null);
  const [previewCandidate, setPreviewCandidate] = useState<CandidateResult | null>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [teachingStep, setTeachingStep] = useState(0);
  const [teachingPlaying, setTeachingPlaying] = useState(false);
  const homeUploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    seedStorage();
    setSession(getCurrentSession());
    setUsers(getUsers());
    setThreadPalette(getThreadPalette());
    setLibraryItems(getLibraryItems());
    setTemplates(getPromptTemplates());
    setProjectsState(getProjects());
    setFavoriteIds(getFavoriteCandidateIds());
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPreviews = async () => {
      if (uploadedFiles.length === 0) {
        setUploadedPreviews([]);
        return;
      }
      const urls = await Promise.all(uploadedFiles.map((file) => fileToDataUrl(file)));
      if (!cancelled) {
        setUploadedPreviews(urls);
      }
    };

    void loadPreviews();
    return () => {
      cancelled = true;
    };
  }, [uploadedFiles]);

  useEffect(() => {
    if (activeTab === 'admin' && session?.role !== 'admin') {
      setActiveTab('home');
    }
  }, [activeTab, session]);

  useEffect(() => {
    if (!activeGenerationId || !generationTask || generationTask.status !== 'processing') {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const nextTask = await checkGenerationStatus(activeGenerationId);
        setGenerationTask(nextTask);
        setStatusMessage(
          nextTask.status === 'failed'
            ? nextTask.errorMessage || '生成失败'
            : `已完成 ${nextTask.progress.success}/${nextTask.progress.total} 张候选纹样`,
        );
      } catch (error) {
        console.error('Failed to check generation status:', error);
        setStatusMessage(error instanceof Error ? error.message : '查询生成进度失败');
      }
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeGenerationId, generationTask]);

  const activeCandidates = useMemo(
    () => applyFavoriteToCandidates(generationTask?.candidates || [], favoriteIds),
    [generationTask?.candidates, favoriteIds],
  );

  const selectedCandidate = useMemo(
    () => activeCandidates.find((candidate) => candidate.id === selectedCandidateId) || null,
    [activeCandidates, selectedCandidateId],
  );

  useEffect(() => {
    if (!selectedCandidateId && activeCandidates.length > 0) {
      setSelectedCandidateId(activeCandidates[0].id);
    }
  }, [activeCandidates, selectedCandidateId]);

  const desiredPalette = useMemo(
    () => resolvePalette(workspace.selectedPaletteIds, workspace.colorCount, threadPalette),
    [workspace.selectedPaletteIds, workspace.colorCount, threadPalette],
  );

  useEffect(() => {
    const nextFingerprint = buildMatrixFingerprint(selectedCandidate?.id || null, workspace);
    if (matrixFingerprint === nextFingerprint && matrix) {
      return;
    }

    let cancelled = false;

    const derive = async () => {
      try {
        if (selectedCandidate?.imageUrl) {
          const nextMatrix = await imageToMatrix(
            selectedCandidate.imageUrl,
            workspace.gridDensity,
            workspace.colorCount,
            desiredPalette,
            threadPalette,
          );
          if (!cancelled) {
            setMatrix(nextMatrix);
            setMatrixFingerprint(nextFingerprint);
          }
          return;
        }

        const seedMatrix = createSeedMatrix(
          workspace.gridDensity,
          desiredPalette,
          workspace.theme,
          workspace.symmetryMode,
        );
        if (!cancelled) {
          setMatrix(seedMatrix);
          setMatrixFingerprint(nextFingerprint);
        }
      } catch (error) {
        console.error('Failed to derive matrix:', error);
        const seedMatrix = createSeedMatrix(
          workspace.gridDensity,
          desiredPalette,
          workspace.theme,
          workspace.symmetryMode,
        );
        if (!cancelled) {
          setMatrix(seedMatrix);
          setMatrixFingerprint(nextFingerprint);
        }
      }
    };

    void derive();

    return () => {
      cancelled = true;
    };
  }, [selectedCandidate?.id, selectedCandidate?.imageUrl, workspace, desiredPalette, matrixFingerprint, matrix, threadPalette]);

  useEffect(() => {
    if (!matrix) {
      setPathPlan(null);
      return;
    }
    setPathPlan(buildPathPlan(matrix, workspace.pathMode, workspace.pathDifficulty));
  }, [matrix, workspace.pathMode, workspace.pathDifficulty]);

  useEffect(() => {
    if (activeTab !== 'teaching' || !teachingPlaying) {
      return;
    }

    const totalSteps = 4;
    const timer = window.setInterval(() => {
      setTeachingStep((previous) => (previous + 1) % totalSteps);
    }, 1800);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeTab, teachingPlaying]);

  useEffect(() => {
    if (activeTab !== 'teaching') {
      setTeachingPlaying(false);
      setTeachingStep(0);
    }
  }, [activeTab]);

  const paletteSummary = useMemo(() => (matrix ? summarizePalette(matrix) : []), [matrix]);
  const teachingMatrix = useMemo(() => (matrix ? simplifyMatrixForTeaching(matrix) : null), [matrix]);
  const teachingPaletteSummary = useMemo(
    () => (teachingMatrix ? summarizePalette(teachingMatrix) : []),
    [teachingMatrix],
  );

  const backgroundPatterns = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        id: index,
        left: `${(index * 13 + 7) % 100}%`,
        top: `${(index * 19 + 11) % 100}%`,
        width: `${40 + ((index * 17) % 60)}px`,
        color: index % 3 === 0 ? '#c45c26' : index % 3 === 1 ? '#2c4a7c' : '#8b6914',
        animationDelay: `${index * 0.18}s`,
        animationDuration: `${3 + index * 0.4}s`,
      })),
    [],
  );

  const previewSvg = useMemo(() => {
    if (!matrix) {
      return '';
    }

    return matrixToSvg(matrix, {
      showGrid:
        canvasView === 'grid' || canvasView === 'regions' || canvasView === 'path',
      showNumbers: canvasView === 'grid' || canvasView === 'regions',
      showRegionNumbers: canvasView === 'regions' || canvasView === 'path',
      showLineart: canvasView === 'lineart',
      pathPlan: canvasView === 'path' ? pathPlan : null,
      background: canvasView === 'lineart' ? '#faf6ef' : undefined,
      cellSize: Math.max(8, Math.floor(320 / Math.max(matrix.size, 1))),
      padding: 24,
    });
  }, [matrix, canvasView, pathPlan]);

  const previewSvgUrl = useMemo(() => (previewSvg ? toSvgDataUrl(previewSvg) : ''), [previewSvg]);
  const basePreviewSvgUrl = useMemo(() => {
    if (!matrix) {
      return '';
    }
    return toSvgDataUrl(
      matrixToSvg(matrix, {
        cellSize: Math.max(8, Math.floor(320 / Math.max(matrix.size, 1))),
        padding: 24,
      }),
    );
  }, [matrix]);
  const overlaySvgUrl = useMemo(() => {
    if (!matrix || !overlayEnabled || canvasView === 'preview' || canvasView === 'editor') {
      return '';
    }

    const showGrid = canvasView === 'grid' || canvasView === 'regions' || canvasView === 'path';
    const showNumbers = canvasView === 'grid' || canvasView === 'regions';
    const showRegionNumbers = canvasView === 'regions' || canvasView === 'path';
    const showLineart = canvasView === 'lineart';

    return toSvgDataUrl(
      matrixToSvg(matrix, {
        showGrid,
        showNumbers,
        showRegionNumbers,
        showLineart,
        hideFills: !showLineart,
        transparentBackground: true,
        pathPlan: canvasView === 'path' ? pathPlan : null,
        cellSize: Math.max(8, Math.floor(320 / Math.max(matrix.size, 1))),
        padding: 24,
      }),
    );
  }, [matrix, overlayEnabled, canvasView, pathPlan]);

  const projectList = useMemo(() => {
    if (!session) {
      return projects;
    }
    return projects.filter((project) => project.ownerId === session.userId || project.ownerId === null);
  }, [projects, session]);

  const meaningFilters = useMemo(
    () => ['全部寓意', ...Array.from(new Set(libraryItems.map((item) => item.meaning).filter(Boolean)))],
    [libraryItems],
  );

  const sceneFilters = useMemo(
    () => ['全部场景', ...Array.from(new Set(libraryItems.map((item) => item.scene).filter(Boolean)))],
    [libraryItems],
  );

  const structureFilters = useMemo(
    () => ['全部结构', ...Array.from(new Set(libraryItems.map((item) => item.structure).filter(Boolean)))],
    [libraryItems],
  );

  const usageFilters = useMemo(
    () => ['全部用途', ...Array.from(new Set(libraryItems.map((item) => item.usage).filter(Boolean)))],
    [libraryItems],
  );

  const paletteFilters = useMemo(() => {
    const families = new Set<string>();
    libraryItems.forEach((item) => {
      item.palette.forEach((paletteId) => {
        const color = threadPalette.find((entry) => entry.id === paletteId);
        if (color?.family) {
          families.add(color.family);
        }
      });
    });
    return ['全部配色', ...Array.from(families)];
  }, [libraryItems, threadPalette]);

  const filteredLibrary = useMemo(() => {
    return libraryItems.filter((item) => {
      const matchesCategory = libraryFilter === '全部' || item.category === libraryFilter;
      const matchesMeaning = libraryMeaningFilter === '全部寓意' || item.meaning === libraryMeaningFilter;
      const matchesScene = librarySceneFilter === '全部场景' || item.scene === librarySceneFilter;
      const matchesStructure = libraryStructureFilter === '全部结构' || item.structure === libraryStructureFilter;
      const matchesUsage = libraryUsageFilter === '全部用途' || item.usage === libraryUsageFilter;
      const matchesPalette =
        libraryPaletteFilter === '全部配色' ||
        item.palette.some((paletteId) => threadPalette.find((entry) => entry.id === paletteId)?.family === libraryPaletteFilter);
      const matchesSearch =
        !librarySearch ||
        [item.title, item.meaning, item.description, item.scene, item.usage, item.keywords.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(librarySearch.toLowerCase());
      return (
        matchesCategory &&
        matchesMeaning &&
        matchesScene &&
        matchesStructure &&
        matchesUsage &&
        matchesPalette &&
        matchesSearch
      );
    });
  }, [
    libraryItems,
    libraryFilter,
    libraryMeaningFilter,
    librarySceneFilter,
    libraryStructureFilter,
    libraryUsageFilter,
    libraryPaletteFilter,
    librarySearch,
    threadPalette,
  ]);

  const generationProgress = generationTask?.progress;
  const progressPercent =
    generationProgress && generationProgress.total > 0
      ? Math.round(((generationProgress.success + generationProgress.failed) / generationProgress.total) * 100)
      : 0;

  const updateWorkspace = <K extends keyof WorkspaceState>(key: K, value: WorkspaceState[K]) => {
    setWorkspace((previous) => ({ ...previous, [key]: value }));
  };

  const handlePaletteToggle = (colorId: string) => {
    setWorkspace((previous) => {
      const alreadySelected = previous.selectedPaletteIds.includes(colorId);
      let next = alreadySelected
        ? previous.selectedPaletteIds.filter((item) => item !== colorId)
        : [...previous.selectedPaletteIds, colorId];

      if (next.length === 0) {
        next = [colorId];
      }

      if (next.length > previous.colorCount) {
        next = next.slice(next.length - previous.colorCount);
      }

      return {
        ...previous,
        selectedPaletteIds: next,
      };
    });
    setSelectedColorId(colorId);
  };

  const handleColorCountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseInt(event.target.value, 10);
    setWorkspace((previous) => ({
      ...previous,
      colorCount: value,
      selectedPaletteIds: previous.selectedPaletteIds.slice(0, value),
    }));
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }
    const accepted = files.filter((file) => file.type.startsWith('image/'));
    const oversized = accepted.filter((file) => file.size > 8 * 1024 * 1024);
    const underSizeLimit = accepted.filter((file) => file.size <= 8 * 1024 * 1024);
    const dimensionResults = await Promise.all(
      underSizeLimit.map(async (file) => ({
        file,
        dimensions: await readImageDimensions(file),
      })),
    );
    const tooSmall = dimensionResults.filter(
      ({ dimensions }) => dimensions.width < 256 || dimensions.height < 256,
    );
    const valid = dimensionResults
      .filter(({ dimensions }) => dimensions.width >= 256 && dimensions.height >= 256)
      .map(({ file }) => file);
    const notices = [];
    if (oversized.length > 0) {
      notices.push(`已跳过 ${oversized.length} 张超过 8MB 的图片`);
    }
    if (tooSmall.length > 0) {
      notices.push(`已跳过 ${tooSmall.length} 张尺寸低于 256px 的图片`);
    }
    notices.push('上传素材会在生成前自动压缩到适合的尺寸');
    setUploadFeedback(`${notices.join('，')}。`);
    setUploadedFiles((previous) => [...previous, ...valid].slice(0, 6));
    event.target.value = '';
  };

  const handleRemoveUpload = (index: number) => {
    setUploadedFiles((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  };

  const moveUpload = (index: number, direction: -1 | 1) => {
    setUploadedFiles((previous) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= previous.length) {
        return previous;
      }
      const next = [...previous];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const handleGenerate = async () => {
    setStatusMessage('');
    setGenerationTask(createEmptyTask(workspace, templates, threadPalette));
    setSelectedCandidateId(null);
    setActiveGenerationId(null);

    try {
      const uploadedImages =
        uploadedFiles.length > 0
          ? await Promise.all(uploadedFiles.map((file) => compressImageForGeneration(file)))
          : [createSeedPatternDataUrl(workspace.theme)];

      const request = buildGenerationRequest(workspace, templates, uploadedImages, threadPalette);
      const result = await submitGeneration(request);
      setGenerationTask({
        id: result.generationId,
        createdAt: new Date().toISOString(),
        request,
        status: 'processing',
        progress: {
          total: request.generationCount,
          success: 0,
          failed: 0,
          pending: request.generationCount,
        },
        candidates: [],
      });
      setActiveGenerationId(result.generationId);
      setStatusMessage('生成任务已提交，正在轮询候选结果…');
      setActiveTab('workspace');
      setCanvasView('preview');
    } catch (error) {
      console.error('Generation failed:', error);
      setGenerationTask((previous) =>
        previous
          ? {
              ...previous,
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : '生成失败',
            }
          : null,
      );
      setStatusMessage(error instanceof Error ? error.message : '生成失败');
    }
  };

  const handleFavoriteToggle = (candidateId: string) => {
    const next = toggleFavoriteCandidate(candidateId);
    setFavoriteIds(new Set(next));
  };

  const handleRebuildMatrix = async () => {
    setMatrixFingerprint('');
  };

  const handleExport = async (kind: ExportKind) => {
    if (!matrix) {
      setStatusMessage('当前还没有可导出的格纹稿');
      return;
    }

    try {
      const activeRenderableKind: ExportKind =
        canvasView === 'path'
          ? 'path'
          : canvasView === 'grid'
            ? 'grid'
            : canvasView === 'regions'
              ? 'regions'
              : canvasView === 'lineart'
                ? 'lineart'
                : 'preview';
      if (kind === 'pdf' || kind === 'craftsheet') {
        await downloadPdf(matrix, workspace, pathPlan);
      } else if (kind === 'svg') {
        await downloadSvg(activeRenderableKind, matrix, pathPlan);
      } else if (kind === 'png') {
        await downloadPng(activeRenderableKind, matrix, pathPlan);
      } else if (
        kind === 'grid' ||
        kind === 'path' ||
        kind === 'teaching' ||
        kind === 'preview' ||
        kind === 'regions' ||
        kind === 'lineart'
      ) {
        await downloadPng(kind, matrix, pathPlan);
      } else if (kind === 'palette') {
        const paletteLines = paletteSummary
          .map((item) => `${item.color.name},${item.color.hex},${item.color.thread},${item.count},${Math.round(item.ratio * 100)}%`)
          .join('\n');
        const blob = new Blob([`名称,HEX,线号,格数,占比\n${paletteLines}`], {
          type: 'text/csv;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'xilankapu-palette.csv';
        link.click();
        URL.revokeObjectURL(url);
      }
      setStatusMessage('导出完成');
      if (loadedProjectId) {
        const nextProjects = projects.map((project) =>
          project.id === loadedProjectId
            ? {
                ...project,
                exportHistory: [
                  ...project.exportHistory,
                  { id: crypto.randomUUID(), kind, createdAt: new Date().toISOString() },
                ],
                updatedAt: new Date().toISOString(),
              }
            : project,
        );
        setProjectsState(nextProjects);
        saveProjects(nextProjects);
      }
    } catch (error) {
      console.error('Export failed:', error);
      setStatusMessage(error instanceof Error ? error.message : '导出失败');
    }
  };

  const handleSingleCandidateDownload = async (candidate: CandidateResult) => {
    try {
      await downloadCandidateImage(candidate);
      setStatusMessage(`已下载：${candidate.name}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '候选图下载失败');
    }
  };

  const handleBatchCandidateDownload = async () => {
    if (activeCandidates.length === 0) {
      setStatusMessage('当前没有可批量下载的候选图');
      return;
    }
    try {
      await downloadCandidateBatch(activeCandidates);
      setStatusMessage(`已批量下载 ${activeCandidates.length} 张候选图`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '批量下载失败');
    }
  };

  const handleSaveProject = (note = '手动保存') => {
    const now = new Date().toISOString();
    const projectId = loadedProjectId || crypto.randomUUID();
    const project: SavedProject = {
      id: projectId,
      ownerId: session?.userId || null,
      name: workspace.projectName || '未命名项目',
      createdAt: loadedProjectId
        ? projects.find((item) => item.id === loadedProjectId)?.createdAt || now
        : now,
      updatedAt: now,
      workspace,
      selectedCandidate,
      matrix,
      pathPlan,
      exportHistory:
        projects.find((item) => item.id === projectId)?.exportHistory || [],
      versions: [
        ...(projects.find((item) => item.id === projectId)?.versions || []),
        {
          id: crypto.randomUUID(),
          createdAt: now,
          note,
        },
      ],
    };

    const nextProjects = [...projects.filter((item) => item.id !== projectId), project].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    setProjectsState(nextProjects);
    saveProjects(nextProjects);
    setLoadedProjectId(projectId);
    setProjectFeedback('项目已保存');
    setTimeout(() => setProjectFeedback(''), 2500);
  };

  const loadProject = (project: SavedProject) => {
    const mergedWorkspace = {
      ...DEFAULT_WORKSPACE_STATE,
      ...project.workspace,
    };
    setWorkspace(mergedWorkspace);
    setLoadedProjectId(project.id);
    setProjectFeedback(`已载入项目：${project.name}`);
    setMatrix(project.matrix);
    setPathPlan(project.pathPlan);
    setSelectedCandidateId(project.selectedCandidate?.id || null);
    setGenerationTask(
      project.selectedCandidate
        ? {
            id: `saved-${project.id}`,
            createdAt: project.updatedAt,
            request: buildGenerationRequest(mergedWorkspace, templates, [], threadPalette),
            status: 'completed',
            progress: {
              total: 1,
              success: 1,
              failed: 0,
              pending: 0,
            },
            candidates: [project.selectedCandidate],
          }
        : null,
    );
    setMatrixFingerprint(buildMatrixFingerprint(project.selectedCandidate?.id || null, mergedWorkspace));
    setActiveTab('workspace');
  };

  const deleteProject = (projectId: string) => {
    const next = projects.filter((project) => project.id !== projectId);
    setProjectsState(next);
    saveProjects(next);
    if (loadedProjectId === projectId) {
      setLoadedProjectId(null);
    }
  };

  const handleLogin = (username: string, password: string) => {
    const user = users.find((item) => item.username === username && item.password === password);
    if (!user) {
      return '用户名或密码错误';
    }
    const nextSession: AuthSession = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
    setSession(nextSession);
    setCurrentSession(nextSession);
    return null;
  };

  const handleRegister = (username: string, displayName: string, password: string) => {
    if (!username || !displayName || !password) {
      return '请填写完整信息';
    }
    if (users.some((item) => item.username === username)) {
      return '用户名已存在';
    }
    const nextUser: UserAccount = {
      id: crypto.randomUUID(),
      username,
      displayName,
      password,
      role: 'user',
      createdAt: new Date().toISOString(),
    };
    const nextUsers = [...users, nextUser];
    setUsers(nextUsers);
    saveUsers(nextUsers);
    const nextSession: AuthSession = {
      userId: nextUser.id,
      username: nextUser.username,
      displayName: nextUser.displayName,
      role: nextUser.role,
    };
    setSession(nextSession);
    setCurrentSession(nextSession);
    return null;
  };

  const logout = () => {
    setSession(null);
    setCurrentSession(null);
  };

  const applyLibraryItem = (item: PatternLibraryItem) => {
    setWorkspace((previous) => ({
      ...previous,
      theme: item.title,
      subjectObject: item.title,
      sceneType: item.scene || previous.sceneType,
      motifCategory: item.category,
      culturalMeaning: item.meaning,
      promptText: `${item.description} 构成方式：${item.structure}。`,
      selectedPaletteIds: item.palette,
      projectName: `${item.title}纹样项目`,
    }));
    setActiveTab('workspace');
  };

  const beginLibraryEdit = (item: PatternLibraryItem) => {
    setEditingLibraryId(item.id);
    setEditingLibraryDraft({ ...item });
  };

  const saveLibraryDraft = () => {
    if (!editingLibraryDraft) {
      return;
    }
    const nextItems = editingLibraryId
      ? libraryItems.map((item) => (item.id === editingLibraryId ? editingLibraryDraft : item))
      : [...libraryItems, { ...editingLibraryDraft, id: crypto.randomUUID() }];
    setLibraryItems(nextItems);
    saveLibraryItems(nextItems);
    setEditingLibraryId(null);
    setEditingLibraryDraft(null);
  };

  const startNewLibraryItem = () => {
    setEditingLibraryId(null);
    setEditingLibraryDraft({
      id: '',
      title: '',
      category: '主题纹',
      meaning: '',
      structure: '',
      scene: '',
      usage: '',
      description: '',
      palette: desiredPalette.map((item) => item.id),
      keywords: [],
    });
  };

  const saveTemplateDraft = () => {
    savePromptTemplates(templates);
    setStatusMessage('提示模板已保存');
  };

  const beginThreadPaletteEdit = (color: ThreadColor) => {
    setEditingThreadColorId(color.id);
    setEditingThreadColorDraft({ ...color });
  };

  const startNewThreadColor = () => {
    setEditingThreadColorId(null);
    setEditingThreadColorDraft({
      id: '',
      name: '',
      hex: '#c45c26',
      thread: '',
      family: 'warm',
    });
  };

  const saveThreadColorDraft = () => {
    if (!editingThreadColorDraft) {
      return;
    }

    const nextDraft = {
      ...editingThreadColorDraft,
      id:
        editingThreadColorDraft.id.trim() ||
        editingThreadColorDraft.name.trim().toLowerCase().replace(/\s+/g, '-') ||
        crypto.randomUUID(),
    };

    const nextPalette = editingThreadColorId
      ? threadPalette.map((item) => (item.id === editingThreadColorId ? nextDraft : item))
      : [...threadPalette, nextDraft];

    setThreadPalette(nextPalette);
    saveThreadPalette(nextPalette);
    setEditingThreadColorId(nextDraft.id);
    setEditingThreadColorDraft(nextDraft);
    setStatusMessage('色彩方案已保存');
  };

  const handleEditorCellClick = (x: number, y: number) => {
    if (!matrix) {
      return;
    }
    if (editorTool === 'paint') {
      setMatrix(paintCell(matrix, x, y, selectedColorId));
      return;
    }
    if (editorTool === 'lock') {
      setMatrix(toggleCellLock(matrix, x, y));
      return;
    }

    const clickedColorId = matrix.cells[y][x].colorId;
    setSelectedColorId(clickedColorId);
  };

  const categories = useMemo(
    () => ['全部', ...Array.from(new Set(libraryItems.map((item) => item.category)))],
    [libraryItems],
  );

  const teachingSlides = useMemo(
    () => [
      {
        title: '1. 主题与来源',
        description: `主题：${workspace.theme}；主体对象：${workspace.subjectObject || workspace.theme}；应用场景：${workspace.sceneType || '教学制作'}`,
      },
      {
        title: '2. 色卡与主色',
        description:
          teachingPaletteSummary.length > 0
            ? teachingPaletteSummary
                .slice(0, 4)
                .map((item) => `${item.color.name} ${Math.round(item.ratio * 100)}%`)
                .join(' / ')
            : '生成后将显示教学色卡。',
      },
      {
        title: '3. 教学简化稿',
        description: teachingMatrix ? teachingMatrix.sourceLabel : '当前还没有可用于教学拆解的格纹稿。',
      },
      {
        title: '4. 路径推进',
        description:
          pathPlan?.steps[0]
            ? `${pathPlan.steps[0].title}，共 ${pathPlan.steps.length} 步，当前策略为${workspace.pathDifficulty === 'beginner' ? '初学者' : '标准'}模式。`
            : '当前还没有路径建议。',
      },
    ],
    [workspace.theme, workspace.subjectObject, workspace.sceneType, teachingPaletteSummary, teachingMatrix, pathPlan, workspace.pathDifficulty],
  );

  const renderCanvasContent = () => {
    if (generationTask?.status === 'processing' && activeCandidates.length === 0) {
      return (
        <div className="canvas-generating">
          <div className="generating-animation">
            <XilankapuPattern className="generating-pattern" />
          </div>
          <p>正在生成纹样方案…</p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      );
    }

    if (!matrix || !previewSvgUrl) {
      return (
        <div className="canvas-placeholder">
          <XilankapuPattern className="placeholder-pattern" />
          <p>输入主题词、选择配色并点击生成，即可得到候选纹样、格纹稿和路径图。</p>
        </div>
      );
    }

    if (canvasView === 'editor') {
      const paletteMap = new Map(matrix.palette.map((color) => [color.id, color]));
      return (
        <div className="editor-stage">
          <div
            className="editor-grid"
            style={{ gridTemplateColumns: `repeat(${matrix.size}, minmax(10px, 1fr))` }}
          >
            {matrix.cells.flatMap((row, y) =>
              row.map((cell: MatrixCell, x) => {
                const color = paletteMap.get(cell.colorId) || threadPalette[0] || DEFAULT_THREAD_PALETTE[0];
                return (
                  <button
                    key={`${x}-${y}`}
                    type="button"
                    className={`editor-cell ${cell.locked ? 'locked' : ''}`}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => handleEditorCellClick(x, y)}
                    title={`${x + 1}, ${y + 1}`}
                  >
                    {cell.locked ? '•' : ''}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="canvas-result">
        <div className="result-main">
          {overlayEnabled && canvasView !== 'preview' ? (
            <div className="result-overlay-stack">
              <img
                src={selectedCandidate?.imageUrl || basePreviewSvgUrl}
                alt="纹样底图"
                className="result-image overlay-base"
              />
              {overlaySvgUrl && <img src={overlaySvgUrl} alt="叠加标注" className="result-image overlay-layer" />}
            </div>
          ) : (
            <img src={previewSvgUrl} alt="当前纹样预览" className="result-image" />
          )}
        </div>
        <div className="result-info">
          <span className="result-name">{selectedCandidate?.name || `${workspace.theme}纹样稿`}</span>
          <span className="result-meta">
            {workspace.motifCategory} · {complexityText(workspace.complexity)} · {workspace.colorCount}色 · {densityText(workspace.density)}
          </span>
          {selectedCandidate && (
            <div className="candidate-tag-group center">
              {(selectedCandidate.structureTags || []).slice(0, 4).map((tag) => (
                <span key={`selected-structure-${tag}`} className="chip small">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <div className="bg-patterns">
        {backgroundPatterns.map((item) => (
          <PatternTile
            key={item.id}
            style={{
              position: 'absolute',
              left: item.left,
              top: item.top,
              width: item.width,
              color: item.color,
              opacity: 0.24,
              animation: `pulse ${item.animationDuration} ease-in-out infinite`,
              animationDelay: item.animationDelay,
            }}
          />
        ))}
      </div>

      <nav className="navbar">
        <div className="nav-brand">
          <div className="brand-pattern">
            <XilankapuPattern className="brand-icon" />
          </div>
          <div className="brand-text">
            <span className="brand-name">西兰卡普</span>
            <span className="brand-subtitle">AI 纹样生成与绣制辅助平台</span>
          </div>
        </div>

        <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
          {[
            ['home', '首页'],
            ['workspace', '工作台'],
            ['library', '纹样库'],
            ['projects', '我的项目'],
            ['teaching', '教学'],
            ['export', '导出'],
            ['about', '关于'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              className={`nav-link ${activeTab === tab ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(tab as AppTab);
                setMenuOpen(false);
              }}
            >
              {label}
            </button>
          ))}
          {session?.role === 'admin' && (
            <button
              className={`nav-link ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('admin');
                setMenuOpen(false);
              }}
            >
              管理
            </button>
          )}
          {session ? (
            <button className="nav-link user-pill" onClick={logout}>
              {session.displayName} · 退出
            </button>
          ) : (
            <>
              <button className="nav-link user-pill" onClick={() => setAuthMode('login')}>
                登录
              </button>
              <button className="nav-link user-pill" onClick={() => setAuthMode('register')}>
                注册
              </button>
            </>
          )}
        </div>

        <button className="menu-toggle" onClick={() => setMenuOpen((previous) => !previous)}>
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'home' && (
          <section className="hero-section">
            <div className="hero-content">
              <div className="hero-text animate-fade-in-up">
                <h1 className="hero-title">
                  <span className="title-accent">非遗</span>
                  与数字工艺的相遇
                </h1>
                <p className="hero-description">
                  围绕土家族西兰卡普纹样体系，平台提供 AI 纹样生成、格纹拆解、配色编号、刺绣路径提示与可打印导出，
                  让创作、教学和手工制作进入同一条工作流。
                </p>
                <div className="hero-actions">
                  <button className="btn-primary" onClick={() => setActiveTab('workspace')}>
                    <span>开始创作</span>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10h12M12 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setActiveTab('workspace');
                      homeUploadInputRef.current?.click();
                    }}
                  >
                    <span>上传参考图</span>
                  </button>
                  <button className="btn-secondary" onClick={() => setActiveTab('library')}>
                    <span>查看纹样库</span>
                  </button>
                  <button className="btn-secondary" onClick={() => setActiveTab('teaching')}>
                    <span>进入教学模式</span>
                  </button>
                </div>
                <input
                  ref={homeUploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="upload-input"
                  onChange={(event) => {
                    void handleUpload(event);
                  }}
                />
                <p className="hero-mini-note">{STORAGE_NOTE}</p>
              </div>

              <div className="hero-visual animate-fade-in-up delay-300">
                <div className="pattern-showcase">
                  <div className="showcase-frame">
                    <XilankapuPattern className="showcase-pattern" />
                    <div className="showcase-grid-overlay" />
                  </div>
                  <div className="showcase-label">
                    <span className="label-title">传统纹样 · 数字拆解</span>
                    <span className="label-desc">生成、编辑、网格、路径、导出</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="features-section">
              <div className="features-grid">
                {[
                  { icon: '✦', title: 'AI 智能生成', desc: '多候选纹样，并保留传统风格约束' },
                  { icon: '◈', title: '格纹编辑', desc: '可直接在网格上改色、锁定、镜像、旋转' },
                  { icon: '▣', title: '工艺辅助', desc: '自动生成色卡表、格纹图和路径建议' },
                  { icon: '◇', title: '教学导出', desc: 'PNG / SVG / PDF 一键导出打印' },
                ].map((feature, index) => (
                  <div key={feature.title} className="feature-card animate-fade-in-up" style={{ animationDelay: `${0.35 + index * 0.1}s` }}>
                    <span className="feature-icon">{feature.icon}</span>
                    <h3 className="feature-title">{feature.title}</h3>
                    <p className="feature-desc">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <section className="workflow-section">
              <div className="workflow-card">
                <h3>创作闭环</h3>
                <ol>
                  <li>输入主题与寓意，选择纹样类型和配色</li>
                  <li>生成多张候选纹样并挑选最佳方案</li>
                  <li>自动拆解格纹，再进入编辑模式微调</li>
                  <li>输出色卡、路径图与教学导出单</li>
                </ol>
              </div>
              <div className="workflow-card">
                <h3>推荐主题</h3>
                <div className="chip-row">
                  {['太阳纹', '吉祥鸟', '梯玛纹', '婚嫁纹', '山水纹', '边饰回纹'].map((item) => (
                    <button key={item} className="chip" onClick={() => setWorkspace((previous) => ({ ...previous, theme: item, projectName: `${item}项目` }))}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="page-shell case-gallery-section">
              <div className="page-header">
                <div>
                  <h2>案例画廊</h2>
                  <p>从典型纹样案例直接进入工作台，快速演示“案例参考 - 生成 - 拆解 - 导出”的完整流程。</p>
                </div>
              </div>
              <div className="gallery-grid">
                {libraryItems.slice(0, 6).map((item) => (
                  <article key={item.id} className="gallery-card">
                    <div className="gallery-card-top">
                      <span className="knowledge-badge">{item.category}</span>
                      <div className="gallery-palette">
                        {item.palette.map((paletteId) => {
                          const color = threadPalette.find((entry) => entry.id === paletteId);
                          return (
                            <span
                              key={paletteId}
                              className="color-swatch static"
                              style={{ backgroundColor: color?.hex || '#333' }}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <h3>{item.title}</h3>
                    <p className="knowledge-meta">{item.meaning}</p>
                    <p className="knowledge-desc">{item.description}</p>
                    <button className="btn-secondary card-action" onClick={() => applyLibraryItem(item)}>
                      用此案例创作
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </section>
        )}

        {activeTab === 'workspace' && (
          <section className="workspace-section">
            <aside className="workspace-sidebar">
              <div className="sidebar-section">
                <h3 className="sidebar-title">项目</h3>
                <div className="param-group">
                  <label className="param-label">项目名称</label>
                  <input
                    className="param-input"
                    value={workspace.projectName}
                    onChange={(event) => updateWorkspace('projectName', event.target.value)}
                  />
                </div>
                <div className="toolbar-row">
                  <button className="btn-secondary compact" onClick={() => handleSaveProject('手动保存当前项目')}>
                    保存项目
                  </button>
                  <button className="btn-secondary compact" onClick={handleRebuildMatrix}>
                    重新拆解
                  </button>
                </div>
                {projectFeedback && <p className="form-hint success-text">{projectFeedback}</p>}
              </div>

              <div className="sidebar-section">
                <h3 className="sidebar-title">生成参数</h3>
                <div className="param-group">
                  <label className="param-label">主题词</label>
                  <input
                    className="param-input"
                    value={workspace.theme}
                    onChange={(event) => updateWorkspace('theme', event.target.value)}
                  />
                </div>
                <div className="two-column-row">
                  <div className="param-group">
                    <label className="param-label">主体对象</label>
                    <input
                      className="param-input"
                      value={workspace.subjectObject}
                      onChange={(event) => updateWorkspace('subjectObject', event.target.value)}
                    />
                  </div>
                  <div className="param-group">
                    <label className="param-label">应用场景</label>
                    <input
                      className="param-input"
                      value={workspace.sceneType}
                      onChange={(event) => updateWorkspace('sceneType', event.target.value)}
                    />
                  </div>
                </div>
                <div className="param-group">
                  <label className="param-label">纹样类型</label>
                  <select className="param-select" value={workspace.motifCategory} onChange={(event) => updateWorkspace('motifCategory', event.target.value)}>
                    {['中心纹', '主题纹', '边饰纹', '连续纹', '角饰纹'].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div className="param-group">
                  <label className="param-label">文化寓意</label>
                  <textarea
                    className="param-input textarea"
                    value={workspace.culturalMeaning}
                    onChange={(event) => updateWorkspace('culturalMeaning', event.target.value)}
                  />
                </div>
                <div className="param-group">
                  <label className="param-label">提示描述</label>
                  <textarea
                    className="param-input textarea"
                    value={workspace.promptText}
                    onChange={(event) => updateWorkspace('promptText', event.target.value)}
                  />
                </div>
                <div className="param-group">
                  <label className="param-label">主色倾向</label>
                  <input
                    className="param-input"
                    value={workspace.colorMood}
                    onChange={(event) => updateWorkspace('colorMood', event.target.value)}
                  />
                </div>
                <div className="param-group">
                  <label className="param-label">对称方式</label>
                  <select className="param-select" value={workspace.symmetryMode} onChange={(event) => updateWorkspace('symmetryMode', event.target.value as WorkspaceState['symmetryMode'])}>
                    <option value="quad">四面对称</option>
                    <option value="mirror">镜像对称</option>
                    <option value="rotation">旋转对称</option>
                    <option value="free">自由构成</option>
                  </select>
                </div>
                <div className="param-group">
                  <label className="param-label">复杂度：{complexityText(workspace.complexity)}</label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={workspace.complexity}
                    className="param-slider"
                    onChange={(event) => updateWorkspace('complexity', Number.parseInt(event.target.value, 10) as WorkspaceState['complexity'])}
                  />
                </div>
                <div className="two-column-row">
                  <div className="param-group">
                    <label className="param-label">疏密</label>
                    <select className="param-select" value={workspace.density} onChange={(event) => updateWorkspace('density', event.target.value as WorkspaceState['density'])}>
                      <option value="airy">疏朗</option>
                      <option value="balanced">均衡</option>
                      <option value="dense">紧密</option>
                    </select>
                  </div>
                  <div className="param-group">
                    <label className="param-label">传统程度</label>
                    <select className="param-select" value={workspace.tradition} onChange={(event) => updateWorkspace('tradition', event.target.value as WorkspaceState['tradition'])}>
                      <option value="traditional">传统</option>
                      <option value="balanced">平衡</option>
                      <option value="innovative">创新</option>
                    </select>
                  </div>
                </div>
                <div className="two-column-row">
                  <div className="param-group">
                    <label className="param-label">候选数量</label>
                    <input
                      type="range"
                      min="1"
                      max="6"
                      value={workspace.generationCount}
                      className="param-slider"
                      onChange={(event) => updateWorkspace('generationCount', Number.parseInt(event.target.value, 10))}
                    />
                    <span className="slider-label">{workspace.generationCount} 张</span>
                  </div>
                  <div className="param-group">
                    <label className="param-label">配色数量</label>
                    <input
                      type="range"
                      min="3"
                      max="8"
                      value={workspace.colorCount}
                      className="param-slider"
                      onChange={handleColorCountChange}
                    />
                    <span className="slider-label">{workspace.colorCount} 色</span>
                  </div>
                </div>
                <div className="two-column-row">
                  <div className="param-group">
                    <label className="param-label">网格密度</label>
                    <select
                      className="param-select"
                      value={workspace.gridDensity}
                      onChange={(event) => updateWorkspace('gridDensity', Number.parseInt(event.target.value, 10))}
                    >
                      <option value={16}>粗网格</option>
                      <option value={24}>中网格</option>
                      <option value={32}>细网格</option>
                    </select>
                  </div>
                  <div className="param-group">
                    <label className="param-label">AI补全</label>
                    <select
                      className="param-select"
                      value={workspace.aiCompletionEnabled ? 'on' : 'off'}
                      onChange={(event) => updateWorkspace('aiCompletionEnabled', event.target.value === 'on')}
                    >
                      <option value="on">开启</option>
                      <option value="off">关闭</option>
                    </select>
                  </div>
                </div>
                <div className="param-group">
                  <label className="param-label">配色方案</label>
                  <div className="color-palette">
                    {threadPalette.map((color) => (
                      <button
                        key={color.id}
                        className={`color-swatch ${workspace.selectedPaletteIds.includes(color.id) ? 'selected' : ''}`}
                        style={{ backgroundColor: color.hex }}
                        title={`${color.name} ${color.thread}`}
                        onClick={() => handlePaletteToggle(color.id)}
                      />
                    ))}
                  </div>
                </div>
                <div className="param-group">
                  <label className="param-label">AI 补全说明</label>
                  <textarea
                    className="param-input textarea"
                    value={workspace.aiCompletionPrompt}
                    onChange={(event) => updateWorkspace('aiCompletionPrompt', event.target.value)}
                  />
                </div>
                <button className={`btn-generate ${generationTask?.status === 'processing' ? 'generating' : ''}`} onClick={handleGenerate} disabled={generationTask?.status === 'processing'}>
                  {generationTask?.status === 'processing' ? (
                    <>
                      <span className="spinner" />
                      <span>生成中…</span>
                    </>
                  ) : (
                    '生成纹样'
                  )}
                </button>
                {statusMessage && <p className="form-hint">{statusMessage}</p>}
              </div>

              <div className="sidebar-section">
                <h3 className="sidebar-title">参考素材</h3>
                <label className="upload-tile">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      void handleUpload(event);
                    }}
                    className="upload-input"
                  />
                  <span>上传参考图或手稿</span>
                </label>
                <div className="upload-preview-list">
                  {uploadedPreviews.length === 0 && <p className="form-hint">未上传素材时会自动使用内置纹样种子图。</p>}
                  {uploadFeedback && <p className="form-hint">{uploadFeedback}</p>}
                  {uploadedPreviews.map((preview, index) => (
                    <div key={preview} className="upload-preview-card">
                      <img src={preview} alt={`参考图${index + 1}`} />
                      <div className="upload-card-actions">
                        <button className="mini-action" onClick={() => moveUpload(index, -1)} disabled={index === 0}>
                          上移
                        </button>
                        <button
                          className="mini-action"
                          onClick={() => moveUpload(index, 1)}
                          disabled={index === uploadedPreviews.length - 1}
                        >
                          下移
                        </button>
                        <button className="mini-action" onClick={() => handleRemoveUpload(index)}>
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sidebar-section">
                <h3 className="sidebar-title">导出选项</h3>
                <div className="two-column-row">
                  <div className="param-group">
                    <label className="param-label">纸张大小</label>
                    <select
                      className="param-select"
                      value={workspace.paperSize}
                      onChange={(event) => updateWorkspace('paperSize', event.target.value as WorkspaceState['paperSize'])}
                    >
                      <option value="a4">A4</option>
                      <option value="a3">A3</option>
                    </select>
                  </div>
                  <div className="param-group">
                    <label className="param-label">页面方向</label>
                    <select
                      className="param-select"
                      value={workspace.pageOrientation}
                      onChange={(event) =>
                        updateWorkspace('pageOrientation', event.target.value as WorkspaceState['pageOrientation'])
                      }
                    >
                      <option value="portrait">竖版</option>
                      <option value="landscape">横版</option>
                    </select>
                  </div>
                </div>
                <div className="param-group">
                  <label className="param-label">分页导出</label>
                  <select
                    className="param-select"
                    value={workspace.paginateExport ? 'on' : 'off'}
                    onChange={(event) => updateWorkspace('paginateExport', event.target.value === 'on')}
                  >
                    <option value="on">自动分页</option>
                    <option value="off">单页优先</option>
                  </select>
                </div>
                <div className="export-options">
                  <button className="export-btn" onClick={() => handleExport('lineart')}>
                    <span>线稿图</span>
                  </button>
                  <button className="export-btn" onClick={() => handleExport('regions')}>
                    <span>编号图</span>
                  </button>
                  <button className="export-btn" onClick={() => handleExport('grid')}>
                    <span>网格图</span>
                  </button>
                  <button className="export-btn" onClick={() => handleExport('path')}>
                    <span>路径图</span>
                  </button>
                  <button className="export-btn" onClick={() => handleExport('palette')}>
                    <span>色卡表</span>
                  </button>
                  <button className="export-btn" onClick={() => handleExport('svg')}>
                    <span>SVG</span>
                  </button>
                  <button className="export-btn" onClick={() => handleExport('png')}>
                    <span>PNG</span>
                  </button>
                  <button className="export-btn primary" onClick={() => handleExport('pdf')}>
                    <span>综合工艺单 PDF</span>
                  </button>
                </div>
                <button className="btn-secondary compact card-action" onClick={() => setActiveTab('export')}>
                  打开导出页
                </button>
              </div>
            </aside>

            <div className="workspace-canvas">
              <div className="canvas-header">
                <div className="canvas-tabs">
                  {[
                    ['preview', '纹样预览'],
                    ['grid', '网格视图'],
                    ['regions', '区域编号'],
                    ['lineart', '线稿视图'],
                    ['path', '路径视图'],
                    ['editor', '编辑模式'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`canvas-tab ${canvasView === value ? 'active' : ''}`}
                      onClick={() => setCanvasView(value as CanvasView)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="canvas-tools">
                  <button
                    className={`tool-btn ${overlayEnabled ? 'active' : ''}`}
                    onClick={() => setOverlayEnabled((previous) => !previous)}
                    title="叠加预览"
                  >
                    叠
                  </button>
                  <button
                    className="tool-btn"
                    onClick={() => matrix && setMatrix(strengthenMainMotif(matrix))}
                    title="强化主纹"
                  >
                    主
                  </button>
                  <button
                    className="tool-btn"
                    onClick={() => matrix && setMatrix(strengthenBorderPattern(matrix))}
                    title="强化边饰"
                  >
                    边
                  </button>
                  <button className="tool-btn" onClick={() => matrix && setMatrix(mirrorMatrix(matrix))} title="镜像">
                    ⇋
                  </button>
                  <button className="tool-btn" onClick={() => matrix && setMatrix(rotateMatrix(matrix))} title="旋转">
                    ↻
                  </button>
                  <button className="tool-btn" onClick={() => matrix && setMatrix(repeatMatrix(matrix))} title="重复">
                    ⌘
                  </button>
                  <button className="tool-btn" onClick={handleRebuildMatrix} title="重建">
                    ↺
                  </button>
                </div>
              </div>

              {canvasView !== 'editor' && canvasView !== 'preview' && (
                <div className="overlay-status-bar">
                  <span>叠加预览：{overlayEnabled ? '开启' : '关闭'}</span>
                  <span>可在原纹样上查看网格、编号、线稿和路径覆盖效果</span>
                </div>
              )}

              {canvasView === 'editor' && (
                <div className="editor-toolbar">
                  <div className="editor-tool-group">
                    {[
                      ['paint', '上色'],
                      ['lock', '锁定'],
                      ['picker', '取色'],
                    ].map(([tool, label]) => (
                      <button
                        key={tool}
                        className={`tool-chip ${editorTool === tool ? 'active' : ''}`}
                        onClick={() => setEditorTool(tool as EditorTool)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="editor-tool-group">
                    {desiredPalette.map((color) => (
                      <button
                        key={color.id}
                        className={`editor-swatch ${selectedColorId === color.id ? 'active' : ''}`}
                        style={{ backgroundColor: color.hex }}
                        title={color.name}
                        onClick={() => setSelectedColorId(color.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="canvas-area">{renderCanvasContent()}</div>
            </div>

            <aside className="workspace-info">
              <div className="info-section">
                <div className="section-head-row">
                  <h3 className="info-title no-border">候选方案</h3>
                  <div className="toolbar-row compact-row">
                    <button className="mini-action" onClick={handleBatchCandidateDownload}>
                      批量下载
                    </button>
                    <button className="mini-action" onClick={() => void handleGenerate()}>
                      再次生成
                    </button>
                  </div>
                </div>
                <div className="candidate-status-line">
                  <span>状态：{generationTask?.status || '未生成'}</span>
                  {generationTask && <span>{generationTask.progress.success}/{generationTask.progress.total}</span>}
                </div>
                {generationTask?.id && (
                  <p className="form-hint task-id-line">任务编号：{generationTask.id}</p>
                )}
                <div className="candidates-grid">
                  {activeCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className={`candidate-card ${selectedCandidateId === candidate.id ? 'selected' : ''}`}
                      onClick={() => setSelectedCandidateId(candidate.id)}
                    >
                      <div className="candidate-preview image">
                        <img src={candidate.imageUrl} alt={candidate.name} />
                      </div>
                      <div className="candidate-info">
                        <span className="candidate-name">{candidate.name}</span>
                        <div className="candidate-tag-group">
                          {(candidate.structureTags || []).slice(0, 3).map((tag) => (
                            <span key={`${candidate.id}-${tag}`} className="chip small">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="candidate-tag-group muted">
                          {(candidate.colorTags || []).slice(0, 3).map((tag) => (
                            <span key={`${candidate.id}-color-${tag}`} className="chip small">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="candidate-actions">
                          <button
                            className="mini-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPreviewCandidate(candidate);
                            }}
                          >
                            预览
                          </button>
                          <button
                            className="mini-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCandidateId(candidate.id);
                              setCanvasView('editor');
                            }}
                          >
                            编辑
                          </button>
                          <button
                            className="mini-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleSingleCandidateDownload(candidate);
                            }}
                          >
                            下载
                          </button>
                          <button
                            className={`mini-action ${candidate.favorite ? 'active' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleFavoriteToggle(candidate.id);
                            }}
                          >
                            {candidate.favorite ? '已收藏' : '收藏'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {generationTask?.status === 'processing' &&
                    Array.from({ length: Math.max(0, workspace.generationCount - activeCandidates.length) }).map((_, index) => (
                      <div key={`placeholder-${index}`} className="candidate-card placeholder">
                        <div className="candidate-preview placeholder-preview">
                          <span className="spinner" />
                        </div>
                        <div className="candidate-info">
                          <span className="candidate-name">候选生成中…</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="info-section">
                <h3 className="info-title">配色详情</h3>
                <div className="color-detail-list">
                  {paletteSummary.map((item) => (
                    <div key={item.color.id} className="color-detail-item">
                      <span className="color-preview" style={{ backgroundColor: item.color.hex }} />
                      <div className="color-info">
                        <span className="color-name">{item.color.name}</span>
                        <span className="color-hex">{item.color.hex}</span>
                      </div>
                      <span className="color-thread">{item.color.thread}</span>
                    </div>
                  ))}
                </div>
                {canvasView === 'editor' && matrix && (
                  <div className="replace-palette-box">
                    <label className="param-label">将当前选中色替换为：</label>
                    <div className="chip-row">
                      {threadPalette.map((item) => (
                        <button
                          key={item.id}
                          className="chip swatch-chip"
                          style={{ borderColor: item.hex }}
                          onClick={() => matrix && setMatrix(replacePaletteColor(matrix, selectedColorId, item))}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="info-section">
                <h3 className="info-title">刺绣路径</h3>
                <div className="two-column-row">
                  <div className="param-group">
                    <label className="param-label">路径策略</label>
                    <select className="param-select" value={workspace.pathMode} onChange={(event) => updateWorkspace('pathMode', event.target.value as WorkspaceState['pathMode'])}>
                      <option value="traditional">传统排序</option>
                      <option value="border-first">先边后中</option>
                      <option value="center-first">先中后外</option>
                      <option value="color-first">按颜色分组</option>
                    </select>
                  </div>
                  <div className="param-group">
                    <label className="param-label">路径难度</label>
                    <select
                      className="param-select"
                      value={workspace.pathDifficulty}
                      onChange={(event) =>
                        updateWorkspace('pathDifficulty', event.target.value as WorkspaceState['pathDifficulty'])
                      }
                    >
                      <option value="beginner">初学者</option>
                      <option value="standard">标准</option>
                    </select>
                  </div>
                </div>
                <div className="path-preview">
                  <div className="path-steps">
                    {(pathPlan?.steps || []).map((step) => (
                      <div key={step.id} className={`path-step ${step.index === 1 ? 'active' : ''}`}>
                        <span className="step-num">{step.index}</span>
                        <span className="step-text">
                          {step.title}
                          <small>{step.description}</small>
                          <small>
                            起点({step.startPoint.x + 1},{step.startPoint.y + 1}) · 终点({step.endPoint.x + 1},{step.endPoint.y + 1})
                            {step.colorChangedFromPrevious ? ' · 需换色' : ''}
                          </small>
                        </span>
                      </div>
                    ))}
                    {(!pathPlan || pathPlan.steps.length === 0) && <p className="form-hint">选择一个候选方案后将自动生成路径建议。</p>}
                  </div>
                </div>
              </div>
            </aside>
          </section>
        )}

        {activeTab === 'library' && (
          <section className="content-page">
            <div className="page-shell">
              <div className="page-header">
                <div>
                  <h2>纹样知识库</h2>
                  <p>围绕西兰卡普的主题纹、中心纹、边饰纹和连续纹，支持按寓意、场景、结构、用途与配色筛选并一键带入工作台。</p>
                </div>
                <div className="page-tools library-tools">
                  <input className="param-input search-input" placeholder="搜索纹样、寓意、关键词" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} />
                  <select className="param-select compact-select" value={libraryFilter} onChange={(event) => setLibraryFilter(event.target.value)}>
                    {categories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <select className="param-select compact-select" value={libraryMeaningFilter} onChange={(event) => setLibraryMeaningFilter(event.target.value)}>
                    {meaningFilters.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <select className="param-select compact-select" value={librarySceneFilter} onChange={(event) => setLibrarySceneFilter(event.target.value)}>
                    {sceneFilters.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <select className="param-select compact-select" value={libraryStructureFilter} onChange={(event) => setLibraryStructureFilter(event.target.value)}>
                    {structureFilters.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <select className="param-select compact-select" value={libraryUsageFilter} onChange={(event) => setLibraryUsageFilter(event.target.value)}>
                    {usageFilters.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <select className="param-select compact-select" value={libraryPaletteFilter} onChange={(event) => setLibraryPaletteFilter(event.target.value)}>
                    {paletteFilters.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="library-grid">
                {filteredLibrary.map((item) => (
                  <article key={item.id} className="knowledge-card">
                    <div className="knowledge-head">
                      <span className="knowledge-badge">{item.category}</span>
                      <h3>{item.title}</h3>
                    </div>
                    <p className="knowledge-meta">寓意：{item.meaning}</p>
                    <p className="knowledge-meta">适用场景：{item.scene || '教学与创作'}</p>
                    <p className="knowledge-desc">{item.description}</p>
                    <p className="knowledge-meta">结构：{item.structure}</p>
                    <p className="knowledge-meta">用途：{item.usage || '主纹/边饰参考'}</p>
                    <div className="chip-row">
                      {item.keywords.map((keyword) => (
                        <span key={keyword} className="chip small">
                          {keyword}
                        </span>
                      ))}
                    </div>
                    <div className="color-palette compact">
                      {item.palette.map((paletteId) => {
                        const color = threadPalette.find((entry) => entry.id === paletteId);
                        return (
                          <span key={paletteId} className="color-swatch static" style={{ backgroundColor: color?.hex || '#333' }} />
                        );
                      })}
                    </div>
                    <button className="btn-secondary card-action" onClick={() => applyLibraryItem(item)}>
                      带入工作台
                    </button>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'projects' && (
          <section className="content-page">
            <div className="page-shell">
              <div className="page-header">
                <div>
                  <h2>我的项目</h2>
                  <p>查看本地保存的项目版本、导出历史和当前选择的候选纹样。</p>
                </div>
                <button className="btn-primary" onClick={() => handleSaveProject('从项目页保存')}>
                  保存当前工作区
                </button>
              </div>
              <div className="project-grid">
                {projectList.length === 0 && <div className="empty-card">还没有保存的项目，先去工作台生成一份纹样吧。</div>}
                {projectList.map((project) => (
                  <article key={project.id} className={`project-card ${loadedProjectId === project.id ? 'active' : ''}`}>
                    <div className="project-card-header">
                      <div>
                        <h3>{project.name}</h3>
                        <p>{project.workspace.theme} · {project.workspace.motifCategory}</p>
                      </div>
                      <span className="knowledge-badge">{traditionText(project.workspace.tradition)}</span>
                    </div>
                    <p className="project-meta">更新时间：{new Date(project.updatedAt).toLocaleString('zh-CN')}</p>
                    <p className="project-meta">版本数：{project.versions.length} · 导出数：{project.exportHistory.length}</p>
                    {project.versions.length > 0 && (
                      <div className="project-mini-log">
                        <strong>最近版本</strong>
                        <span>{project.versions[project.versions.length - 1]?.note}</span>
                      </div>
                    )}
                    {project.exportHistory.length > 0 && (
                      <div className="project-history-box">
                        <strong>导出历史</strong>
                        <div className="project-history-list">
                          {[...project.exportHistory]
                            .reverse()
                            .map((history) => (
                              <div key={history.id} className="project-mini-log">
                                <span>{history.kind}</span>
                                <span>{new Date(history.createdAt).toLocaleString('zh-CN')}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    {project.selectedCandidate?.imageUrl && (
                      <div className="project-thumb">
                        <img src={project.selectedCandidate.imageUrl} alt={project.name} />
                      </div>
                    )}
                    <div className="toolbar-row">
                      <button className="btn-secondary compact" onClick={() => loadProject(project)}>
                        打开项目
                      </button>
                      <button className="btn-secondary compact danger" onClick={() => deleteProject(project.id)}>
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'teaching' && (
          <section className="content-page">
            <div className="page-shell">
              <div className="page-header">
                <div>
                  <h2>教学模式</h2>
                  <p>将当前纹样拆成课堂可展示的四个层次，并支持逐步播放、教学简化稿和教学导出。</p>
                </div>
                <div className="toolbar-row">
                  <button
                    className="btn-secondary compact"
                    onClick={() => setTeachingStep((previous) => (previous + teachingSlides.length - 1) % teachingSlides.length)}
                  >
                    上一步
                  </button>
                  <button className="btn-secondary compact" onClick={() => setTeachingPlaying((previous) => !previous)}>
                    {teachingPlaying ? '暂停播放' : '自动播放'}
                  </button>
                  <button
                    className="btn-secondary compact"
                    onClick={() => setTeachingStep((previous) => (previous + 1) % teachingSlides.length)}
                  >
                    下一步
                  </button>
                  <button className="btn-secondary compact" onClick={() => handleExport('teaching')}>
                    导出教学图
                  </button>
                  <button className="btn-primary compact" onClick={() => handleExport('pdf')}>
                    导出教学 PDF
                  </button>
                </div>
              </div>

              {!matrix || !pathPlan ? (
                <div className="empty-card">请先在工作台生成并选择一个候选纹样，系统才会展示教学步骤。</div>
              ) : (
                <div className="teaching-layout">
                  <section className="teaching-player">
                    <div className="teaching-player-head">
                      <div>
                        <span className="knowledge-badge">播放进度</span>
                        <h3>{teachingSlides[teachingStep]?.title}</h3>
                      </div>
                      <span className="result-meta">{teachingStep + 1} / {teachingSlides.length}</span>
                    </div>
                    <p className="knowledge-desc">{teachingSlides[teachingStep]?.description}</p>
                    <div className="teaching-progress">
                      {teachingSlides.map((slide, index) => (
                        <button
                          key={slide.title}
                          className={`teaching-progress-dot ${teachingStep === index ? 'active' : ''}`}
                          onClick={() => setTeachingStep(index)}
                          aria-label={slide.title}
                        />
                      ))}
                    </div>
                  </section>
                  <div className="teaching-grid">
                  <section className={`teaching-card ${teachingStep === 0 ? 'active-step' : ''}`}>
                    <h3>1. 主题与寓意</h3>
                    <p>主题：{workspace.theme}</p>
                    <p>主体对象：{workspace.subjectObject}</p>
                    <p>应用场景：{workspace.sceneType}</p>
                    <p>类型：{workspace.motifCategory}</p>
                    <p>寓意：{workspace.culturalMeaning}</p>
                  </section>
                  <section className={`teaching-card ${teachingStep === 1 ? 'active-step' : ''}`}>
                    <h3>2. 色卡说明</h3>
                    <ul className="plain-list">
                      {teachingPaletteSummary.slice(0, 6).map((item) => (
                        <li key={item.color.id}>
                          <span className="inline-color" style={{ backgroundColor: item.color.hex }} />
                          {item.color.name} / {item.color.thread} / {Math.round(item.ratio * 100)}%
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className={`teaching-card ${teachingStep === 2 ? 'active-step' : ''}`}>
                    <h3>3. 教学简化网格</h3>
                    <div className="teaching-thumb">
                      <img
                        src={toSvgDataUrl(
                          matrixToSvg(teachingMatrix || matrix, {
                            showGrid: true,
                            showNumbers: true,
                            showRegionNumbers: true,
                            cellSize: 10,
                          }),
                        )}
                        alt="教学网格图"
                      />
                    </div>
                    <p className="form-hint">教学简化稿会优先保留主体色块和大结构，降低课堂讲解与初学者临摹难度。</p>
                  </section>
                  <section className={`teaching-card ${teachingStep === 3 ? 'active-step' : ''}`}>
                    <h3>4. 路径步骤</h3>
                    <ol className="plain-list ordered">
                      {pathPlan.steps.map((step) => (
                        <li key={step.id}>
                          <strong>{step.title}</strong>：{step.description}，起点({step.startPoint.x + 1},{step.startPoint.y + 1})，终点({step.endPoint.x + 1},{step.endPoint.y + 1})
                          {step.colorChangedFromPrevious ? '，此处换色' : ''}
                        </li>
                      ))}
                    </ol>
                  </section>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'export' && (
          <section className="content-page">
            <div className="page-shell">
              <div className="page-header">
                <div>
                  <h2>导出预览</h2>
                  <p>在导出前统一设置纸张、方向和分页方式，并预览线稿、区域编号图和综合工艺单。</p>
                </div>
              </div>
              {!matrix ? (
                <div className="empty-card">请先在工作台生成并选中一个纹样，导出页才会显示预览内容。</div>
              ) : (
                <div className="export-layout">
                  <section className="workflow-card">
                    <h3>导出设置</h3>
                    <div className="two-column-row">
                      <div className="param-group">
                        <label className="param-label">纸张大小</label>
                        <select
                          className="param-select"
                          value={workspace.paperSize}
                          onChange={(event) => updateWorkspace('paperSize', event.target.value as WorkspaceState['paperSize'])}
                        >
                          <option value="a4">A4</option>
                          <option value="a3">A3</option>
                        </select>
                      </div>
                      <div className="param-group">
                        <label className="param-label">页面方向</label>
                        <select
                          className="param-select"
                          value={workspace.pageOrientation}
                          onChange={(event) =>
                            updateWorkspace('pageOrientation', event.target.value as WorkspaceState['pageOrientation'])
                          }
                        >
                          <option value="portrait">竖版</option>
                          <option value="landscape">横版</option>
                        </select>
                      </div>
                    </div>
                    <div className="two-column-row">
                      <div className="param-group">
                        <label className="param-label">分页导出</label>
                        <select
                          className="param-select"
                          value={workspace.paginateExport ? 'on' : 'off'}
                          onChange={(event) => updateWorkspace('paginateExport', event.target.value === 'on')}
                        >
                          <option value="on">自动分页</option>
                          <option value="off">单页优先</option>
                        </select>
                      </div>
                      <div className="param-group">
                        <label className="param-label">工艺说明</label>
                        <textarea
                          className="param-input textarea"
                          value={workspace.notes}
                          onChange={(event) => updateWorkspace('notes', event.target.value)}
                        />
                      </div>
                    </div>
                    <div className="export-options export-options-wide">
                      <button className="export-btn" onClick={() => handleExport('lineart')}>
                        线稿图
                      </button>
                      <button className="export-btn" onClick={() => handleExport('regions')}>
                        区域编号图
                      </button>
                      <button className="export-btn" onClick={() => handleExport('grid')}>
                        网格图
                      </button>
                      <button className="export-btn" onClick={() => handleExport('path')}>
                        路径图
                      </button>
                      <button className="export-btn" onClick={() => handleExport('palette')}>
                        色卡表
                      </button>
                      <button className="export-btn primary" onClick={() => handleExport('craftsheet')}>
                        导出综合工艺单
                      </button>
                    </div>
                  </section>
                  <section className="workflow-card export-preview-card">
                    <h3>预览组合</h3>
                    <div className="export-preview-grid">
                      <img src={toSvgDataUrl(matrixToSvg(matrix, { showLineart: true, showGrid: true, background: '#faf6ef' }))} alt="线稿预览" />
                      <img src={toSvgDataUrl(matrixToSvg(matrix, { showGrid: true, showNumbers: true, showRegionNumbers: true }))} alt="编号预览" />
                    </div>
                  </section>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'about' && (
          <section className="content-page">
            <div className="page-shell about-layout">
              <div className="workflow-card">
                <h2>项目说明</h2>
                <p>
                  本项目围绕西兰卡普的纹样生成与绣制辅助展开，实现了候选纹样生成、格纹拆解、色卡输出、路径建议、
                  项目保存、知识库与教学模式等完整闭环。
                </p>
                <p>
                  生成链路支持火山引擎图像接口；若本地没有配置密钥，系统会自动回退到内置 mock 方案，
                  便于你继续调试前端与工艺辅助模块。
                </p>
              </div>
              <div className="workflow-card">
                <h2>能力清单</h2>
                <ul className="plain-list ordered">
                  <li>AI 候选纹样生成与轮询</li>
                  <li>参考图上传与主题词配置</li>
                  <li>格纹矩阵编辑、镜像、旋转、重复</li>
                  <li>色卡汇总、路径建议、教学导出</li>
                  <li>游客模式、本地登录、项目与知识库管理</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'admin' && session?.role === 'admin' && (
          <section className="content-page">
            <div className="page-shell admin-layout">
              <section className="admin-panel">
                <div className="page-header">
                  <div>
                    <h2>知识库管理</h2>
                    <p>维护前台纹样条目，支持新增和编辑。</p>
                  </div>
                  <button className="btn-primary compact" onClick={startNewLibraryItem}>
                    新增条目
                  </button>
                </div>
                <div className="admin-list">
                  {libraryItems.map((item) => (
                    <button key={item.id} className={`admin-list-item ${editingLibraryId === item.id ? 'active' : ''}`} onClick={() => beginLibraryEdit(item)}>
                      <strong>{item.title}</strong>
                      <span>{item.category}</span>
                    </button>
                  ))}
                </div>
                {editingLibraryDraft && (
                  <div className="admin-form">
                    <input
                      className="param-input"
                      placeholder="标题"
                      value={editingLibraryDraft.title}
                      onChange={(event) =>
                        setEditingLibraryDraft((previous) => previous ? { ...previous, title: event.target.value } : previous)
                      }
                    />
                    <input
                      className="param-input"
                      placeholder="分类"
                      value={editingLibraryDraft.category}
                      onChange={(event) =>
                        setEditingLibraryDraft((previous) => previous ? { ...previous, category: event.target.value } : previous)
                      }
                    />
                    <input
                      className="param-input"
                      placeholder="寓意"
                      value={editingLibraryDraft.meaning}
                      onChange={(event) =>
                        setEditingLibraryDraft((previous) => previous ? { ...previous, meaning: event.target.value } : previous)
                      }
                    />
                    <textarea
                      className="param-input textarea"
                      placeholder="结构说明"
                      value={editingLibraryDraft.structure}
                      onChange={(event) =>
                        setEditingLibraryDraft((previous) => previous ? { ...previous, structure: event.target.value } : previous)
                      }
                    />
                    <textarea
                      className="param-input textarea"
                      placeholder="描述"
                      value={editingLibraryDraft.description}
                      onChange={(event) =>
                        setEditingLibraryDraft((previous) => previous ? { ...previous, description: event.target.value } : previous)
                      }
                    />
                    <div className="two-column-row">
                      <input
                        className="param-input"
                        placeholder="适用场景"
                        value={editingLibraryDraft.scene || ''}
                        onChange={(event) =>
                          setEditingLibraryDraft((previous) => previous ? { ...previous, scene: event.target.value } : previous)
                        }
                      />
                      <input
                        className="param-input"
                        placeholder="用途"
                        value={editingLibraryDraft.usage || ''}
                        onChange={(event) =>
                          setEditingLibraryDraft((previous) => previous ? { ...previous, usage: event.target.value } : previous)
                        }
                      />
                    </div>
                    <input
                      className="param-input"
                      placeholder="关键词，用空格分隔"
                      value={editingLibraryDraft.keywords.join(' ')}
                      onChange={(event) =>
                        setEditingLibraryDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                keywords: event.target.value.split(/\s+/).filter(Boolean),
                              }
                            : previous,
                        )
                      }
                    />
                    <button className="btn-primary compact" onClick={saveLibraryDraft}>
                      保存条目
                    </button>
                  </div>
                )}
              </section>

              <section className="admin-panel">
                <div className="page-header">
                  <div>
                    <h2>提示模板管理</h2>
                    <p>控制生成提示词的系统约束、结构规则和负向提示。</p>
                  </div>
                </div>
                <div className="admin-form">
                  <label className="param-label">系统约束</label>
                  <textarea className="param-input textarea" value={templates.system} onChange={(event) => setTemplates((previous) => ({ ...previous, system: event.target.value }))} />
                  <label className="param-label">结构规则</label>
                  <textarea className="param-input textarea" value={templates.structure} onChange={(event) => setTemplates((previous) => ({ ...previous, structure: event.target.value }))} />
                  <label className="param-label">工艺说明</label>
                  <textarea className="param-input textarea" value={templates.craft} onChange={(event) => setTemplates((previous) => ({ ...previous, craft: event.target.value }))} />
                  <label className="param-label">补全说明</label>
                  <textarea className="param-input textarea" value={templates.completion} onChange={(event) => setTemplates((previous) => ({ ...previous, completion: event.target.value }))} />
                  <label className="param-label">审核规则</label>
                  <textarea className="param-input textarea" value={templates.reviewRules} onChange={(event) => setTemplates((previous) => ({ ...previous, reviewRules: event.target.value }))} />
                  <label className="param-label">导出模板说明</label>
                  <textarea className="param-input textarea" value={templates.exportTemplate} onChange={(event) => setTemplates((previous) => ({ ...previous, exportTemplate: event.target.value }))} />
                  <label className="param-label">负向提示</label>
                  <textarea className="param-input textarea" value={templates.negative} onChange={(event) => setTemplates((previous) => ({ ...previous, negative: event.target.value }))} />
                  <button className="btn-primary compact" onClick={saveTemplateDraft}>
                    保存模板
                  </button>
                </div>
              </section>

              <section className="admin-panel">
                <div className="page-header">
                  <div>
                    <h2>色彩方案管理</h2>
                    <p>维护前台配色库，工作台配色选择、知识库色块和导出色卡都会同步使用。</p>
                  </div>
                  <button className="btn-primary compact" onClick={startNewThreadColor}>
                    新增颜色
                  </button>
                </div>
                <div className="admin-list">
                  {threadPalette.map((color) => (
                    <button
                      key={color.id}
                      className={`admin-list-item ${editingThreadColorId === color.id ? 'active' : ''}`}
                      onClick={() => beginThreadPaletteEdit(color)}
                    >
                      <strong>{color.name}</strong>
                      <span>{color.thread}</span>
                    </button>
                  ))}
                </div>
                {editingThreadColorDraft && (
                  <div className="admin-form">
                    <input
                      className="param-input"
                      placeholder="颜色ID"
                      value={editingThreadColorDraft.id}
                      onChange={(event) =>
                        setEditingThreadColorDraft((previous) =>
                          previous ? { ...previous, id: event.target.value } : previous,
                        )
                      }
                    />
                    <input
                      className="param-input"
                      placeholder="颜色名称"
                      value={editingThreadColorDraft.name}
                      onChange={(event) =>
                        setEditingThreadColorDraft((previous) =>
                          previous ? { ...previous, name: event.target.value } : previous,
                        )
                      }
                    />
                    <div className="two-column-row">
                      <input
                        className="param-input"
                        placeholder="#HEX"
                        value={editingThreadColorDraft.hex}
                        onChange={(event) =>
                          setEditingThreadColorDraft((previous) =>
                            previous ? { ...previous, hex: event.target.value } : previous,
                          )
                        }
                      />
                      <input
                        className="param-input"
                        placeholder="线材编号"
                        value={editingThreadColorDraft.thread}
                        onChange={(event) =>
                          setEditingThreadColorDraft((previous) =>
                            previous ? { ...previous, thread: event.target.value } : previous,
                          )
                        }
                      />
                    </div>
                    <input
                      className="param-input"
                      placeholder="色系分类"
                      value={editingThreadColorDraft.family}
                      onChange={(event) =>
                        setEditingThreadColorDraft((previous) =>
                          previous ? { ...previous, family: event.target.value } : previous,
                        )
                      }
                    />
                    <button className="btn-primary compact" onClick={saveThreadColorDraft}>
                      保存颜色
                    </button>
                  </div>
                )}
              </section>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="footer-content">
          <p className="footer-text">西兰卡普 AI 纹样生成平台 · 非遗数字化保护与创新设计</p>
          <p className="footer-disclaimer">路径、色卡和网格为教学与手工参考，请结合传统工艺经验使用。</p>
        </div>
      </footer>

      {previewCandidate && (
        <div className="modal-overlay" onClick={() => setPreviewCandidate(null)}>
          <div className="modal-card preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{previewCandidate.name}</h3>
              <button className="icon-ghost" onClick={() => setPreviewCandidate(null)} type="button">
                <CloseIcon />
              </button>
            </div>
            <div className="preview-modal-body">
              <img src={previewCandidate.imageUrl} alt={previewCandidate.name} className="preview-modal-image" />
              <div className="candidate-tag-group">
                {(previewCandidate.structureTags || []).map((tag) => (
                  <span key={`preview-structure-${tag}`} className="chip small">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="candidate-tag-group muted">
                {(previewCandidate.colorTags || []).map((tag) => (
                  <span key={`preview-color-${tag}`} className="chip small">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="form-hint">{previewCandidate.summary}</p>
            </div>
          </div>
        </div>
      )}

      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onLogin={handleLogin}
          onRegister={handleRegister}
        />
      )}
    </div>
  );
}

export default App;
