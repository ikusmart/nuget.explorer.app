const KEY_PREFIX = "nuget-cache:";
const CACHE_TTL = 5 * 24 * 60 * 60 * 1000; // 5 days

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/** Get a value from the persistent cache */
export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(KEY_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/** Set a value in the persistent cache */
export function cacheSet<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded — evict oldest entries and retry
    evictOldest(10);
    try {
      localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Still failing — give up silently
    }
  }
}

/** Get all cached values whose keys start with the given prefix */
export function cacheGetAllByPrefix<T>(prefix: string): { key: string; data: T }[] {
  const fullPrefix = KEY_PREFIX + prefix;
  const results: { key: string; data: T }[] = [];
  const now = Date.now();

  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i);
    if (!storageKey || !storageKey.startsWith(fullPrefix)) continue;

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const entry: CacheEntry<T> = JSON.parse(raw);
      if (now - entry.timestamp > CACHE_TTL) {
        localStorage.removeItem(storageKey);
        continue;
      }
      results.push({
        key: storageKey.slice(KEY_PREFIX.length),
        data: entry.data,
      });
    } catch {
      // Skip malformed entries
    }
  }

  return results;
}

/** Clear all cache entries */
export function cacheClear(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

/** Get cache statistics */
export function getCacheServiceStats(): { size: number; keys: string[] } {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEY_PREFIX)) {
      keys.push(key.slice(KEY_PREFIX.length));
    }
  }
  return { size: keys.length, keys };
}

/** Evict the oldest N cache entries */
function evictOldest(count: number): void {
  const entries: { key: string; timestamp: number }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(KEY_PREFIX)) continue;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const entry: CacheEntry<unknown> = JSON.parse(raw);
      entries.push({ key, timestamp: entry.timestamp });
    } catch {
      // Remove malformed entries
      if (key) localStorage.removeItem(key);
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  const toRemove = entries.slice(0, count);
  for (const entry of toRemove) {
    localStorage.removeItem(entry.key);
  }
}
