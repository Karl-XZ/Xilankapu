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
    throw new Error('当前浏览器不支持 Canvas');
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
        reject(new Error('PNG 导出失败'));
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
    throw new Error('候选图下载失败');
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
  return orientation === 'landscape' ? [base[1], base[0]] as const : [base[0], base[1]] as const;
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
    sourceLabel: `${matrix.sourceLabel}（分页 ${startX + 1},${startY + 1}）`,
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

function addPageFooter(pdf: jsPDF, pageNumber: number, totalPages: number, width: number, height: number) {
  pdf.setFont('times', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(120, 114, 104);
  pdf.text(`第 ${pageNumber} / ${totalPages} 页`, width - 52, height - 18, { align: 'right' });
  pdf.text(new Date().toLocaleDateString('zh-CN'), 36, height - 18);
}

async function addSvgPage(
  pdf: jsPDF,
  svg: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const canvas = await svgToCanvas(svg);
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, width, height);
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

  const palette = summarizePalette(matrix);
  const regions = extractRegions(matrix, { limit: 12 });
  const paginate = workspace.paginateExport || matrix.size > 28;
  const pageCellCapacity = workspace.paperSize === 'a3' ? 28 : 20;
  const gridPages = buildGridPages(matrix, paginate ? pageCellCapacity : matrix.size);
  const totalPages = 3 + gridPages.length;
  let pageNumber = 1;

  pdf.setFillColor(250, 246, 239);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  pdf.setTextColor(26, 24, 20);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(24);
  pdf.text('西兰卡普综合工艺单', 36, 42);
  pdf.setFont('times', 'normal');
  pdf.setFontSize(11);
  pdf.text(`项目名称：${workspace.projectName}`, 36, 68);
  pdf.text(`主题：${workspace.theme} / 类型：${workspace.motifCategory}`, 36, 84);
  pdf.text(`寓意：${workspace.culturalMeaning}`, 36, 100, { maxWidth: pageWidth - 72 });
  pdf.text(`导出版式：${workspace.paperSize.toUpperCase()} / ${workspace.pageOrientation === 'portrait' ? '竖版' : '横版'}`, 36, 116);
  pdf.text(`路径模式：${workspace.pathDifficulty === 'beginner' ? '初学者' : '标准'} / ${workspace.pathMode}`, 36, 132);

  const previewSvg = renderSvgByKind('preview', matrix, null);
  const paletteSvg = renderSvgByKind('regions', matrix, null);
  await addSvgPage(pdf, previewSvg, 36, 156, pageWidth * 0.36, pageWidth * 0.36);
  await addSvgPage(pdf, paletteSvg, pageWidth * 0.48, 156, pageWidth * 0.34, pageWidth * 0.34);

  pdf.setFont('times', 'bold');
  pdf.setFontSize(14);
  pdf.text('色卡与线材', 36, pageHeight * 0.66);
  pdf.setFont('times', 'normal');
  pdf.setFontSize(11);
  palette.slice(0, 8).forEach((item, index) => {
    const y = pageHeight * 0.66 + 28 + index * 18;
    pdf.setFillColor(item.color.hex);
    pdf.roundedRect(36, y - 10, 12, 12, 2, 2, 'F');
    pdf.setTextColor(26, 24, 20);
    pdf.text(
      `${item.color.name} / ${item.color.hex} / ${item.color.thread} / ${Math.round(item.ratio * 100)}%`,
      56,
      y,
    );
  });

  pdf.setFont('times', 'bold');
  pdf.text('区域编号总览', pageWidth * 0.52, pageHeight * 0.66);
  pdf.setFont('times', 'normal');
  regions.slice(0, 8).forEach((region, index) => {
    const y = pageHeight * 0.66 + 28 + index * 18;
    pdf.text(`区域${region.index}：${region.color.name} / ${region.cellCount}格`, pageWidth * 0.52, y);
  });
  addPageFooter(pdf, pageNumber, totalPages, pageWidth, pageHeight);

  pdf.addPage(workspace.paperSize, workspace.pageOrientation);
  pageNumber += 1;
  pdf.setFillColor(250, 246, 239);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  pdf.setTextColor(26, 24, 20);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(18);
  pdf.text('线稿与区域编号', 36, 40);
  await addSvgPage(pdf, renderSvgByKind('lineart', matrix, null), 36, 70, pageWidth * 0.4, pageWidth * 0.4);
  await addSvgPage(pdf, renderSvgByKind('regions', matrix, null), pageWidth * 0.5, 70, pageWidth * 0.34, pageWidth * 0.34);
  pdf.setFont('times', 'normal');
  pdf.setFontSize(11);
  pdf.text('左侧用于打印描边，右侧用于对应色块区域编号。', 36, pageHeight - 48);
  addPageFooter(pdf, pageNumber, totalPages, pageWidth, pageHeight);

  pdf.addPage(workspace.paperSize, workspace.pageOrientation);
  pageNumber += 1;
  pdf.setFillColor(250, 246, 239);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  pdf.setTextColor(26, 24, 20);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(18);
  pdf.text('路径步骤与教学说明', 36, 40);
  await addSvgPage(pdf, renderSvgByKind('path', matrix, pathPlan), 36, 70, pageWidth * 0.42, pageWidth * 0.42);
  pdf.setFont('times', 'normal');
  pdf.setFontSize(11);
  (pathPlan?.steps || []).slice(0, 8).forEach((step, index) => {
    pdf.text(
      `${index + 1}. ${step.title}：${step.description}（${step.orderHint}）`,
      pageWidth * 0.52,
      96 + index * 26,
      { maxWidth: pageWidth * 0.38 },
    );
  });
  pdf.text(
    '建议先依据区域编号确认色块，再按路径顺序推进；初学者模式优先完成大色块，标准模式再补细部。',
    36,
    pageHeight - 48,
    { maxWidth: pageWidth - 72 },
  );
  addPageFooter(pdf, pageNumber, totalPages, pageWidth, pageHeight);

  for (const gridPage of gridPages) {
    pdf.addPage(workspace.paperSize, workspace.pageOrientation);
    pageNumber += 1;
    pdf.setFillColor(250, 246, 239);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    pdf.setTextColor(26, 24, 20);
    pdf.setFont('times', 'bold');
    pdf.setFontSize(18);
    pdf.text(
      paginate
        ? `分页网格图（起点 ${gridPage.startX + 1}, ${gridPage.startY + 1}）`
        : '完整网格图',
      36,
      40,
    );
    await addSvgPage(
      pdf,
      renderSvgByKind('grid', gridPage.matrix, null),
      36,
      70,
      Math.min(pageWidth - 72, pageHeight - 130),
      Math.min(pageWidth - 72, pageHeight - 130),
    );
    addPageFooter(pdf, pageNumber, totalPages, pageWidth, pageHeight);
  }

  pdf.save(`xilankapu-${normalizeFilenameSegment(workspace.projectName || 'craftsheet')}.pdf`);
}
