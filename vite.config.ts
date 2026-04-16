import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { createGeneration, getGenerationResponse, getGenerationSnapshot, validateGenerateRequest } from './functions/_lib/generation-service';
import type { CloudflarePagesContext } from './functions/_lib/runtime';
import type { GenerateRequest } from './functions/_lib/types';
import { advanceGeneration } from './functions/_lib/generation-service';

function readRequestBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', reject);
  });
}

function sendJson(
  res: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body: string): void;
  },
  statusCode: number,
  payload: unknown,
) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function devApiPlugin(): Plugin {
  return {
    name: 'xilankapu-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const method = req.method || 'GET';
        const url = req.url || '/';
        const pathname = url.split('?')[0];

        if (!pathname.startsWith('/api/')) {
          next();
          return;
        }

        const context: CloudflarePagesContext = {
          request: new Request(`http://localhost${url}`),
          env: process.env as Record<string, string>,
        };

        try {
          if (pathname === '/api/generate' && method === 'POST') {
            const rawBody = await readRequestBody(req);
            const body = JSON.parse(rawBody || '{}') as GenerateRequest;
            const validationError = validateGenerateRequest(body);
            if (validationError) {
              sendJson(res, 400, { error: validationError });
              return;
            }
            const result = await createGeneration(context, body);
            sendJson(res, 200, { success: true, generationId: result.generationId, taskIds: [] });
            return;
          }

          const generationStatusMatch = pathname.match(/^\/api\/generations\/([^/]+)\/status$/);
          if (generationStatusMatch && method === 'GET') {
            const generationId = decodeURIComponent(generationStatusMatch[1]);
            let snapshot = await getGenerationSnapshot(context, generationId);
            if (!snapshot) {
              sendJson(res, 404, { error: 'Generation not found' });
              return;
            }
            if (snapshot.status === 'processing') {
              await advanceGeneration(context, generationId);
              snapshot = await getGenerationSnapshot(context, generationId);
            }
            sendJson(res, 200, snapshot);
            return;
          }

          const generationMatch = pathname.match(/^\/api\/generations\/([^/]+)$/);
          if (generationMatch && method === 'GET') {
            const generationId = decodeURIComponent(generationMatch[1]);
            const generation = await getGenerationResponse(context, generationId);
            if (!generation) {
              sendJson(res, 404, { error: 'Generation not found' });
              return;
            }
            sendJson(res, 200, generation);
            return;
          }
        } catch (error) {
          sendJson(res, 500, {
            error: error instanceof Error ? error.message : 'Internal server error',
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApiPlugin()],
});

