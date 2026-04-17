import { jsPDF } from 'jspdf';

import { extractRegions, matrixToSvg, summarizePalette } from './matrix';
import type {
  CandidateResult,
  ExportKind,
  PageOrientation,
  PaperSize,
  PathPlan,
  PatternMatrix,
  WorkspaceState,
} from '../types';

const PDF_BACKGROUND = '#faf6ef';
const PDF_TEXT = '#1a1814';
const PDF_MUTED = '#787268';
const PDF_SCALE = 2;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function svgToBlob(svg: string) {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

async function svgToCanvas(svg: string) {
  const blob = svgToBlob(svg);
  const url = URL.createObjectURL(blob);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Current browser does not support Canvas');
  }
  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(url);
  return canvas;
}

function renderSvgByKind(kind: ExportKind, matrix: PatternMatrix, pathPlan?: PathPlan | null) {
  if (kind === 'lineart') {
    return matrixToSvg(matrix, {
      showGrid: true,
      showNumbers: false,
      showLineart: true,
      cellSize: 16,
      background: '#faf6ef',
    });
  }

  if (kind === 'regions') {
    return matrixToSvg(matrix, {
      showGrid: true,
      showNumbers: true,
      showRegionNumbers: true,
      cellSize: 16,
    });
  }

  if (kind === 'path') {
    return matrixToSvg(matrix, {
      showGrid: true,
      showNumbers: false,
      showRegionNumbers: true,
      pathPlan: pathPlan || null,
      cellSize: 16,
    });
  }

  if (kind === 'grid' || kind === 'teaching') {
    return matrixToSvg(matrix, {
      showGrid: true,
      showNumbers: true,
      showRegionNumbers: kind === 'teaching',
      pathPlan: kind === 'teaching' ? pathPlan || null : null,
      cellSize: 16,
    });
  }

  return matrixToSvg(matrix, {
    showGrid: false,
    showNumbers: false,
    cellSize: 16,
  });
}

function normalizeFilenameSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'xilankapu';
}

export async function downloadSvg(kind: ExportKind, matrix: PatternMatrix, pathPlan?: PathPlan | null) {
  const svg = renderSvgByKind(kind, matrix, pathPlan);
  downloadBlob(svgToBlob(svg), `xilankapu-${kind}.svg`);
}

export async function downloadPng(kind: ExportKind, matrix: PatternMatrix, pathPlan?: PathPlan | null) {
  const svg = renderSvgByKind(kind, matrix, pathPlan);
  const canvas = await svgToCanvas(svg);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error('Failed to export PNG'));
        return;
      }
      resolve(value);
    }, 'image/png');
  });
  downloadBlob(blob, `xilankapu-${kind}.png`);
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function downloadCandidateImage(candidate: CandidateResult) {
  const filename = normalizeFilenameSegment(candidate.name);
  if (candidate.imageUrl.startsWith('data:')) {
    const blob = await dataUrlToBlob(candidate.imageUrl);
    downloadBlob(blob, `${filename}.png`);
    return;
  }

  const response = await fetch(candidate.imageUrl);
  if (!response.ok) {
    throw new Error('Failed to download candidate image');
  }
  downloadBlob(await response.blob(), `${filename}.png`);
}

export async function downloadCandidateBatch(candidates: CandidateResult[]) {
  for (const candidate of candidates) {
    await downloadCandidateImage(candidate);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
}

function getPdfFormat(size: PaperSize, orientation: PageOrientation) {
  const base = size === 'a3' ? [841.89, 1190.55] : [595.28, 841.89];
  return orientation === 'landscape' ? ([base[1], base[0]] as const) : ([base[0], base[1]] as const);
}

function sliceMatrix(matrix: PatternMatrix, startX: number, startY: number, pageSize: number): PatternMatrix {
  const cells = Array.from({ length: pageSize }, (_, y) =>
    Array.from({ length: pageSize }, (_, x) => {
      const source = matrix.cells[startY + y]?.[startX + x];
      return source ? { ...source } : { colorId: matrix.palette[0]?.id || 'blank', locked: false };
    }),
  );

  return {
    ...matrix,
    size: pageSize,
    cells,
    sourceLabel: `${matrix.sourceLabel} (page ${startX + 1}, ${startY + 1})`,
  };
}

function buildGridPages(matrix: PatternMatrix, pageCellCapacity: number) {
  const pages: Array<{ matrix: PatternMatrix; startX: number; startY: number }> = [];
  if (matrix.size <= pageCellCapacity) {
    pages.push({ matrix, startX: 0, startY: 0 });
    return pages;
  }

  for (let startY = 0; startY < matrix.size; startY += pageCellCapacity) {
    for (let startX = 0; startX < matrix.size; startX += pageCellCapacity) {
      const size = Math.min(pageCellCapacity, matrix.size - startX, matrix.size - startY);
      pages.push({
        matrix: sliceMatrix(matrix, startX, startY, size),
        startX,
        startY,
      });
    }
  }

  return pages;
}

function createPdfPageContext(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * PDF_SCALE);
  canvas.height = Math.round(height * PDF_SCALE);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Current browser does not support Canvas');
  }

  context.scale(PDF_SCALE, PDF_SCALE);
  context.fillStyle = PDF_BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.textBaseline = 'top';

  return { canvas, context };
}

function setCanvasFont(context: CanvasRenderingContext2D, size: number, weight: 'normal' | 'bold' = 'normal') {
  const resolvedWeight = weight === 'bold' ? 700 : 400;
  context.font = `${resolvedWeight} ${size}px "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "SimHei", sans-serif`;
}

function normalizeDisplayText(value: string | number | null | undefined) {
  return `${value ?? ''}`.replace(/\s+/g, ' ').trim() || '-';
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = Number.POSITIVE_INFINITY,
) {
  const normalized = normalizeDisplayText(text);
  const segments = normalized.split('\n');
  const lines: string[] = [];

  for (const segment of segments) {
    if (!segment) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const char of segment) {
      const next = current + char;
      if (current && context.measureText(next).width > maxWidth) {
        lines.push(current);
        current = char;
        if (lines.length >= maxLines) {
          return lines;
        }
      } else {
        current = next;
      }
    }

    if (current) {
      lines.push(current);
      if (lines.length >= maxLines) {
        return lines;
      }
    }
  }

  return lines.slice(0, maxLines);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options?: {
    fontSize?: number;
    lineHeight?: number;
    color?: string;
    weight?: 'normal' | 'bold';
    maxLines?: number;
  },
) {
  const fontSize = options?.fontSize ?? 11;
  const lineHeight = options?.lineHeight ?? Math.round(fontSize * 1.5);
  setCanvasFont(context, fontSize, options?.weight ?? 'normal');
  context.fillStyle = options?.color || PDF_TEXT;

  const lines = wrapText(context, text, maxWidth, options?.maxLines);
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
}

function drawLabelValue(
  context: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines = 1,
) {
  return drawWrappedText(context, `${label}: ${normalizeDisplayText(value)}`, x, y, maxWidth, {
    fontSize: 11,
    lineHeight: 16,
    maxLines,
  });
}

function drawPageFooter(
  context: CanvasRenderingContext2D,
  pageNumber: number,
  totalPages: number,
  width: number,
  height: number,
) {
  const footerY = height - 24;

  setCanvasFont(context, 9, 'normal');
  context.fillStyle = PDF_MUTED;
  context.fillText(new Date().toLocaleDateString('zh-CN'), 36, footerY);

  const pagination = `Page ${pageNumber} / ${totalPages}`;
  const paginationWidth = context.measureText(pagination).width;
  context.fillText(pagination, width - 36 - paginationWidth, footerY);
}

function drawColorSwatch(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
) {
  context.fillStyle = fill;
  context.beginPath();
  context.roundRect(x, y, width, height, 3);
  context.fill();
}

async function drawSvgFrame(
  context: CanvasRenderingContext2D,
  svg: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const canvas = await svgToCanvas(svg);
  context.drawImage(canvas, x, y, width, height);
}

async function buildOverviewPage(
  pageWidth: number,
  pageHeight: number,
  matrix: PatternMatrix,
  workspace: WorkspaceState,
) {
  const palette = summarizePalette(matrix);
  const regions = extractRegions(matrix, { limit: 12 });
  const { canvas, context } = createPdfPageContext(pageWidth, pageHeight);

  drawWrappedText(context, 'Xilankapu Craft Sheet', 36, 36, pageWidth - 72, {
    fontSize: 24,
    lineHeight: 30,
    weight: 'bold',
  });

  drawLabelValue(context, 'Project', workspace.projectName, 36, 72, pageWidth - 72, 1);
  drawLabelValue(context, 'Theme / Motif', `${workspace.theme} / ${workspace.motifCategory}`, 36, 88, pageWidth - 72, 1);
  drawLabelValue(context, 'Meaning', workspace.culturalMeaning, 36, 104, pageWidth - 72, 2);
  drawLabelValue(
    context,
    'Layout',
    `${workspace.paperSize.toUpperCase()} / ${workspace.pageOrientation === 'portrait' ? 'Portrait' : 'Landscape'}`,
    36,
    138,
    pageWidth - 72,
    1,
  );
  drawLabelValue(
    context,
    'Path mode',
    `${workspace.pathDifficulty === 'beginner' ? 'Beginner' : 'Standard'} / ${workspace.pathMode}`,
    36,
    154,
    pageWidth - 72,
    1,
  );

  const previewSvg = renderSvgByKind('preview', matrix, null);
  const regionSvg = renderSvgByKind('regions', matrix, null);
  await drawSvgFrame(context, previewSvg, 36, 186, pageWidth * 0.36, pageWidth * 0.36);
  await drawSvgFrame(context, regionSvg, pageWidth * 0.48, 186, pageWidth * 0.34, pageWidth * 0.34);

  drawWrappedText(context, 'Palette & Threads', 36, pageHeight * 0.66, 220, {
    fontSize: 14,
    lineHeight: 18,
    weight: 'bold',
  });
  palette.slice(0, 8).forEach((item, index) => {
    const y = pageHeight * 0.66 + 28 + index * 18;
    drawColorSwatch(context, 36, y - 2, 12, 12, item.color.hex);
    drawWrappedText(
      context,
      `${item.color.name} / ${item.color.hex} / ${item.color.thread} / ${Math.round(item.ratio * 100)}%`,
      56,
      y - 2,
      pageWidth * 0.38,
      {
        fontSize: 10,
        lineHeight: 14,
        maxLines: 1,
      },
    );
  });

  drawWrappedText(context, 'Region Overview', pageWidth * 0.52, pageHeight * 0.66, pageWidth * 0.28, {
    fontSize: 14,
    lineHeight: 18,
    weight: 'bold',
  });
  regions.slice(0, 8).forEach((region, index) => {
    const y = pageHeight * 0.66 + 28 + index * 18;
    drawWrappedText(
      context,
      `Region ${region.index}: ${region.color.name} / ${region.cellCount} cells`,
      pageWidth * 0.52,
      y - 2,
      pageWidth * 0.28,
      {
        fontSize: 10,
        lineHeight: 14,
        maxLines: 1,
      },
    );
  });

  return canvas;
}

async function buildLineartPage(pageWidth: number, pageHeight: number, matrix: PatternMatrix) {
  const { canvas, context } = createPdfPageContext(pageWidth, pageHeight);

  drawWrappedText(context, 'Lineart & Region Numbers', 36, 40, pageWidth - 72, {
    fontSize: 18,
    lineHeight: 24,
    weight: 'bold',
  });

  await drawSvgFrame(context, renderSvgByKind('lineart', matrix, null), 36, 80, pageWidth * 0.4, pageWidth * 0.4);
  await drawSvgFrame(context, renderSvgByKind('regions', matrix, null), pageWidth * 0.5, 80, pageWidth * 0.34, pageWidth * 0.34);

  drawWrappedText(
    context,
    'Left: lineart reference for tracing. Right: region numbers aligned with color blocks for teaching and manual weaving.',
    36,
    pageHeight - 58,
    pageWidth - 72,
    {
      fontSize: 11,
      lineHeight: 16,
      color: PDF_MUTED,
      maxLines: 2,
    },
  );

  return canvas;
}

async function buildPathPage(
  pageWidth: number,
  pageHeight: number,
  matrix: PatternMatrix,
  pathPlan: PathPlan | null,
) {
  const { canvas, context } = createPdfPageContext(pageWidth, pageHeight);

  drawWrappedText(context, 'Path Guide & Teaching Notes', 36, 40, pageWidth - 72, {
    fontSize: 18,
    lineHeight: 24,
    weight: 'bold',
  });

  await drawSvgFrame(context, renderSvgByKind('path', matrix, pathPlan), 36, 80, pageWidth * 0.42, pageWidth * 0.42);

  let currentY = 96;
  const steps = (pathPlan?.steps || []).slice(0, 8);
  steps.forEach((step, index) => {
    currentY = drawWrappedText(
      context,
      `${index + 1}. ${step.title}`,
      pageWidth * 0.52,
      currentY,
      pageWidth * 0.38,
      {
        fontSize: 11,
        lineHeight: 16,
        weight: 'bold',
        maxLines: 1,
      },
    );
    currentY = drawWrappedText(
      context,
      `${step.description} ${step.orderHint}`,
      pageWidth * 0.52,
      currentY + 2,
      pageWidth * 0.38,
      {
        fontSize: 10,
        lineHeight: 14,
        color: PDF_MUTED,
        maxLines: 2,
      },
    ) + 10;
  });

  drawWrappedText(
    context,
    'Tip: confirm the numbered regions first, then follow the path order. Beginner mode prioritizes larger color blocks before smaller details.',
    36,
    pageHeight - 58,
    pageWidth - 72,
    {
      fontSize: 11,
      lineHeight: 16,
      color: PDF_MUTED,
      maxLines: 2,
    },
  );

  return canvas;
}

async function buildGridPage(
  pageWidth: number,
  pageHeight: number,
  matrix: PatternMatrix,
  paginate: boolean,
  startX: number,
  startY: number,
) {
  const { canvas, context } = createPdfPageContext(pageWidth, pageHeight);
  const title = paginate ? `Grid Page (${startX + 1}, ${startY + 1})` : 'Full Grid';

  drawWrappedText(context, title, 36, 40, pageWidth - 72, {
    fontSize: 18,
    lineHeight: 24,
    weight: 'bold',
  });

  const imageSize = Math.min(pageWidth - 72, pageHeight - 130);
  await drawSvgFrame(
    context,
    renderSvgByKind('grid', matrix, null),
    36,
    78,
    imageSize,
    imageSize,
  );

  return canvas;
}

function addCanvasPage(pdf: jsPDF, canvas: HTMLCanvasElement, pageWidth: number, pageHeight: number) {
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pageWidth, pageHeight);
}

export async function downloadPdf(
  matrix: PatternMatrix,
  workspace: WorkspaceState,
  pathPlan: PathPlan | null,
) {
  const [pageWidth, pageHeight] = getPdfFormat(workspace.paperSize, workspace.pageOrientation);
  const pdf = new jsPDF({
    orientation: workspace.pageOrientation,
    unit: 'pt',
    format: workspace.paperSize,
  });

  const paginate = workspace.paginateExport || matrix.size > 28;
  const pageCellCapacity = workspace.paperSize === 'a3' ? 28 : 20;
  const gridPages = buildGridPages(matrix, paginate ? pageCellCapacity : matrix.size);
  const totalPages = 3 + gridPages.length;

  const overviewPage = await buildOverviewPage(pageWidth, pageHeight, matrix, workspace);
  drawPageFooter(overviewPage.getContext('2d')!, 1, totalPages, pageWidth, pageHeight);
  addCanvasPage(pdf, overviewPage, pageWidth, pageHeight);

  const lineartPage = await buildLineartPage(pageWidth, pageHeight, matrix);
  drawPageFooter(lineartPage.getContext('2d')!, 2, totalPages, pageWidth, pageHeight);
  pdf.addPage(workspace.paperSize, workspace.pageOrientation);
  addCanvasPage(pdf, lineartPage, pageWidth, pageHeight);

  const pathPage = await buildPathPage(pageWidth, pageHeight, matrix, pathPlan);
  drawPageFooter(pathPage.getContext('2d')!, 3, totalPages, pageWidth, pageHeight);
  pdf.addPage(workspace.paperSize, workspace.pageOrientation);
  addCanvasPage(pdf, pathPage, pageWidth, pageHeight);

  let pageNumber = 4;
  for (const gridPage of gridPages) {
    const canvas = await buildGridPage(pageWidth, pageHeight, gridPage.matrix, paginate, gridPage.startX, gridPage.startY);
    drawPageFooter(canvas.getContext('2d')!, pageNumber, totalPages, pageWidth, pageHeight);
    pdf.addPage(workspace.paperSize, workspace.pageOrientation);
    addCanvasPage(pdf, canvas, pageWidth, pageHeight);
    pageNumber += 1;
  }

  pdf.save(`xilankapu-${normalizeFilenameSegment(workspace.projectName || 'craftsheet')}.pdf`);
}
