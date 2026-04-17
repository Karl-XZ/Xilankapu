import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import type { GenerateRequest, CandidateResult, GenerationTask } from './src/types';

// Simple in-memory storage for desktop app
const generationStore = new Map<string, GenerationTask>();

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
    ['#6b8e6b', '#d4a84b', '#8b4513', '#f5f5dc', '#2f2f2f'],
    ['#4a4a8a', '#c9a227', '#8b0000', '#faf0e6', '#1a1a1a'],
  ];
  return palettes[value % palettes.length];
}

function createMockPatternSvg(prompt: string, label: string, theme: string, index: number) {
  const seed = hash(`${prompt}:${label}:${theme}:${index}`);
  const palette = paletteFromHash(seed);
  const rotation = (seed % 45) - 22;
  const scale = 0.7 + ((seed % 30) / 100);
  
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <rect width="640" height="640" fill="${palette[4]}"/>
  <g transform="translate(320 320) rotate(${rotation}) scale(${scale})">
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
  <text x="320" y="600" text-anchor="middle" fill="${palette[3]}" font-size="24" font-family="serif">${theme} · ${label}</text>
</svg>`.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function mockApiPlugin(): Plugin {
  return {
    name: 'xilankapu-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const method = req.method || 'GET';
        const url = req.url || '/';
        const pathname = url.split('?')[0];

        if (!pathname.startsWith('/api/')) {
          next();
          return;
        }

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const sendJson = (statusCode: number, payload: unknown) => {
          res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(payload));
        };

        try {
          // POST /api/generate
          if (pathname === '/api/generate' && method === 'POST') {
            let body = '';
            for await (const chunk of req) {
              body += chunk;
            }
            const request = JSON.parse(body || '{}') as GenerateRequest;
            
            if (!request.finalPrompt?.trim()) {
              sendJson(400, { error: 'finalPrompt is required' });
              return;
            }

            const generationId = crypto.randomUUID();
            const count = request.generationCount || 1;
            
            const task: GenerationTask = {
              id: generationId,
              createdAt: new Date().toISOString(),
              request,
              status: 'completed',
              progress: { total: count, success: count, failed: 0, pending: 0 },
              candidates: Array.from({ length: count }, (_, i) => {
                const variantLabels = ['标准方案', '中心强化', '边饰连续', '节庆配色', '层次增强', '创新变体'];
                const label = variantLabels[i % variantLabels.length];
                return {
                  id: `${generationId}-${i}`,
                  name: `${request.theme || '纹样'}·${label}`,
                  theme: request.theme || '西兰卡普纹样',
                  imageUrl: createMockPatternSvg(request.finalPrompt, label, request.theme || '西兰卡普', i),
                  colors: request.selectedPaletteIds || [],
                  structureTags: [
                    request.motifCategory || '主题纹',
                    request.symmetryMode === 'quad' ? '四向对称' : request.symmetryMode === 'mirror' ? '镜像对称' : '自由构成',
                    request.sceneType || '教学制作',
                    label
                  ],
                  colorTags: (request.selectedPaletteIds || []).slice(0, 5).map(c => c.replace(/-/g, ' ')),
                  complexity: ['极简', '简洁', '中等', '丰富', '复杂'][Math.max(0, Math.min((request.complexity || 3) - 1, 4))],
                  variantLabel: label,
                  summary: `${request.theme || '纹样'} / ${request.motifCategory || '主纹'} / ${label}`,
                } as CandidateResult;
              }),
            };

            generationStore.set(generationId, task);
            sendJson(200, { success: true, generationId, taskIds: [] });
            return;
          }

          // GET /api/generations/:id/status
          const statusMatch = pathname.match(/^\/api\/generations\/([^/]+)\/status$/);
          if (statusMatch && method === 'GET') {
            const generationId = decodeURIComponent(statusMatch[1]);
            const task = generationStore.get(generationId);
            
            if (!task) {
              sendJson(404, { error: 'Generation not found' });
              return;
            }
            
            sendJson(200, task);
            return;
          }

          // GET /api/generations/:id
          const genMatch = pathname.match(/^\/api\/generations\/([^/]+)$/);
          if (genMatch && method === 'GET') {
            const generationId = decodeURIComponent(genMatch[1]);
            const task = generationStore.get(generationId);
            
            if (!task) {
              sendJson(404, { error: 'Generation not found' });
              return;
            }
            
            sendJson(200, task);
            return;
          }

          sendJson(404, { error: 'Not found' });
        } catch (error) {
          sendJson(500, {
            error: error instanceof Error ? error.message : 'Internal server error',
          });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mockApiPlugin()],
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: 'esnext',
  },
});
