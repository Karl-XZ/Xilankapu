function hash(input: string) {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 31 + input.charCodeAt(index)) >>> 0;
  }
  return value;
}

function paletteFromHash(value: number) {
  const palettes = [
    ['#c45c26', '#2c4a7c', '#f0e6d3', '#c9a227', '#1a1814'],
    ['#a63d40', '#8b6914', '#3d5a3d', '#ebe4d4', '#1a1814'],
    ['#1e4d6b', '#c9a227', '#c45c26', '#f0e6d3', '#1a1814'],
  ];
  return palettes[value % palettes.length];
}

export function createMockPatternImage(prompt: string, label: string, theme: string) {
  const seed = hash(`${prompt}:${label}:${theme}`);
  const palette = paletteFromHash(seed);
  const rotation = seed % 45;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
      <rect width="640" height="640" fill="${palette[4]}"/>
      <g transform="translate(320 320) rotate(${rotation})">
        <polygon points="0,-220 220,0 0,220 -220,0" fill="none" stroke="${palette[0]}" stroke-width="18"/>
        <polygon points="0,-170 170,0 0,170 -170,0" fill="${palette[1]}" stroke="${palette[3]}" stroke-width="14"/>
        <polygon points="0,-110 110,0 0,110 -110,0" fill="${palette[2]}" stroke="${palette[3]}" stroke-width="10"/>
        <polygon points="0,-54 54,0 0,54 -54,0" fill="${palette[3]}"/>
      </g>
      <g fill="${palette[0]}" opacity="0.9">
        <polygon points="100,100 150,150 100,200 50,150"/>
        <polygon points="540,100 590,150 540,200 490,150"/>
        <polygon points="100,440 150,490 100,540 50,490"/>
        <polygon points="540,440 590,490 540,540 490,490"/>
      </g>
      <text x="320" y="600" text-anchor="middle" fill="${palette[3]}" font-size="26" font-family="serif">${theme} · ${label}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

