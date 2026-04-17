import { DEFAULT_THREAD_PALETTE } from '../data/threadPalette';
import type {
  MatrixCell,
  PaletteSummaryItem,
  PathDifficulty,
  PathMode,
  PathPlan,
  PatternMatrix,
  RegionStep,
  ThreadColor,
} from '../types';

interface RegionAnnotation {
  id: string;
  index: number;
  color: ThreadColor;
  cells: Array<{ x: number; y: number }>;
  centroid: { x: number; y: number };
  cellCount: number;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((item) => item + item)
          .join('')
      : normalized;
  const int = Number.parseInt(value, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function colorDistance(left: string, right: string) {
  const a = hexToRgb(left);
  const b = hexToRgb(right);
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function getClosestThread(hex: string, availablePalette: ThreadColor[] = DEFAULT_THREAD_PALETTE) {
  return availablePalette.reduce((best, item) =>
    colorDistance(item.hex, hex) < colorDistance(best.hex, hex) ? item : best,
  );
}

export function resolvePalette(
  ids: string[],
  count = 5,
  availablePalette: ThreadColor[] = DEFAULT_THREAD_PALETTE,
): ThreadColor[] {
  const selected = availablePalette.filter((item) => ids.includes(item.id));
  if (selected.length > 0) {
    return selected.slice(0, count);
  }
  return availablePalette.slice(0, count);
}

function createEmptyCells(size: number, fill: string): MatrixCell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ colorId: fill, locked: false })),
  );
}

function setSymmetricCells(
  cells: MatrixCell[][],
  x: number,
  y: number,
  colorId: string,
  mode: 'quad' | 'mirror' | 'rotation' | 'free',
) {
  const size = cells.length;
  const points =
    mode === 'free'
      ? [[x, y]]
      : mode === 'mirror'
        ? [
            [x, y],
            [size - 1 - x, y],
          ]
        : mode === 'rotation'
          ? [
              [x, y],
              [size - 1 - x, size - 1 - y],
            ]
          : [
              [x, y],
              [size - 1 - x, y],
              [x, size - 1 - y],
              [size - 1 - x, size - 1 - y],
            ];

  for (const [px, py] of points) {
    cells[py][px] = { colorId, locked: false };
  }
}

export function createSeedMatrix(
  size: number,
  palette: ThreadColor[],
  theme: string,
  mode: 'quad' | 'mirror' | 'rotation' | 'free' = 'quad',
): PatternMatrix {
  const background = palette[palette.length - 1] || DEFAULT_THREAD_PALETTE[8];
  const cells = createEmptyCells(size, background.id);
  const colors = palette.length > 1 ? palette : DEFAULT_THREAD_PALETTE.slice(0, 5);
  const center = Math.floor(size / 2);

  for (let ring = 0; ring < Math.min(center, colors.length + 2); ring += 1) {
    const offset = ring * 2 + 1;
    const color = colors[ring % colors.length];
    for (let delta = -offset; delta <= offset; delta += 1) {
      const x = center + delta;
      const y = center - offset + Math.abs(delta);
      if (x >= 0 && y >= 0 && x < size && y < size) {
        setSymmetricCells(cells, x, y, color.id, mode);
      }
    }
  }

  if (theme.includes('鸟') || theme.includes('凤')) {
    const accent = colors[1] || DEFAULT_THREAD_PALETTE[1];
    for (let i = 0; i < Math.floor(size / 4); i += 1) {
      setSymmetricCells(cells, center - 2 - i, center - 5 + i, accent.id, mode);
    }
  }

  if (theme.includes('山') || theme.includes('水')) {
    const accent = colors[2] || DEFAULT_THREAD_PALETTE[4];
    for (let x = 1; x < size - 1; x += 2) {
      setSymmetricCells(cells, x, size - 3 - (x % 4), accent.id, 'mirror');
    }
  }

  return {
    size,
    palette: colors,
    cells,
    sourceLabel: `基于${theme}生成的初始格纹`,
  };
}

async function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function pickDominantPalette(
  swatches: string[],
  count: number,
  availablePalette: ThreadColor[] = DEFAULT_THREAD_PALETTE,
) {
  const buckets = new Map<string, number>();
  for (const hex of swatches) {
    const rgb = hexToRgb(hex);
    const key = [rgb.r, rgb.g, rgb.b].map((item) => Math.round(item / 48) * 48).join(',');
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, count)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map((item) => Number.parseInt(item, 10));
      return getClosestThread(
        `#${[r, g, b].map((item) => item.toString(16).padStart(2, '0')).join('')}`,
        availablePalette,
      );
    });
}

function nearestPaletteColor(hex: string, palette: ThreadColor[]) {
  return palette.reduce((best, item) =>
    colorDistance(item.hex, hex) < colorDistance(best.hex, hex) ? item : best,
  );
}

export async function imageToMatrix(
  imageUrl: string,
  size: number,
  colorCount: number,
  preferredPalette: ThreadColor[],
  availablePalette: ThreadColor[] = DEFAULT_THREAD_PALETTE,
): Promise<PatternMatrix> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('当前浏览器不支持 Canvas');
  }

  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  const sampledHexes: string[] = [];

  for (let index = 0; index < data.length; index += 4) {
    sampledHexes.push(
      `#${[data[index], data[index + 1], data[index + 2]]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')}`,
    );
  }

  const palette =
    preferredPalette.length > 0
      ? preferredPalette.slice(0, colorCount)
      : pickDominantPalette(sampledHexes, colorCount, availablePalette);

  const cells: MatrixCell[][] = [];
  for (let y = 0; y < size; y += 1) {
    const row: MatrixCell[] = [];
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const hex = `#${[data[offset], data[offset + 1], data[offset + 2]]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')}`;
      row.push({ colorId: nearestPaletteColor(hex, palette).id, locked: false });
    }
    cells.push(row);
  }

  return {
    size,
    palette,
    cells,
    sourceLabel: '从候选图自动拆解得到的格纹稿',
  };
}

function paletteMap(matrix: PatternMatrix) {
  return new Map(matrix.palette.map((item) => [item.id, item]));
}

export function summarizePalette(matrix: PatternMatrix): PaletteSummaryItem[] {
  const counts = new Map<string, number>();
  const total = matrix.size * matrix.size;
  for (const row of matrix.cells) {
    for (const cell of row) {
      counts.set(cell.colorId, (counts.get(cell.colorId) || 0) + 1);
    }
  }

  return matrix.palette
    .map((color) => {
      const count = counts.get(color.id) || 0;
      return {
        color,
        count,
        ratio: total > 0 ? count / total : 0,
      };
    })
    .sort((left, right) => right.count - left.count);
}

function cloneCells(cells: MatrixCell[][]) {
  return cells.map((row) => row.map((cell) => ({ ...cell })));
}

function getTopPaletteIds(matrix: PatternMatrix, limit = 4) {
  return summarizePalette(matrix)
    .slice(0, limit)
    .map((item) => item.color.id);
}

function getAccentColor(matrix: PatternMatrix) {
  return summarizePalette(matrix)[1]?.color || matrix.palette[1] || matrix.palette[0] || DEFAULT_THREAD_PALETTE[0];
}

function getBackgroundColorId(matrix: PatternMatrix) {
  return summarizePalette(matrix)[0]?.color.id || matrix.palette[0]?.id || DEFAULT_THREAD_PALETTE[0].id;
}

export function paintCell(matrix: PatternMatrix, x: number, y: number, colorId: string) {
  const cells = cloneCells(matrix.cells);
  if (!cells[y]?.[x] || cells[y][x].locked) {
    return matrix;
  }
  cells[y][x] = { ...cells[y][x], colorId };
  return { ...matrix, cells };
}

export function toggleCellLock(matrix: PatternMatrix, x: number, y: number) {
  const cells = cloneCells(matrix.cells);
  if (!cells[y]?.[x]) {
    return matrix;
  }
  cells[y][x] = { ...cells[y][x], locked: !cells[y][x].locked };
  return { ...matrix, cells };
}

export function replacePaletteColor(matrix: PatternMatrix, fromId: string, toColor: ThreadColor) {
  const palette = matrix.palette.map((color) => (color.id === fromId ? toColor : color));
  const cells = cloneCells(matrix.cells).map((row) =>
    row.map((cell) => ({
      ...cell,
      colorId: cell.colorId === fromId ? toColor.id : cell.colorId,
    })),
  );
  return { ...matrix, palette, cells };
}

export function mirrorMatrix(matrix: PatternMatrix) {
  const cells = cloneCells(matrix.cells).map((row) => [...row].reverse());
  return { ...matrix, cells };
}

export function rotateMatrix(matrix: PatternMatrix) {
  const size = matrix.size;
  const cells = createEmptyCells(size, matrix.palette[0]?.id || DEFAULT_THREAD_PALETTE[0].id);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      cells[x][size - y - 1] = { ...matrix.cells[y][x] };
    }
  }
  return { ...matrix, cells };
}

export function repeatMatrix(matrix: PatternMatrix) {
  const half = Math.max(2, Math.floor(matrix.size / 2));
  const cells = createEmptyCells(matrix.size, matrix.palette[0]?.id || DEFAULT_THREAD_PALETTE[0].id);
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      cells[y][x] = { ...matrix.cells[y % half][x % half] };
    }
  }
  return { ...matrix, cells };
}

function isBorderCell(size: number, x: number, y: number, borderWidth: number) {
  return x < borderWidth || y < borderWidth || x >= size - borderWidth || y >= size - borderWidth;
}

export function strengthenBorderPattern(matrix: PatternMatrix) {
  const cells = cloneCells(matrix.cells);
  const accentColor = getAccentColor(matrix);
  const borderWidth = Math.max(2, Math.floor(matrix.size / 7));

  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (isBorderCell(matrix.size, x, y, borderWidth) && !cells[y][x].locked) {
        const diagonal = (x + y) % 2 === 0;
        cells[y][x].colorId = diagonal ? accentColor.id : cells[y][x].colorId;
      }
    }
  }

  return {
    ...matrix,
    cells,
    sourceLabel: `${matrix.sourceLabel} · 已强化边饰`,
  };
}

export function strengthenMainMotif(matrix: PatternMatrix) {
  const cells = cloneCells(matrix.cells);
  const accentColor = getAccentColor(matrix);
  const backgroundColorId = getBackgroundColorId(matrix);
  const center = (matrix.size - 1) / 2;
  const radius = Math.max(2, Math.floor(matrix.size / 4));

  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (cells[y][x].locked) {
        continue;
      }

      const distance = Math.abs(x - center) + Math.abs(y - center);
      if (distance <= radius) {
        cells[y][x].colorId = accentColor.id;
      } else if (distance === radius + 1 && (x + y) % 2 === 0) {
        cells[y][x].colorId = backgroundColorId;
      }
    }
  }

  return {
    ...matrix,
    cells,
    sourceLabel: `${matrix.sourceLabel} · 已强化主纹`,
  };
}

export function simplifyMatrixForTeaching(matrix: PatternMatrix) {
  const dominantIds = new Set(getTopPaletteIds(matrix, Math.min(4, matrix.palette.length)));
  const backgroundColorId = getBackgroundColorId(matrix);
  const blockSize = matrix.size >= 24 ? 2 : 1;
  const cells = cloneCells(matrix.cells);

  for (let startY = 0; startY < matrix.size; startY += blockSize) {
    for (let startX = 0; startX < matrix.size; startX += blockSize) {
      const bucket = new Map<string, number>();
      for (let y = startY; y < Math.min(startY + blockSize, matrix.size); y += 1) {
        for (let x = startX; x < Math.min(startX + blockSize, matrix.size); x += 1) {
          const colorId = cells[y][x].colorId;
          const normalized = dominantIds.has(colorId) ? colorId : backgroundColorId;
          bucket.set(normalized, (bucket.get(normalized) || 0) + 1);
        }
      }

      const nextColorId =
        Array.from(bucket.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || backgroundColorId;
      for (let y = startY; y < Math.min(startY + blockSize, matrix.size); y += 1) {
        for (let x = startX; x < Math.min(startX + blockSize, matrix.size); x += 1) {
          if (!cells[y][x].locked) {
            cells[y][x].colorId = nextColorId;
          }
        }
      }
    }
  }

  const palette = matrix.palette.filter((color) => dominantIds.has(color.id) || color.id === backgroundColorId);

  return {
    ...matrix,
    palette: palette.length > 0 ? palette : matrix.palette.slice(0, Math.min(4, matrix.palette.length)),
    cells,
    sourceLabel: `${matrix.sourceLabel} · 教学简化稿`,
  };
}

export function extractRegions(
  matrix: PatternMatrix,
  options?: { includeBackground?: boolean; limit?: number },
): RegionAnnotation[] {
  const visited = new Set<string>();
  const colorMap = paletteMap(matrix);
  const counts = summarizePalette(matrix);
  const backgroundId = counts[0]?.color.id;
  const includeBackground = options?.includeBackground ?? false;
  const regions: RegionAnnotation[] = [];

  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      const key = `${x}:${y}`;
      const colorId = matrix.cells[y][x].colorId;
      if (visited.has(key) || (!includeBackground && colorId === backgroundId)) {
        continue;
      }

      const queue = [{ x, y }];
      const cells: Array<{ x: number; y: number }> = [];
      visited.add(key);

      while (queue.length > 0) {
        const current = queue.shift()!;
        cells.push(current);

        for (const [dx, dy] of directions) {
          const nextX = current.x + dx;
          const nextY = current.y + dy;
          const nextKey = `${nextX}:${nextY}`;
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= matrix.size ||
            nextY >= matrix.size ||
            visited.has(nextKey) ||
            matrix.cells[nextY][nextX].colorId !== colorId
          ) {
            continue;
          }
          visited.add(nextKey);
          queue.push({ x: nextX, y: nextY });
        }
      }

      const centroid = cells.reduce(
        (acc, cell) => ({ x: acc.x + cell.x, y: acc.y + cell.y }),
        { x: 0, y: 0 },
      );
      centroid.x /= cells.length;
      centroid.y /= cells.length;

      regions.push({
        id: `${colorId}-${regions.length}`,
        index: regions.length + 1,
        color: colorMap.get(colorId) || DEFAULT_THREAD_PALETTE[0],
        cells,
        centroid,
        cellCount: cells.length,
      });
    }
  }

  return regions
    .sort((left, right) => right.cellCount - left.cellCount)
    .slice(0, options?.limit ?? regions.length)
    .map((region, index) => ({
      ...region,
      index: index + 1,
    }));
}

export function buildPathPlan(
  matrix: PatternMatrix,
  mode: PathMode,
  difficulty: PathDifficulty = 'standard',
): PathPlan {
  const center = (matrix.size - 1) / 2;
  const maxSteps = difficulty === 'beginner' ? 4 : 8;
  const minRegionSize = difficulty === 'beginner' ? 3 : 1;
  const regions = extractRegions(matrix, { limit: 24 })
    .filter((region) => region.cellCount >= minRegionSize)
    .map((region) => {
      const distanceToCenter = Math.sqrt((region.centroid.x - center) ** 2 + (region.centroid.y - center) ** 2);
      const distanceToBorder = Math.min(
        region.centroid.x,
        region.centroid.y,
        matrix.size - 1 - region.centroid.x,
        matrix.size - 1 - region.centroid.y,
      );

      return {
        ...region,
        distanceToCenter,
        distanceToBorder,
      };
    })
    .sort((left, right) => {
      if (mode === 'center-first') {
        return left.distanceToCenter - right.distanceToCenter;
      }
      if (mode === 'border-first') {
        return left.distanceToBorder - right.distanceToBorder;
      }
      if (mode === 'color-first') {
        return left.color.name.localeCompare(right.color.name, 'zh-CN');
      }
      return right.cellCount - left.cellCount;
    })
    .slice(0, maxSteps);

  const regionEndpoints = regions.map((region) => {
    const sorted = [...region.cells].sort((left, right) => left.y - right.y || left.x - right.x);
    return {
      startPoint: sorted[0] || { x: region.centroid.x, y: region.centroid.y },
      endPoint: sorted[sorted.length - 1] || { x: region.centroid.x, y: region.centroid.y },
    };
  });

  const steps: RegionStep[] = regions.map((region, index) => ({
    id: `${region.color.id}-${index}`,
    index: index + 1,
    title:
      difficulty === 'beginner'
        ? index === 0
          ? '先完成主体大色块'
          : `第 ${index + 1} 步补充区域`
        : index === 0
          ? '先处理主轮廓'
          : index === regions.length - 1
            ? '补充收尾细节'
            : `完成第 ${index + 1} 段纹样`,
    description:
      difficulty === 'beginner'
        ? `${region.color.name} 主要区域约 ${region.cellCount} 格，建议连续完成后再换色。`
        : `${region.color.name} 区域约 ${region.cellCount} 格，建议按相邻格连续推进。`,
    color: region.color,
    cellCount: region.cellCount,
    centroid: region.centroid,
    startPoint: regionEndpoints[index]?.startPoint || region.centroid,
    endPoint: regionEndpoints[index]?.endPoint || region.centroid,
    colorChangedFromPrevious: index > 0 && regions[index - 1]?.color.id !== region.color.id,
    orderHint:
      mode === 'traditional'
        ? '由主到次、由外到内'
        : mode === 'center-first'
          ? '由中心向外'
          : mode === 'border-first'
            ? '由边框向中心'
            : '按颜色成组推进',
  }));

  return {
    mode,
    difficulty,
    steps,
    polyline: steps.map((step) => step.centroid),
    startPoint: steps[0]?.startPoint || null,
    endPoint: steps[steps.length - 1]?.endPoint || null,
    switchPoints: steps.filter((step) => step.colorChangedFromPrevious).map((step) => step.startPoint),
  };
}

function buildLineart(matrix: PatternMatrix, cellSize: number, padding: number) {
  const stroke = '#1a1814';
  const lines: string[] = [];
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      const current = matrix.cells[y][x].colorId;
      const originX = padding + x * cellSize;
      const originY = padding + y * cellSize;
      const right = matrix.cells[y]?.[x + 1]?.colorId;
      const bottom = matrix.cells[y + 1]?.[x]?.colorId;
      const left = matrix.cells[y]?.[x - 1]?.colorId;
      const top = matrix.cells[y - 1]?.[x]?.colorId;

      if (x === 0 || left !== current) {
        lines.push(
          `<line x1="${originX}" y1="${originY}" x2="${originX}" y2="${originY + cellSize}" stroke="${stroke}" stroke-width="1.25" />`,
        );
      }
      if (y === 0 || top !== current) {
        lines.push(
          `<line x1="${originX}" y1="${originY}" x2="${originX + cellSize}" y2="${originY}" stroke="${stroke}" stroke-width="1.25" />`,
        );
      }
      if (x === matrix.size - 1 || right !== current) {
        lines.push(
          `<line x1="${originX + cellSize}" y1="${originY}" x2="${originX + cellSize}" y2="${originY + cellSize}" stroke="${stroke}" stroke-width="1.25" />`,
        );
      }
      if (y === matrix.size - 1 || bottom !== current) {
        lines.push(
          `<line x1="${originX}" y1="${originY + cellSize}" x2="${originX + cellSize}" y2="${originY + cellSize}" stroke="${stroke}" stroke-width="1.25" />`,
        );
      }
    }
  }
  return lines.join('');
}

export function matrixToSvg(
  matrix: PatternMatrix,
  options?: {
    cellSize?: number;
    showGrid?: boolean;
    showNumbers?: boolean;
    showRegionNumbers?: boolean;
    showLineart?: boolean;
    pathPlan?: PathPlan | null;
    background?: string;
    padding?: number;
    transparentBackground?: boolean;
    hideFills?: boolean;
  },
) {
  const cellSize = options?.cellSize ?? 16;
  const padding = options?.padding ?? 24;
  const width = matrix.size * cellSize + padding * 2;
  const height = matrix.size * cellSize + padding * 2;
  const colorMap = paletteMap(matrix);
  const rowLabels = options?.showNumbers
    ? Array.from({ length: matrix.size }, (_, index) => index + 1)
    : [];
  const regions = options?.showRegionNumbers ? extractRegions(matrix, { limit: 24 }) : [];

  const fills = options?.showLineart || options?.hideFills
    ? ''
    : matrix.cells
        .flatMap((row, y) =>
          row.map((cell, x) => {
            const color = colorMap.get(cell.colorId) || DEFAULT_THREAD_PALETTE[0];
            return `<rect x="${padding + x * cellSize}" y="${padding + y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color.hex}" />`;
          }),
        )
        .join('');

  const grid = options?.showGrid
    ? Array.from({ length: matrix.size + 1 }, (_, index) => {
        const position = padding + index * cellSize;
        const stroke = options?.showLineart ? 'rgba(26,24,20,0.18)' : 'rgba(245,240,232,0.3)';
        return `
          <line x1="${padding}" y1="${position}" x2="${width - padding}" y2="${position}" stroke="${stroke}" stroke-width="0.6" />
          <line x1="${position}" y1="${padding}" x2="${position}" y2="${height - padding}" stroke="${stroke}" stroke-width="0.6" />
        `;
      }).join('')
    : '';

  const numbers = rowLabels
    .map((label, index) => {
      const pos = padding + index * cellSize + cellSize * 0.7;
      const fill = options?.showLineart ? '#1a1814' : '#f5f0e8';
      return `
        <text x="${padding - 8}" y="${pos}" fill="${fill}" font-size="8" text-anchor="end">${label}</text>
        <text x="${pos}" y="${padding - 8}" fill="${fill}" font-size="8" text-anchor="middle">${label}</text>
      `;
    })
    .join('');

  const regionOverlay = regions
    .map(
      (region) => `
        <circle cx="${padding + region.centroid.x * cellSize + cellSize / 2}" cy="${padding + region.centroid.y * cellSize + cellSize / 2}" r="${Math.max(6, cellSize * 0.42)}" fill="#1a1814" stroke="${region.color.hex}" stroke-width="1.4" />
        <text x="${padding + region.centroid.x * cellSize + cellSize / 2}" y="${padding + region.centroid.y * cellSize + cellSize / 2 + 3}" fill="#f5f0e8" font-size="8" text-anchor="middle">${region.index}</text>
      `,
    )
    .join('');

  const markerColor = options?.showLineart || options?.transparentBackground ? '#1a1814' : '#f5f0e8';

  const pathOverlay = options?.pathPlan
    ? `
      <polyline
        points="${options.pathPlan.polyline
          .map(
            (point) =>
              `${padding + point.x * cellSize + cellSize / 2},${padding + point.y * cellSize + cellSize / 2}`,
          )
          .join(' ')}"
        fill="none"
        stroke="${markerColor}"
        stroke-width="1.4"
        stroke-dasharray="4 2"
      />
      ${options.pathPlan.steps
        .map(
          (step) => `
            <circle cx="${padding + step.centroid.x * cellSize + cellSize / 2}" cy="${padding + step.centroid.y * cellSize + cellSize / 2}" r="${Math.max(4, cellSize * 0.32)}" fill="#1a1814" stroke="${step.color.hex}" stroke-width="1.2" />
            <text x="${padding + step.centroid.x * cellSize + cellSize / 2}" y="${padding + step.centroid.y * cellSize + cellSize / 2 + 2}" fill="#f5f0e8" font-size="7" text-anchor="middle">${step.index}</text>
          `,
        )
        .join('')}
      ${
        options.pathPlan.startPoint
          ? `<circle cx="${padding + options.pathPlan.startPoint.x * cellSize + cellSize / 2}" cy="${padding + options.pathPlan.startPoint.y * cellSize + cellSize / 2}" r="${Math.max(5, cellSize * 0.34)}" fill="#2c8c5b" stroke="${markerColor}" stroke-width="1.2" />
             <text x="${padding + options.pathPlan.startPoint.x * cellSize + cellSize / 2}" y="${padding + options.pathPlan.startPoint.y * cellSize + cellSize / 2 - 10}" fill="${markerColor}" font-size="7" text-anchor="middle">起</text>`
          : ''
      }
      ${
        options.pathPlan.endPoint
          ? `<rect x="${padding + options.pathPlan.endPoint.x * cellSize + cellSize / 2 - Math.max(4, cellSize * 0.26)}" y="${padding + options.pathPlan.endPoint.y * cellSize + cellSize / 2 - Math.max(4, cellSize * 0.26)}" width="${Math.max(8, cellSize * 0.52)}" height="${Math.max(8, cellSize * 0.52)}" fill="#c45c26" stroke="${markerColor}" stroke-width="1.2" rx="2" />
             <text x="${padding + options.pathPlan.endPoint.x * cellSize + cellSize / 2}" y="${padding + options.pathPlan.endPoint.y * cellSize + cellSize / 2 - 10}" fill="${markerColor}" font-size="7" text-anchor="middle">终</text>`
          : ''
      }
      ${options.pathPlan.switchPoints
        .map(
          (point) => `
            <polygon
              points="${padding + point.x * cellSize + cellSize / 2},${padding + point.y * cellSize + cellSize / 2 - Math.max(5, cellSize * 0.3)}
              ${padding + point.x * cellSize + cellSize / 2 + Math.max(5, cellSize * 0.3)},${padding + point.y * cellSize + cellSize / 2}
              ${padding + point.x * cellSize + cellSize / 2},${padding + point.y * cellSize + cellSize / 2 + Math.max(5, cellSize * 0.3)}
              ${padding + point.x * cellSize + cellSize / 2 - Math.max(5, cellSize * 0.3)},${padding + point.y * cellSize + cellSize / 2}"
              fill="#8b6914"
              stroke="${markerColor}"
              stroke-width="1.1"
            />
          `,
        )
        .join('')}
    `
    : '';

  const lineart = options?.showLineart ? buildLineart(matrix, cellSize, padding) : '';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${
        options?.transparentBackground
          ? ''
          : `<rect width="${width}" height="${height}" fill="${options?.background || (options?.showLineart ? '#faf6ef' : '#0f0d0a')}" rx="18" />`
      }
      ${fills}
      ${grid}
      ${lineart}
      ${numbers}
      ${regionOverlay}
      ${pathOverlay}
    </svg>
  `.trim();
}
