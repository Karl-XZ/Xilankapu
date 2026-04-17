const { app, BrowserWindow, ipcMain } = require('electron');
const { createHash, createHmac, randomUUID } = require('node:crypto');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';
const generationStore = new Map();

const DEFAULT_ARK_MODEL_ID = 'doubao-seedream-4-5-250821';
const DEFAULT_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

function hash(input) {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 31 + input.charCodeAt(index)) >>> 0;
  }
  return value;
}

function paletteFromHash(value) {
  const palettes = [
    ['#c45c26', '#2c4a7c', '#f0e6d3', '#c9a227', '#1a1814'],
    ['#a63d40', '#8b6914', '#3d5a3d', '#ebe4d4', '#1a1814'],
    ['#1e4d6b', '#c9a227', '#c45c26', '#f0e6d3', '#1a1814'],
    ['#6b8e6b', '#d4a84b', '#8b4513', '#f5f5dc', '#2f2f2f'],
    ['#4a4a8a', '#c9a227', '#8b0000', '#faf0e6', '#1a1a1a'],
  ];
  return palettes[value % palettes.length];
}

function createMockPatternImage(prompt, label, theme, index = 0) {
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

function complexityLabel(level) {
  return ['极简', '简洁', '中等', '丰富', '复杂'][Math.max(0, Math.min((level || 3) - 1, 4))];
}

function buildStructureTags(request, variantLabel) {
  return [
    request.motifCategory || '主题纹',
    request.symmetryMode === 'quad'
      ? '四向对称'
      : request.symmetryMode === 'mirror'
        ? '镜像对称'
        : request.symmetryMode === 'rotation'
          ? '旋转对称'
          : '自由构成',
    request.sceneType || '教学制作',
    variantLabel || '标准方案',
  ].filter(Boolean);
}

function buildColorTags(request) {
  const tags = Array.isArray(request.selectedPaletteIds)
    ? request.selectedPaletteIds
        .slice(0, Math.max(request.colorCount || 1, 1))
        .map((colorId) => String(colorId).replace(/-/g, ' '))
    : [];
  if (request.colorMood) {
    tags.unshift(request.colorMood);
  }
  return tags.slice(0, 5);
}

function getPlannedCandidates(request) {
  if (Array.isArray(request.candidatePlans) && request.candidatePlans.length > 0) {
    return request.candidatePlans;
  }

  const count = Math.max(1, Math.min(Number(request.generationCount) || 1, 8));
  return Array.from({ length: count }, () => ({
    prompt: request.finalPrompt,
  }));
}

function createTaskRecord(generationId, request) {
  const plannedCandidates = getPlannedCandidates(request);
  const task = {
    id: generationId,
    createdAt: new Date().toISOString(),
    request,
    status: 'processing',
    progress: {
      total: plannedCandidates.length,
      success: 0,
      failed: 0,
      pending: plannedCandidates.length,
    },
    candidates: [],
  };

  return {
    task,
    request,
    plannedCandidates,
    candidates: [],
    failures: [],
    started: false,
  };
}

function publicTask(record) {
  return {
    ...record.task,
    candidates: [...record.candidates],
    progress: {
      total: record.task.progress.total,
      success: record.candidates.length,
      failed: record.failures.length,
      pending: Math.max(record.task.progress.total - record.candidates.length - record.failures.length, 0),
    },
    status:
      record.task.status === 'processing'
        ? 'processing'
        : record.candidates.length > 0
          ? 'completed'
          : 'failed',
    errorMessage: record.failures.length > 0 ? record.failures.join(' | ') : undefined,
  };
}

function getArkConfig() {
  const apiKey = process.env.VOLCENGINE_API_KEY || process.env.ARK_API_KEY;
  const accessKeyId = process.env.VOLCENGINE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.VOLCENGINE_SECRET_ACCESS_KEY;

  if (apiKey) {
    return {
      provider: 'ark',
      apiKey,
      modelId: process.env.VOLCENGINE_MODEL_ID || process.env.ARK_MODEL_ID || DEFAULT_ARK_MODEL_ID,
      baseUrl: process.env.VOLCENGINE_ARK_BASE_URL || process.env.ARK_BASE_URL || DEFAULT_ARK_BASE_URL,
      watermark: false,
    };
  }

  if (accessKeyId && secretAccessKey) {
    return {
      provider: 'visual',
      accessKeyId,
      secretAccessKey,
      reqKey: process.env.VOLCENGINE_REQ_KEY || 'byteedit_v2.0',
    };
  }

  return { provider: 'mock' };
}

function normalizeArkBaseUrl(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizeInputImage(image) {
  return image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
}

function isSeedEditModel(modelId) {
  return String(modelId).toLowerCase().includes('seededit');
}

function buildArkImageInput(modelId, uploadedImages) {
  const normalizedImages = (uploadedImages || [])
    .filter((image) => typeof image === 'string' && image.length > 0)
    .map(normalizeInputImage);

  if (normalizedImages.length === 0) {
    throw new Error('At least one uploaded image is required');
  }

  if (isSeedEditModel(modelId) || normalizedImages.length === 1) {
    return normalizedImages[0];
  }

  return normalizedImages.slice(0, 8);
}

function sha256Hex(content) {
  return createHash('sha256').update(content).digest('hex');
}

function hmacRaw(key, content) {
  return createHmac('sha256', key).update(content).digest();
}

function toXDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

async function responseToDataUrl(response, fallbackType = 'image/png') {
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || fallbackType;
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

function getArkErrorMessage(payload, status) {
  return payload?.error?.message || payload?.error?.code || `Volcengine Ark request failed with status ${status}`;
}

async function callArkImage(uploadedImages, prompt, config) {
  const image = buildArkImageInput(config.modelId, uploadedImages);
  const requestBody = {
    model: config.modelId,
    prompt,
    image,
    size: '1024x1024',
    watermark: config.watermark,
    response_format: 'url',
  };

  if (!isSeedEditModel(config.modelId)) {
    requestBody.sequential_image_generation = 'disabled';
  }

  const response = await fetch(`${normalizeArkBaseUrl(config.baseUrl)}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const payload = await response.json();
  const firstImage = payload?.data?.[0];
  if (!response.ok || (!firstImage?.url && !firstImage?.b64_json)) {
    throw new Error(getArkErrorMessage(payload, response.status));
  }

  if (firstImage.b64_json) {
    return `data:image/png;base64,${firstImage.b64_json}`;
  }

  const imageResponse = await fetch(firstImage.url);
  if (!imageResponse.ok) {
    throw new Error(`Generated image download failed with status ${imageResponse.status}`);
  }

  return responseToDataUrl(imageResponse);
}

async function callVisualImage(uploadedImages, prompt, config) {
  const host = 'visual.volcengineapi.com';
  const service = 'cv';
  const version = '2022-08-31';
  const region = 'cn-north-1';
  const action = 'CVProcess';
  const contentType = 'application/json';
  const method = 'POST';
  const query = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(version)}`;
  const requestBody = JSON.stringify({
    req_key: config.reqKey,
    binary_data_base64: uploadedImages,
    prompt,
    return_url: false,
    logo_info: {
      add_logo: true,
      logo_text_content: '西兰卡普',
    },
  });
  const xDate = toXDate(new Date());
  const shortXDate = xDate.slice(0, 8);
  const xContentSha256 = sha256Hex(requestBody);
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-content-sha256:${xContentSha256}`,
    `x-date:${xDate}`,
  ].join('\n');

  const canonicalRequest = [method, '/', query, canonicalHeaders, '', signedHeaders, xContentSha256].join('\n');
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);
  const credentialScope = `${shortXDate}/${region}/${service}/request`;
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, hashedCanonicalRequest].join('\n');

  const kDate = hmacRaw(config.secretAccessKey, shortXDate);
  const kRegion = hmacRaw(kDate, region);
  const kService = hmacRaw(kRegion, service);
  const kSigning = hmacRaw(kService, 'request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = [
    `HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  const response = await fetch(`https://${host}/?${query}`, {
    method,
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      'X-Content-Sha256': xContentSha256,
      'X-Date': xDate,
    },
    body: requestBody,
  });

  const payload = await response.json();
  if (!response.ok || payload.code !== 10000 || !payload.data?.binary_data_base64?.[0]) {
    throw new Error(payload.message || `Volcengine request failed with status ${response.status}`);
  }

  return `data:image/jpeg;base64,${payload.data.binary_data_base64[0]}`;
}

async function callGenerationProvider(request, candidatePlan, index) {
  const config = getArkConfig();
  if (config.provider === 'mock') {
    return createMockPatternImage(candidatePlan.prompt, candidatePlan.variantLabel || `候选${index + 1}`, request.theme || '西兰卡普', index);
  }

  const uploadedImages =
    Array.isArray(candidatePlan.imageIndexes) && candidatePlan.imageIndexes.length > 0
      ? candidatePlan.imageIndexes
          .map((imageIndex) => request.uploadedImages?.[imageIndex])
          .filter((image) => typeof image === 'string' && image.length > 0)
      : request.uploadedImages || [];

  if (config.provider === 'ark') {
    return callArkImage(uploadedImages, candidatePlan.prompt, config);
  }

  return callVisualImage(uploadedImages, candidatePlan.prompt, config);
}

async function processGeneration(generationId) {
  const record = generationStore.get(generationId);
  if (!record || record.started) {
    return;
  }

  record.started = true;

  for (let index = 0; index < record.plannedCandidates.length; index += 1) {
    const candidatePlan = record.plannedCandidates[index];
    try {
      const imageUrl = await callGenerationProvider(record.request, candidatePlan, index);
      record.candidates.push({
        id: `${generationId}-${index}`,
        name: `${record.request.theme || '纹样'}·${candidatePlan.variantLabel || `候选${index + 1}`}`,
        theme: record.request.theme || '西兰卡普纹样',
        imageUrl,
        colors: record.request.selectedPaletteIds || [],
        structureTags: buildStructureTags(record.request, candidatePlan.variantLabel),
        colorTags: buildColorTags(record.request),
        complexity: complexityLabel(record.request.complexity),
        variantLabel: candidatePlan.variantLabel,
        summary: `${record.request.theme || '纹样'} / ${record.request.subjectObject || record.request.motifCategory || '主纹'} / ${candidatePlan.variantLabel || '标准方案'}`,
      });
    } catch (error) {
      record.failures.push(error instanceof Error ? error.message : String(error));
    }

    record.task.progress = {
      total: record.task.progress.total,
      success: record.candidates.length,
      failed: record.failures.length,
      pending: Math.max(record.task.progress.total - record.candidates.length - record.failures.length, 0),
    };
  }

  record.task.status = record.candidates.length > 0 ? 'completed' : 'failed';
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '西兰卡普 - AI 纹样设计平台',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:1420');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function registerGenerationHandlers() {
  ipcMain.handle('generation:submit', async (_event, request) => {
    if (!request?.finalPrompt?.trim()) {
      throw new Error('finalPrompt is required');
    }

    const generationId = randomUUID();
    const record = createTaskRecord(generationId, request);
    generationStore.set(generationId, record);
    void processGeneration(generationId);

    return { success: true, generationId, taskIds: [] };
  });

  ipcMain.handle('generation:status', async (_event, generationId) => {
    const record = generationStore.get(generationId);
    if (!record) {
      throw new Error('Generation not found');
    }
    return publicTask(record);
  });

  ipcMain.handle('generation:get', async (_event, generationId) => {
    const record = generationStore.get(generationId);
    return record ? publicTask(record) : null;
  });
}

app.whenReady().then(() => {
  registerGenerationHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
