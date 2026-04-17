export function createSeedPatternDataUrl(theme: string) {
  const encodedTheme = theme || '西兰卡普纹样';
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
      <text x="256" y="490" text-anchor="middle" font-size="24" fill="#ebe4d4" font-family="serif">${encodedTheme}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

