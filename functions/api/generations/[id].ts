import { getGenerationResponse } from '../../_lib/generation-service';
import { json } from '../../_lib/response';
import type { CloudflarePagesContext } from '../../_lib/runtime';

export async function onRequestGet(context: CloudflarePagesContext) {
  const generationId = context.params?.id;

  if (!generationId) {
    return json({ error: 'Missing generation id' }, 400);
  }

  const generation = await getGenerationResponse(context, generationId);
  if (!generation) {
    return json({ error: 'Generation not found' }, 404);
  }

  return json(generation);
}

