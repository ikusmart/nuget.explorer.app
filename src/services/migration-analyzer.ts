import type {
  MigrationPackage,
  VersionConflict,
  TargetFramework,
  FrameworkCompatibility,
  PerFrameworkVersion,
} from "@/types/migration";
import {
  searchPackages,
  getPackageVersions,
  getPackageDetails,
} from "./nuget-api";
import { cacheGet, cacheSet, getCacheServiceStats } from "./cache-service";

/** Progress info reported during dependency tree loading and analysis */
export interface LoadingProgressInfo {
  current: number;
  total: number;
  activePackages: string[];
  concurrency: number;
  phase: "loading" | "analyzing";
}

/** Simple concurrency limiter for parallel HTTP requests */
function createSemaphore(concurrency: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (running < concurrency) {
      running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => queue.push(resolve));
  }

  function release(): void {
    running--;
    if (queue.length > 0) {
      running++;
      queue.shift()!();
    }
  }

  return { acquire, release, getRunning: () => running };
}

/**
 * Cache for loaded package data
 * Key: packageId (lowercase), Value: package metadata (without dependencies)
 */
interface CachedPackageData {
  id: string;
  version: string;
  availableVersions: string[];
  targetFrameworks: string[];
  dependencyIds: Array<{ id: string; version?: string }>;
}

/** Clear the migration package cache (no-op — shared cache cleared via nuget-api) */
export function clearMigrationCache(): void {
  // Cache is shared via cache-service, cleared from nuget-api.clearCache()
}

/** Get cache stats */
export function getMigrationCacheStats(): { size: number; keys: string[] } {
  return getCacheServiceStats();
}

/**
 * Search for packages by prefix
 * Returns all package IDs that start with the given prefix
 */
export async function searchByPrefix(prefix: string): Promise<string[]> {
  const prefixCacheKey = `migration-prefix:${prefix.toLowerCase()}`;
  const cached = cacheGet<string[]>(prefixCacheKey);
  if (cached) return cached;

  const results: string[] = [];
  const normalizedPrefix = prefix.toLowerCase();
  let skip = 0;
  const take = 100;
  let hasMore = true;

  while (hasMore) {
    const packages = await searchPackages(prefix, skip, take, false);

    for (const pkg of packages) {
      if (pkg.id.toLowerCase().startsWith(normalizedPrefix)) {
        results.push(pkg.id);
      }
    }

    // If we got fewer results than requested, we've reached the end
    if (packages.length < take) {
      hasMore = false;
    } else {
      skip += take;
    }

    // Safety limit to prevent infinite loops
    if (skip > 1000) {
      hasMore = false;
    }
  }

  cacheSet(prefixCacheKey, results);
  return results;
}

/**
 * Load full dependency tree for packages
 * Handles cycle detection and tracks loading progress
 */
export async function loadDependencyTree(
  packageIds: string[],
  internalMask: string,
  devVersionFilter: string,
  onProgress?: (info: LoadingProgressInfo) => void,
): Promise<MigrationPackage[]> {
  const visited = new Map<string, MigrationPackage>();
  const loadingPromises = new Map<string, Promise<MigrationPackage | null>>();
  let processedCount = 0;
  let totalCount = 0;

  const semaphore = createSemaphore(6);
  const activePackages = new Set<string>();

  const internalPattern = internalMask
    ? new RegExp(`^${internalMask.replace(/\*/g, ".*")}`, "i")
    : null;

  function reportProgress() {
    if (onProgress) {
      onProgress({
        current: processedCount,
        total: totalCount,
        activePackages: [...activePackages],
        concurrency: semaphore.getRunning(),
        phase: "loading",
      });
    }
  }

  async function loadPackage(
    packageId: string,
    depth: number,
    requestedVersion?: string,
    ancestors?: Set<string>,
  ): Promise<MigrationPackage | null> {
    const cacheKey = packageId.toLowerCase();

    // Already fully loaded — return shared reference
    if (visited.has(cacheKey)) {
      const existing = visited.get(cacheKey)!;
      return {
        ...existing,
        depth,
        dependencies: [],
        isSharedReference: true,
      };
    }

    // Cycle detection — this package is a direct ancestor in our call chain
    if (ancestors?.has(cacheKey)) {
      return {
        id: packageId,
        version: requestedVersion || "unknown",
        availableVersions: [],
        isInternal: internalPattern?.test(packageId) || false,
        depth,
        targetFrameworks: [],
        dependencies: [],
        status: "blocked",
        blockerCount: 0,
        migrationOrder: -1,
        isCyclic: true,
      };
    }

    // Currently loading by another parallel branch — wait for it
    const inflight = loadingPromises.get(cacheKey);
    if (inflight) {
      const result = await inflight;
      if (result) {
        return { ...result, depth, dependencies: [], isSharedReference: true };
      }
      return null;
    }

    // Start loading — register promise for dedup
    const myAncestors = new Set(ancestors);
    myAncestors.add(cacheKey);

    const promise = loadPackageImpl(
      packageId,
      cacheKey,
      depth,
      requestedVersion,
      myAncestors,
    );
    loadingPromises.set(cacheKey, promise);
    totalCount++;
    reportProgress();
    try {
      return await promise;
    } finally {
      loadingPromises.delete(cacheKey);
    }
  }

  async function loadPackageImpl(
    packageId: string,
    cacheKey: string,
    depth: number,
    requestedVersion: string | undefined,
    ancestors: Set<string>,
  ): Promise<MigrationPackage | null> {
    const cachedData = cacheGet<CachedPackageData>(`migration:${cacheKey}`);
    const useCache = !!cachedData;

    let version: string;
    let versions: string[];
    let targetFrameworks: string[];
    let dependencyIds: Array<{ id: string }>;

    if (useCache) {
      // Use cached metadata
      version = cachedData.version;
      versions = cachedData.availableVersions;
      targetFrameworks = cachedData.targetFrameworks;
      dependencyIds = cachedData.dependencyIds;
    } else {
      // Fetch from API — acquire semaphore to limit concurrency
      await semaphore.acquire();
      activePackages.add(packageId);
      reportProgress();

      try {
        try {
          versions = await getPackageVersions(packageId);
        } catch {
          versions = requestedVersion ? [requestedVersion] : [];
        }

        // Pick version: requested > dev-filter match > latest stable > latest any
        if (requestedVersion) {
          version = requestedVersion;
        } else {
          const devMatch =
            devVersionFilter &&
            versions.find(
              (v) =>
                v.includes("-") &&
                v.toLowerCase().includes(devVersionFilter.toLowerCase()),
            );
          const latestStable = versions.find((v) => !v.includes("-"));
          version = devMatch || latestStable || versions[0] || "unknown";
        }
        targetFrameworks = [];
        dependencyIds = [];

        let dependencyGroups: Array<{
          targetFramework?: string;
          dependencies?: Array<{ id: string; range?: string }>;
        }> = [];

        try {
          const details = await getPackageDetails(packageId, version);
          dependencyGroups = details.dependencyGroups || [];

          targetFrameworks = dependencyGroups
            .map((g) => g.targetFramework)
            .filter((tfm): tfm is string => !!tfm);
          targetFrameworks = [...new Set(targetFrameworks)];
        } catch (error) {
          console.warn(
            `Failed to get details for ${packageId}@${version}:`,
            error,
          );
        }

        // Collect unique dependency IDs
        for (const group of dependencyGroups) {
          if (!group.dependencies) continue;
          for (const dep of group.dependencies) {
            if (
              !dependencyIds.some(
                (d) => d.id.toLowerCase() === dep.id.toLowerCase(),
              )
            ) {
              dependencyIds.push({ id: dep.id });
            }
          }
        }

        // Save to cache
        cacheSet(`migration:${cacheKey}`, {
          id: packageId,
          version,
          availableVersions: versions.slice(0, 10),
          targetFrameworks,
          dependencyIds,
        } satisfies CachedPackageData);
      } finally {
        activePackages.delete(packageId);
        semaphore.release();
      }
    }

    // Create package entry
    const pkg: MigrationPackage = {
      id: packageId,
      version,
      availableVersions: versions.slice(0, 10),
      isInternal: internalPattern?.test(packageId) || false,
      depth,
      targetFrameworks,
      dependencies: [],
      status: "ready",
      blockerCount: 0,
      migrationOrder: -1,
    };

    visited.set(cacheKey, pkg);

    const uniqueDeps = dependencyIds.filter(
      (dep) =>
        !pkg.dependencies.some(
          (d) => d.id.toLowerCase() === dep.id.toLowerCase(),
        ),
    );

    // Start dep loading — .map() calls each loadPackage synchronously
    // up to its first await, so all deps self-register in totalCount
    // BEFORE we increment processedCount below
    const depPromise = Promise.all(
      uniqueDeps.map((dep) =>
        loadPackage(dep.id, depth + 1, undefined, ancestors),
      ),
    );

    // NOW count this package as processed — deps already registered
    processedCount++;
    reportProgress();

    const depResults = await depPromise;
    for (const depPkg of depResults) {
      if (depPkg) pkg.dependencies.push(depPkg);
    }

    return pkg;
  }

  // Load all root packages in parallel — semaphore limits HTTP concurrency
  const rootResults = await Promise.all(
    packageIds.map((id) => loadPackage(id, 0)),
  );
  const results: MigrationPackage[] = [];
  for (const pkg of rootResults) {
    if (pkg) results.push(pkg);
  }

  return results;
}

/**
 * Check if a package TFM is in the direct runtime compatibility chain for a target.
 * The NuGet precedence chain:
 *   net10.0 > net9.0 > ... > net5.0 > netcoreapp3.1 > ... > netcoreapp1.0
 * netcoreapp is the old name for the same runtime, renamed to net5.0+.
 */
function isInDirectChain(
  pkgTfm: { family: string; version: number },
  target: { family: string; version: number },
): boolean {
  if (pkgTfm.family === target.family && pkgTfm.version <= target.version) {
    return true;
  }
  // Cross-family: netcoreapp is compatible with net5.0+ (same runtime lineage)
  if (
    pkgTfm.family === "netcoreapp" &&
    target.family === "net" &&
    target.version >= 5
  ) {
    return true;
  }
  return false;
}

/**
 * Compare two TFM matches for precedence (higher = closer to target = better).
 * net* versions are always higher precedence than netcoreapp*.
 */
function comparePrecedence(
  a: { tfm: string; version: number },
  b: { tfm: string; version: number },
): number {
  const aFamily = a.tfm.startsWith("netcoreapp") ? "netcoreapp" : "net";
  const bFamily = b.tfm.startsWith("netcoreapp") ? "netcoreapp" : "net";
  if (aFamily !== bFamily) return aFamily === "net" ? 1 : -1;
  return a.version - b.version;
}

/**
 * Detailed framework compatibility check.
 * Scans ALL package TFMs to find the best match, applying NuGet precedence:
 *   1. Direct (net* or netcoreapp* in the target's fallback chain)
 *   2. netstandard (any version — net5.0+ implements netstandard2.1)
 *   3. none
 */
function isFrameworkSupportedDetailed(
  packageFrameworks: string[],
  targetFramework: TargetFramework,
): FrameworkCompatibility {
  if (packageFrameworks.length === 0) {
    return {
      framework: targetFramework,
      supported: true,
      compatibilityMode: "portable",
    };
  }

  const target = parseFrameworkVersion(targetFramework);
  if (!target) {
    return {
      framework: targetFramework,
      supported: false,
      compatibilityMode: "none",
    };
  }

  let bestDirect: { tfm: string; version: number } | null = null;
  let hasNetstandard = false;

  for (const tfm of packageFrameworks) {
    const parsed = parseFrameworkVersion(tfm);
    if (!parsed) continue;

    if (parsed.family === "netstandard") {
      // All netstandard versions are compatible with net5.0+
      if (target.family === "net" || target.family === "netcoreapp") {
        hasNetstandard = true;
      }
      continue;
    }

    if (isInDirectChain(parsed, target)) {
      const candidate = { tfm, version: parsed.version };
      if (!bestDirect || comparePrecedence(candidate, bestDirect) > 0) {
        bestDirect = candidate;
      }
    }
  }

  // Direct takes priority over netstandard
  if (bestDirect) {
    return {
      framework: targetFramework,
      supported: true,
      compatibilityMode: "direct",
    };
  }
  if (hasNetstandard) {
    return {
      framework: targetFramework,
      supported: true,
      compatibilityMode: "netstandard",
    };
  }

  return {
    framework: targetFramework,
    supported: false,
    compatibilityMode: "none",
  };
}

/**
 * Simple boolean check — thin wrapper over isFrameworkSupportedDetailed.
 */
function isFrameworkSupported(
  packageFrameworks: string[],
  targetFramework: TargetFramework,
): boolean {
  return isFrameworkSupportedDetailed(packageFrameworks, targetFramework)
    .supported;
}

/**
 * For a split package, find the newest version that supports a given framework.
 * Iterates available versions (already limited to 10 in cache) newest-to-oldest.
 */
async function findCompatibleVersionForFramework(
  packageId: string,
  availableVersions: string[],
  targetFramework: TargetFramework,
): Promise<{ version: string; frameworks: string[] } | null> {
  for (const version of availableVersions) {
    try {
      const details = await getPackageDetails(packageId, version);
      const frameworks = (details.dependencyGroups || [])
        .map((g) => g.targetFramework)
        .filter((tfm): tfm is string => !!tfm);

      if (isFrameworkSupported(frameworks, targetFramework)) {
        return { version, frameworks };
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Parse framework version from TFM string
 */
function parseFrameworkVersion(
  tfm: string,
): { family: string; version: number } | null {
  // net6.0, net7.0, net8.0, net9.0, net10.0
  const netMatch = tfm.match(/^net(\d+)\.(\d+)$/);
  if (netMatch) {
    return {
      family: "net",
      version: parseInt(netMatch[1], 10),
    };
  }

  // netcoreapp3.1, netcoreapp2.1, etc.
  const coreMatch = tfm.match(/^netcoreapp(\d+)\.(\d+)$/);
  if (coreMatch) {
    return {
      family: "netcoreapp",
      version: parseInt(coreMatch[1], 10),
    };
  }

  // netstandard2.0, netstandard2.1
  const stdMatch = tfm.match(/^netstandard(\d+)\.(\d+)$/);
  if (stdMatch) {
    return {
      family: "netstandard",
      version: parseInt(stdMatch[1], 10) * 10 + parseInt(stdMatch[2], 10),
    };
  }

  return null;
}

/**
 * Analyze all packages for framework support.
 * When currentFrameworks is provided, checks compatibility across ALL frameworks
 * and detects "split" packages that need different versions per TFM.
 */
export async function analyzeAllPackages(
  packages: MigrationPackage[],
  targetFramework: TargetFramework,
  currentFrameworks?: TargetFramework[],
  onProgress?: (info: LoadingProgressInfo) => void,
): Promise<MigrationPackage[]> {
  const allFrameworks = [
    ...new Set([targetFramework, ...(currentFrameworks || [])]),
  ];
  const isMultiTfm = allFrameworks.length > 1;

  // Count unique packages in tree for progress reporting
  const uniqueIds = new Set<string>();
  function countPackages(pkgs: MigrationPackage[]) {
    for (const p of pkgs) {
      const key = p.id.toLowerCase();
      if (!uniqueIds.has(key)) {
        uniqueIds.add(key);
        countPackages(p.dependencies);
      }
    }
  }
  countPackages(packages);

  let analyzed = 0;
  const analyzeCache = new Map<string, Promise<MigrationPackage>>();

  function reportAnalyzeProgress() {
    onProgress?.({
      current: analyzed,
      total: uniqueIds.size,
      activePackages: [],
      concurrency: 0,
      phase: "analyzing",
    });
  }

  async function analyzePackage(
    pkg: MigrationPackage,
  ): Promise<MigrationPackage> {
    const key = pkg.id.toLowerCase();
    const existing = analyzeCache.get(key);
    if (existing) {
      const cached = await existing;
      return {
        ...cached,
        depth: pkg.depth,
        dependencies: [],
        isSharedReference: true,
      };
    }

    const promise = analyzePackageImpl(pkg);
    analyzeCache.set(key, promise);
    return promise;
  }

  async function analyzePackageImpl(
    pkg: MigrationPackage,
  ): Promise<MigrationPackage> {
    // Analyze dependencies first (bottom-up)
    const analyzedDeps = await Promise.all(
      pkg.dependencies.map(analyzePackage),
    );

    // Count blocked dependencies
    const blockerCount = analyzedDeps.filter(
      (d) => d.status === "blocked",
    ).length;

    if (pkg.isCyclic) {
      analyzed++;
      reportAnalyzeProgress();
      return {
        ...pkg,
        dependencies: analyzedDeps,
        status: "blocked",
        blockerCount,
      };
    }

    // Check compatibility for each required framework
    const frameworkCompatibility = allFrameworks.map((fw) =>
      isFrameworkSupportedDetailed(pkg.targetFrameworks, fw),
    );

    const allSupported = frameworkCompatibility.every((fc) => fc.supported);
    const noneSupported = frameworkCompatibility.every((fc) => !fc.supported);
    const someSupported = !allSupported && !noneSupported;

    let status: MigrationPackage["status"];
    let perFrameworkVersions: PerFrameworkVersion[] | undefined;

    if (noneSupported) {
      status = "blocked";
    } else if (allSupported) {
      status = blockerCount > 0 ? "partial" : "ready";
    } else if (someSupported && isMultiTfm) {
      // Some frameworks supported, some not — try to find versions for unsupported ones
      const unsupported = frameworkCompatibility.filter((fc) => !fc.supported);
      const supported = frameworkCompatibility.filter((fc) => fc.supported);

      const versions: PerFrameworkVersion[] = [];

      // Add current version for supported frameworks
      for (const fc of supported) {
        versions.push({ framework: fc.framework, version: pkg.version });
      }

      // Search older versions for unsupported frameworks
      let allFound = true;
      for (const fc of unsupported) {
        const found = await findCompatibleVersionForFramework(
          pkg.id,
          pkg.availableVersions,
          fc.framework,
        );
        if (found) {
          versions.push({ framework: fc.framework, version: found.version });
        } else {
          allFound = false;
          break;
        }
      }

      if (allFound) {
        status = "split";
        perFrameworkVersions = versions;
      } else {
        status = "blocked";
      }
    } else {
      // Single-TFM mode, not supported
      status = "blocked";
    }

    analyzed++;
    reportAnalyzeProgress();

    return {
      ...pkg,
      dependencies: analyzedDeps,
      status,
      blockerCount,
      frameworkCompatibility,
      perFrameworkVersions,
    };
  }

  reportAnalyzeProgress();
  const results = await Promise.all(packages.map(analyzePackage));
  return results;
}

/**
 * Calculate migration order using topological sort
 * Returns package IDs in order they should be migrated (dependencies first)
 */
export function calculateMigrationOrder(
  packages: MigrationPackage[],
): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  // Build a map for quick lookup
  const packageMap = new Map<string, MigrationPackage>();
  function collectPackages(pkgs: MigrationPackage[]) {
    for (const pkg of pkgs) {
      const key = pkg.id.toLowerCase();
      if (!packageMap.has(key)) {
        packageMap.set(key, pkg);
        collectPackages(pkg.dependencies);
      }
    }
  }
  collectPackages(packages);

  function visit(pkg: MigrationPackage) {
    const key = pkg.id.toLowerCase();

    if (visited.has(key)) return;
    if (visiting.has(key)) return; // Cycle detected

    visiting.add(key);

    // Visit dependencies first
    for (const dep of pkg.dependencies) {
      visit(dep);
    }

    visiting.delete(key);
    visited.add(key);
    order.push(pkg.id);
  }

  // Visit all packages
  for (const pkg of packages) {
    visit(pkg);
  }

  // Assign migration order to packages
  function assignOrder(pkgs: MigrationPackage[]) {
    for (const pkg of pkgs) {
      const idx = order.indexOf(pkg.id);
      if (idx !== -1) {
        pkg.migrationOrder = idx + 1;
      }
      assignOrder(pkg.dependencies);
    }
  }
  assignOrder(packages);

  return order;
}

/**
 * Detect version conflicts (diamond dependencies)
 * When multiple packages request different versions of the same dependency
 */
export function detectVersionConflicts(
  packages: MigrationPackage[],
): VersionConflict[] {
  const versionRequests = new Map<
    string,
    Array<{ by: string; version: string }>
  >();

  function collectVersions(pkg: MigrationPackage) {
    for (const dep of pkg.dependencies) {
      const key = dep.id.toLowerCase();

      if (!versionRequests.has(key)) {
        versionRequests.set(key, []);
      }

      versionRequests.get(key)!.push({
        by: pkg.id,
        version: dep.version,
      });

      // Recursively collect from dependencies
      collectVersions(dep);
    }
  }

  // Collect all version requests
  for (const pkg of packages) {
    collectVersions(pkg);
  }

  // Find conflicts (multiple different versions requested)
  const conflicts: VersionConflict[] = [];

  for (const [packageId, requests] of versionRequests) {
    const uniqueVersions = new Set(requests.map((r) => r.version));

    if (uniqueVersions.size > 1) {
      conflicts.push({
        packageId,
        requestedVersions: requests,
      });
    }
  }

  return conflicts;
}
