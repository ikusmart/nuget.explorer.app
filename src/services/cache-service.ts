const KEY_PREFIX = "nuget-cache:";
const SNAPSHOT_KEY = "nuget-cache-snapshot:default";
const CACHE_TTL = 5 * 24 * 60 * 60 * 1000; // 5 days

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheExport {
  version: 1;
  exportedAt: string;
  entries: Record<string, CacheEntry<unknown>>;
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
export function cacheGetAllByPrefix<T>(
  prefix: string,
): { key: string; data: T }[] {
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

// ---------------------------------------------------------------------------
// File-based cache export / import
// ---------------------------------------------------------------------------

/** Collect all cache entries into a serializable object */
function collectEntries(): Record<string, CacheEntry<unknown>> {
  const entries: Record<string, CacheEntry<unknown>> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i);
    if (!storageKey?.startsWith(KEY_PREFIX)) continue;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const entry: CacheEntry<unknown> = JSON.parse(raw);
      const key = storageKey.slice(KEY_PREFIX.length);
      entries[key] = entry;
    } catch {
      // skip malformed
    }
  }
  return entries;
}

/** Import entries into localStorage, returns number of entries imported */
function importEntries(entries: Record<string, CacheEntry<unknown>>): number {
  let count = 0;
  for (const [key, entry] of Object.entries(entries)) {
    try {
      localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
      count++;
    } catch {
      evictOldest(10);
      try {
        localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
        count++;
      } catch {
        // give up on this entry
      }
    }
  }
  return count;
}

/** Build export payload */
function buildExport(): CacheExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: collectEntries(),
  };
}

/** Download current cache as a .json file */
export function downloadCacheExport(): void {
  const data = buildExport();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `nuget-cache-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Read a .json file and import its cache entries. Returns count of imported entries. */
export async function readCacheImportFile(file: File): Promise<number> {
  const text = await file.text();
  const json: CacheExport = JSON.parse(text);
  if (json.version !== 1 || !json.entries) {
    throw new Error("Invalid cache file format");
  }
  return importEntries(json.entries);
}

/** Save current cache as the default snapshot in localStorage */
export function saveDefaultSnapshot(): void {
  const data = buildExport();
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
  } catch {
    // Snapshot too large — skip silently
  }
}

/** Load cache from the default snapshot. Returns count of restored entries, 0 if no snapshot. */
export function loadDefaultSnapshot(): number {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return 0;
    const data: CacheExport = JSON.parse(raw);
    if (data.version !== 1 || !data.entries) return 0;
    return importEntries(data.entries);
  } catch {
    return 0;
  }
}
