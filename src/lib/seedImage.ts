function drawPolygon(
  context: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  fill?: string,
  stroke?: string,
  lineWidth = 1,
) {
  if (points.length === 0) {
    return;
  }

  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index][0], points[index][1]);
  }
  context.closePath();

  if (fill) {
    context.fillStyle = fill;
    context.fill();
  }

  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.stroke();
  }
}

function createSvgFallback(theme: string) {
  const label = theme || 'Xilankapu';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <rect width="512" height="512" fill="#1a1814"/>
      <g transform="translate(256 256)">
        <polygon points="0,-190 190,0 0,190 -190,0" fill="none" stroke="#c45c26" stroke-width="14"/>
        <polygon points="0,-140 140,0 0,140 -140,0" fill="#2c4a7c" stroke="#c9a227" stroke-width="12"/>
        <polygon points="0,-92 92,0 0,92 -92,0" fill="#a63d40" stroke="#f0e6d3" stroke-width="10"/>
        <polygon points="0,-46 46,0 0,46 -46,0" fill="#c9a227"/>
      </g>
      <g fill="#3d5a3d" stroke="#c9a227" stroke-width="8">
        <polygon points="76,76 112,112 76,148 40,112"/>
        <polygon points="436,76 472,112 436,148 400,112"/>
        <polygon points="76,364 112,400 76,436 40,400"/>
        <polygon points="436,364 472,400 436,436 400,400"/>
      </g>
      <text x="256" y="490" text-anchor="middle" font-size="24" fill="#ebe4d4" font-family="serif">${label}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createSeedPatternDataUrl(theme: string) {
  if (typeof document === 'undefined') {
    return createSvgFallback(theme);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext('2d');
  if (!context) {
    return createSvgFallback(theme);
  }

  context.fillStyle = '#1a1814';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.translate(256, 256);

  drawPolygon(
    context,
    [
      [0, -190],
      [190, 0],
      [0, 190],
      [-190, 0],
    ],
    undefined,
    '#c45c26',
    14,
  );

  drawPolygon(
    context,
    [
      [0, -140],
      [140, 0],
      [0, 140],
      [-140, 0],
    ],
    '#2c4a7c',
    '#c9a227',
    12,
  );

  drawPolygon(
    context,
    [
      [0, -92],
      [92, 0],
      [0, 92],
      [-92, 0],
    ],
    '#a63d40',
    '#f0e6d3',
    10,
  );

  drawPolygon(
    context,
    [
      [0, -46],
      [46, 0],
      [0, 46],
      [-46, 0],
    ],
    '#c9a227',
  );

  context.restore();

  const corners: Array<[number, number]> = [
    [76, 76],
    [436, 76],
    [76, 364],
    [436, 364],
  ];
  for (const [x, y] of corners) {
    drawPolygon(
      context,
      [
        [x, y],
        [x + 36, y + 36],
        [x, y + 72],
        [x - 36, y + 36],
      ],
      '#3d5a3d',
      '#c9a227',
      8,
    );
  }

  context.fillStyle = '#ebe4d4';
  context.font = '24px serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(theme || 'Xilankapu', 256, 490);

  return canvas.toDataURL('image/png');
}
