type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const serverCache = new Map<string, CacheEntry<unknown>>();

export async function getOrSetServerCache<T>(
  key: string,
  ttlMs: number,
  factory: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = serverCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const value = await factory();
  serverCache.set(key, {
    value,
    expiresAt: now + Math.max(ttlMs, 1000),
  });

  return value;
}

export function clearServerCacheByPrefix(prefix: string) {
  for (const key of serverCache.keys()) {
    if (key.startsWith(prefix)) {
      serverCache.delete(key);
    }
  }
}
