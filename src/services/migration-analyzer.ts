import type {
  MigrationPackage,
  VersionConflict,
  TargetFramework,
} from "@/types/migration";
import {
  searchPackages,
  getPackageVersions,
  getPackageDetails,
} from "./nuget-api";
import { cacheGet, cacheSet, getCacheServiceStats } from "./cache-service";

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
  onProgress?: (current: number, total: number) => void,
): Promise<MigrationPackage[]> {
  const visited = new Map<string, MigrationPackage>();
  const inProgress = new Set<string>();
  let processedCount = 0;
  let totalCount = packageIds.length;

  const internalPattern = internalMask
    ? new RegExp(`^${internalMask.replace(/\*/g, ".*")}`, "i")
    : null;

  async function loadPackage(
    packageId: string,
    depth: number,
    requestedVersion?: string,
  ): Promise<MigrationPackage | null> {
    const cacheKey = packageId.toLowerCase();

    // Check if already loaded - return a shared reference
    if (visited.has(cacheKey)) {
      const existing = visited.get(cacheKey)!;
      // Return a shallow reference marked as shared (no dependencies to avoid duplication)
      return {
        ...existing,
        depth,
        dependencies: [], // Don't duplicate the subtree
        isSharedReference: true,
      };
    }

    // Cycle detection
    if (inProgress.has(cacheKey)) {
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

    inProgress.add(cacheKey);

    try {
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
        // Fetch from API
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

      // Update progress
      processedCount++;
      if (onProgress) {
        onProgress(processedCount, totalCount);
      }

      // Update total count for dependencies not yet visited
      for (const dep of dependencyIds) {
        if (
          !visited.has(dep.id.toLowerCase()) &&
          !inProgress.has(dep.id.toLowerCase())
        ) {
          totalCount++;
        }
      }

      // Load each dependency recursively
      for (const dep of dependencyIds) {
        const depKey = dep.id.toLowerCase();
        if (pkg.dependencies.some((d) => d.id.toLowerCase() === depKey)) {
          continue;
        }

        const depPackage = await loadPackage(dep.id, depth + 1);
        if (depPackage) {
          pkg.dependencies.push(depPackage);
        }
      }

      return pkg;
    } finally {
      inProgress.delete(cacheKey);
    }
  }

  // Load all root packages
  const results: MigrationPackage[] = [];
  for (const packageId of packageIds) {
    const pkg = await loadPackage(packageId, 0);
    if (pkg) {
      results.push(pkg);
    }
  }

  return results;
}

/**
 * Check if a target framework is supported by the package
 */
function isFrameworkSupported(
  packageFrameworks: string[],
  targetFramework: TargetFramework,
): boolean {
  if (packageFrameworks.length === 0) {
    // No framework-specific dependencies means it's likely a portable library
    return true;
  }

  const targetVersion = parseFrameworkVersion(targetFramework);

  for (const tfm of packageFrameworks) {
    const version = parseFrameworkVersion(tfm);
    if (version === null) continue;

    // Check if target is compatible with package's supported framework
    // A package built for net6.0 can be used by net8.0, net9.0, etc.
    if (
      version.family === targetVersion?.family &&
      version.version <= (targetVersion?.version || 0)
    ) {
      return true;
    }

    // netstandard2.0/2.1 is compatible with all modern .NET
    if (tfm.startsWith("netstandard")) {
      return true;
    }
  }

  return false;
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
 * Analyze all packages for framework support
 */
export function analyzeAllPackages(
  packages: MigrationPackage[],
  targetFramework: TargetFramework,
): MigrationPackage[] {
  function analyzePackage(pkg: MigrationPackage): MigrationPackage {
    // Analyze dependencies first (bottom-up)
    const analyzedDeps = pkg.dependencies.map(analyzePackage);

    // Check if this package supports the target framework
    const supportsTarget = isFrameworkSupported(
      pkg.targetFrameworks,
      targetFramework,
    );

    // Count blocked dependencies
    const blockerCount = analyzedDeps.filter(
      (d) => d.status === "blocked",
    ).length;

    // Determine status
    let status: MigrationPackage["status"];
    if (!supportsTarget || pkg.isCyclic) {
      status = "blocked";
    } else if (blockerCount > 0) {
      status = "partial";
    } else {
      status = "ready";
    }

    return {
      ...pkg,
      dependencies: analyzedDeps,
      status,
      blockerCount,
    };
  }

  return packages.map(analyzePackage);
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
