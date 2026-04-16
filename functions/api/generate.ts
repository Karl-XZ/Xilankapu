import { createGeneration, validateGenerateRequest } from '../_lib/generation-service';
import { json } from '../_lib/response';
import type { CloudflarePagesContext } from '../_lib/runtime';
import type { GenerateRequest } from '../_lib/types';

export async function onRequestPost(context: CloudflarePagesContext) {
  try {
    const body = (await context.request.json()) as GenerateRequest;
    const validationError = validateGenerateRequest(body);

    if (validationError) {
      return json({ error: validationError }, 400);
    }

    const { generationId } = await createGeneration(context, body);
    return json({
      success: true,
      generationId,
      taskIds: [],
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Generation failed' }, 500);
  }
}

