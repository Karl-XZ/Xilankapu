import { advanceGeneration, getGenerationSnapshot } from '../../../_lib/generation-service';
import { json } from '../../../_lib/response';
import type { CloudflarePagesContext } from '../../../_lib/runtime';

export async function onRequestGet(context: CloudflarePagesContext) {
  const generationId = context.params?.id;

  if (!generationId) {
    return json({ error: 'Missing generation id' }, 400);
  }

  let snapshot = await getGenerationSnapshot(context, generationId);
  if (!snapshot) {
    return json({ error: 'Generation not found' }, 404);
  }

  if (snapshot.status === 'processing') {
    await advanceGeneration(context, generationId);
    snapshot = await getGenerationSnapshot(context, generationId);
    if (!snapshot) {
      return json({ error: 'Generation not found' }, 404);
    }
  }

  return json(snapshot);
}

