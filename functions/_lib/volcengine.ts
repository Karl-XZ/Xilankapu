import { createHash, createHmac } from 'node:crypto';

import { createMockPatternImage } from './mock-generation';
import { getEnvString, type CloudflarePagesContext } from './runtime';

interface VisualVolcengineResponse {
  code: number;
  message?: string;
  data?: {
    binary_data_base64?: string[];
  };
}

interface ArkImagesResponse {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export type VolcengineConfig =
  | {
      provider: 'ark';
      apiKey: string;
      modelId: string;
      baseUrl: string;
      watermark: boolean;
    }
  | {
      provider: 'visual';
      accessKeyId: string;
      secretAccessKey: string;
      reqKey: string;
    }
  | {
      provider: 'mock';
    };

const DEFAULT_ARK_MODEL_ID = 'doubao-seedream-4-5-250821';
const DEFAULT_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

function sha256Hex(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

function hmacRaw(key: Buffer | string, content: string) {
  return createHmac('sha256', key).update(content).digest();
}

function toXDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function normalizeArkBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizeInputImage(image: string) {
  return image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
}

function isSeedEditModel(modelId: string) {
  return modelId.toLowerCase().includes('seededit');
}

function buildArkImageInput(modelId: string, uploadedImages: string[]) {
  const normalizedImages = uploadedImages
    .filter((image): image is string => typeof image === 'string' && image.length > 0)
    .map(normalizeInputImage);

  if (normalizedImages.length === 0) {
    throw new Error('At least one uploaded image is required');
  }

  if (isSeedEditModel(modelId) || normalizedImages.length === 1) {
    return normalizedImages[0];
  }

  return normalizedImages.slice(0, 8);
}

async function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getArkErrorMessage(payload: ArkImagesResponse, status: number) {
  return (
    payload.error?.message ||
    payload.error?.code ||
    `Volcengine Ark request failed with status ${status}`
  );
}

function getPreferredApiKey(context: CloudflarePagesContext) {
  return getEnvString(context, 'VOLCENGINE_API_KEY') || getEnvString(context, 'ARK_API_KEY');
}

function getLegacyArkCompatConfig(context: CloudflarePagesContext) {
  const accessKeyLike = getEnvString(context, 'VOLCENGINE_ACCESS_KEY_ID');
  const modelIdLike = getEnvString(context, 'VOLCENGINE_REQ_KEY');

  if (
    accessKeyLike &&
    modelIdLike &&
    !accessKeyLike.startsWith('AK') &&
    modelIdLike.toLowerCase().startsWith('doubao-')
  ) {
    return {
      apiKey: accessKeyLike,
      modelId: modelIdLike,
    };
  }

  return null;
}

async function callArkImage(
  uploadedImages: string[],
  prompt: string,
  config: Extract<VolcengineConfig, { provider: 'ark' }>,
) {
  const image = buildArkImageInput(config.modelId, uploadedImages);
  const requestBody: Record<string, unknown> = {
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

  const payload = (await response.json()) as ArkImagesResponse;
  const firstImage = payload.data?.[0];
  if (!response.ok || (!firstImage?.url && !firstImage?.b64_json)) {
    throw new Error(getArkErrorMessage(payload, response.status));
  }

  if (firstImage.b64_json) {
    return `data:image/png;base64,${firstImage.b64_json}`;
  }

  const imageResponse = await fetch(firstImage.url!);
  if (!imageResponse.ok) {
    throw new Error(`Generated image download failed with status ${imageResponse.status}`);
  }

  const contentType = imageResponse.headers.get('content-type') || 'image/png';
  const base64 = await arrayBufferToBase64(await imageResponse.arrayBuffer());
  return `data:${contentType};base64,${base64}`;
}

async function callVisualImage(
  uploadedImages: string[],
  prompt: string,
  config: Extract<VolcengineConfig, { provider: 'visual' }>,
) {
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

  const canonicalRequest = [
    method,
    '/',
    query,
    canonicalHeaders,
    '',
    signedHeaders,
    xContentSha256,
  ].join('\n');

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

  const payload = (await response.json()) as VisualVolcengineResponse;
  if (!response.ok || payload.code !== 10000 || !payload.data?.binary_data_base64?.[0]) {
    throw new Error(payload.message || `Volcengine request failed with status ${response.status}`);
  }

  return `data:image/jpeg;base64,${payload.data.binary_data_base64[0]}`;
}

export function getVolcengineConfig(context: CloudflarePagesContext): VolcengineConfig {
  const apiKey = getPreferredApiKey(context);
  if (apiKey) {
    return {
      provider: 'ark',
      apiKey,
      modelId:
        getEnvString(context, 'VOLCENGINE_MODEL_ID') ||
        getEnvString(context, 'ARK_MODEL_ID') ||
        DEFAULT_ARK_MODEL_ID,
      baseUrl:
        getEnvString(context, 'VOLCENGINE_ARK_BASE_URL') ||
        getEnvString(context, 'ARK_BASE_URL') ||
        DEFAULT_ARK_BASE_URL,
      watermark: false,
    };
  }

  const legacy = getLegacyArkCompatConfig(context);
  if (legacy) {
    return {
      provider: 'ark',
      apiKey: legacy.apiKey,
      modelId: legacy.modelId,
      baseUrl:
        getEnvString(context, 'VOLCENGINE_ARK_BASE_URL') ||
        getEnvString(context, 'ARK_BASE_URL') ||
        DEFAULT_ARK_BASE_URL,
      watermark: false,
    };
  }

  const accessKeyId = getEnvString(context, 'VOLCENGINE_ACCESS_KEY_ID');
  const secretAccessKey = getEnvString(context, 'VOLCENGINE_SECRET_ACCESS_KEY');
  if (accessKeyId && secretAccessKey) {
    return {
      provider: 'visual',
      accessKeyId,
      secretAccessKey,
      reqKey: getEnvString(context, 'VOLCENGINE_REQ_KEY') || 'byteedit_v2.0',
    };
  }

  return { provider: 'mock' };
}

export async function callVolcengineImage(
  uploadedImages: string[],
  prompt: string,
  config: VolcengineConfig,
  variantLabel = '候选纹样',
  theme = '西兰卡普',
) {
  if (config.provider === 'mock') {
    return createMockPatternImage(prompt, variantLabel, theme);
  }

  if (config.provider === 'ark') {
    return callArkImage(uploadedImages, prompt, config);
  }

  return callVisualImage(uploadedImages, prompt, config);
}
