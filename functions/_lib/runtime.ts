export interface CloudflareKvNamespace {
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
  ): Promise<void>;
  get(
    key: string,
    options?: 'text' | 'json' | 'arrayBuffer' | 'stream' | { type?: string },
  ): Promise<unknown>;
}

export interface CloudflarePagesContext {
  request: Request;
  params?: Record<string, string>;
  env?: Record<string, unknown>;
  waitUntil?: (task: Promise<unknown>) => void;
}

export function getBinding<T>(context: CloudflarePagesContext, name: string): T | undefined {
  const fromContext = context.env?.[name];
  if (fromContext !== undefined) {
    return fromContext as T;
  }

  const scope = globalThis as typeof globalThis & Record<string, unknown>;
  return scope[name] as T | undefined;
}

export function getEnvString(context: CloudflarePagesContext, name: string) {
  const binding = getBinding<unknown>(context, name);
  if (typeof binding === 'string' && binding.trim()) {
    return binding.trim();
  }

  const scope = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = scope.process?.env?.[name];
  return value?.trim() || undefined;
}

