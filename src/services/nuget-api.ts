import type {
  ServiceIndex,
  SearchResponse,
  SearchResult,
  VersionsResponse,
  PackageDetails,
  FlatDependency,
  Dependency,
  DependencyGroup,
} from "@/types/nuget";
import {
  cacheGet,
  cacheSet,
  cacheClear,
  cacheGetAllByPrefix,
  getCacheServiceStats,
  downloadCacheExport,
  readCacheImportFile,
  saveDefaultSnapshot,
  loadDefaultSnapshot,
} from "./cache-service";

let serviceIndexUrl = "https://api.nuget.org/v3/index.json";

/** Cache-only mode flag */
let cacheOnlyMode = false;

/** Check if we're in development mode */
const isDev = import.meta.env.DEV;

/** Fetch with CORS proxy in development mode */
async function proxyFetch(url: string): Promise<Response> {
  if (isDev) {
    // Use the Vite proxy to bypass CORS
    const proxyUrl = `/api/nuget-proxy?url=${encodeURIComponent(url)}`;
    return fetch(proxyUrl);
  }
  return fetch(url);
}

/** Get current service index URL */
export function getServiceIndexUrl(): string {
  return serviceIndexUrl;
}

/** Set the service index URL and clear cache only if URL actually changed */
export function setServiceIndexUrl(url: string): void {
  if (url === serviceIndexUrl) return;
  serviceIndexUrl = url;
  clearCache();
}

/** Enable or disable cache-only mode */
export function setCacheOnlyMode(enabled: boolean): void {
  cacheOnlyMode = enabled;
}

/** Get current cache-only mode state */
export function getCacheOnlyMode(): boolean {
  return cacheOnlyMode;
}

/** Validate that a URL is a valid NuGet V3 server */
export async function validateServiceIndex(
  url: string,
): Promise<{ isValid: boolean; error?: string }> {
  try {
    const response = await proxyFetch(url);
    if (!response.ok) {
      return {
        isValid: false,
        error: `Server returned ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    // Check for required NuGet V3 resources
    const resources = data.resources;
    if (!Array.isArray(resources)) {
      return { isValid: false, error: "Invalid response: no resources array" };
    }

    const hasSearch = resources.some((r: { "@type": string }) =>
      r["@type"]?.includes("SearchQueryService"),
    );
    const hasRegistration = resources.some((r: { "@type": string }) =>
      r["@type"]?.includes("RegistrationsBaseUrl"),
    );

    if (!hasSearch) {
      return { isValid: false, error: "Missing SearchQueryService resource" };
    }
    if (!hasRegistration) {
      return { isValid: false, error: "Missing RegistrationsBaseUrl resource" };
    }

    return { isValid: true };
  } catch (err) {
    return {
      isValid: false,
      error: err instanceof Error ? err.message : "Failed to validate server",
    };
  }
}

/** Service URLs discovered from index */
let serviceUrls: {
  searchQueryService?: string;
  registrationsBaseUrl?: string;
  packageBaseAddress?: string;
} = {};

/** Discover service URLs from index */
async function discoverServices(): Promise<void> {
  if (serviceUrls.searchQueryService) return;

  const cached = cacheGet<typeof serviceUrls>("serviceUrls");
  if (cached) {
    serviceUrls = cached;
    return;
  }

  if (cacheOnlyMode) return;

  const response = await proxyFetch(serviceIndexUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch service index: ${response.status}`);
  }

  const index: ServiceIndex = await response.json();

  // Find required services
  for (const resource of index.resources) {
    const type = resource["@type"];
    if (type.includes("SearchQueryService")) {
      serviceUrls.searchQueryService = resource["@id"];
    } else if (type.includes("RegistrationsBaseUrl")) {
      serviceUrls.registrationsBaseUrl = resource["@id"];
    } else if (type.includes("PackageBaseAddress")) {
      serviceUrls.packageBaseAddress = resource["@id"];
    }
  }

  cacheSet("serviceUrls", serviceUrls);
}

/** Search for packages */
export async function searchPackages(
  query: string,
  skip = 0,
  take = 20,
  includePrerelease = false,
): Promise<SearchResult[]> {
  const cacheKey = `search:${query}:${skip}:${take}:${includePrerelease}`;
  const cached = cacheGet<SearchResult[]>(cacheKey);
  if (cached) return cached;

  if (cacheOnlyMode) {
    // In cache-only mode, scan all cached search results and filter locally
    const allCached = cacheGetAllByPrefix<SearchResult[]>("search:");
    const queryLower = query.toLowerCase();
    const merged: SearchResult[] = [];
    const seen = new Set<string>();

    for (const entry of allCached) {
      for (const result of entry.data) {
        const idLower = result.id.toLowerCase();
        if (!seen.has(idLower) && idLower.includes(queryLower)) {
          seen.add(idLower);
          merged.push(result);
        }
      }
    }

    return merged.slice(skip, skip + take);
  }

  await discoverServices();

  if (!serviceUrls.searchQueryService) {
    throw new Error("Search service not available");
  }

  const url = new URL(serviceUrls.searchQueryService);
  url.searchParams.set("q", query);
  url.searchParams.set("skip", skip.toString());
  url.searchParams.set("take", take.toString());
  url.searchParams.set("prerelease", includePrerelease.toString());
  url.searchParams.set("semVerLevel", "2.0.0");

  const response = await proxyFetch(url.toString());
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  const data: SearchResponse = await response.json();
  cacheSet(cacheKey, data.data);
  return data.data;
}

/** Get all versions of a package */
export async function getPackageVersions(packageId: string): Promise<string[]> {
  const idLower = packageId.toLowerCase();
  const cacheKey = `versions:${idLower}`;
  const cached = cacheGet<string[]>(cacheKey);
  if (cached) return cached;

  if (cacheOnlyMode) return [];

  await discoverServices();

  if (!serviceUrls.packageBaseAddress) {
    throw new Error("Package base address not available");
  }

  const url = `${serviceUrls.packageBaseAddress}${idLower}/index.json`;
  const response = await proxyFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch versions: ${response.status}`);
  }

  const data: VersionsResponse = await response.json();
  // Return versions in descending order (newest first)
  const versions = data.versions.reverse();
  cacheSet(cacheKey, versions);
  return versions;
}

/** Get package details */
export async function getPackageDetails(
  packageId: string,
  version: string,
): Promise<PackageDetails> {
  const idLower = packageId.toLowerCase();
  const versionLower = version.toLowerCase();
  const cacheKey = `details:${idLower}:${versionLower}`;
  const cached = cacheGet<PackageDetails>(cacheKey);
  if (cached) return cached;

  if (cacheOnlyMode) {
    throw new Error(`Package ${packageId}@${version} not in cache`);
  }

  await discoverServices();

  if (!serviceUrls.registrationsBaseUrl) {
    throw new Error("Registration service not available");
  }

  // Step 1: Fetch registration index
  const indexUrl = `${serviceUrls.registrationsBaseUrl}${idLower}/index.json`;
  console.log("Fetching registration index:", indexUrl);
  const indexResponse = await proxyFetch(indexUrl);
  if (!indexResponse.ok) {
    throw new Error(
      `Failed to fetch registration index: ${indexResponse.status}`,
    );
  }
  const indexData = await indexResponse.json();
  console.log("Registration index:", indexData);

  // Step 2: Find the page containing our version
  let catalogEntry = null;

  for (const page of indexData.items || []) {
    // Check if this page contains our version (by range)
    const lower = page.lower?.toLowerCase();
    const upper = page.upper?.toLowerCase();

    // Simple version comparison - check if version is in range
    const versionInRange =
      !lower || !upper || (versionLower >= lower && versionLower <= upper);

    if (!versionInRange) continue;

    // If items are inlined in the page
    let pageItems = page.items;

    // If items are not inlined, fetch the page
    if (!pageItems && page["@id"]) {
      console.log("Fetching page:", page["@id"]);
      const pageResponse = await proxyFetch(page["@id"]);
      if (pageResponse.ok) {
        const pageData = await pageResponse.json();
        pageItems = pageData.items;
      }
    }

    // Find our version in the page items
    if (pageItems) {
      for (const item of pageItems) {
        const itemVersion =
          item.catalogEntry?.version?.toLowerCase() ||
          item.version?.toLowerCase();
        if (itemVersion === versionLower) {
          catalogEntry = item.catalogEntry || item;
          break;
        }
      }
    }

    if (catalogEntry) break;
  }

  // Fallback: try direct version endpoint if index approach failed
  if (!catalogEntry) {
    console.log("Fallback: trying direct version endpoint");
    const directUrl = `${serviceUrls.registrationsBaseUrl}${idLower}/${versionLower}.json`;
    const directResponse = await proxyFetch(directUrl);
    if (directResponse.ok) {
      const directData = await directResponse.json();
      catalogEntry = directData.catalogEntry || directData;

      // If catalogEntry is still a URL, fetch it
      if (typeof catalogEntry === "string") {
        const entryResponse = await proxyFetch(catalogEntry);
        if (entryResponse.ok) {
          catalogEntry = await entryResponse.json();
        }
      }
    }
  }

  if (!catalogEntry) {
    throw new Error(`Package ${packageId} version ${version} not found`);
  }

  console.log("Found catalogEntry:", catalogEntry);

  const dependencyGroups = normalizeDependencyGroups(
    catalogEntry.dependencyGroups,
  );
  console.log("Normalized dependencyGroups:", dependencyGroups);

  const details: PackageDetails = {
    id: catalogEntry.id || packageId,
    version: catalogEntry.version || version,
    description: catalogEntry.description,
    summary: catalogEntry.summary,
    title: catalogEntry.title,
    iconUrl: catalogEntry.iconUrl,
    projectUrl: catalogEntry.projectUrl,
    licenseUrl: catalogEntry.licenseUrl || catalogEntry.licenseExpression,
    authors: catalogEntry.authors
      ? typeof catalogEntry.authors === "string"
        ? catalogEntry.authors.split(",").map((a: string) => a.trim())
        : catalogEntry.authors
      : [],
    dependencyGroups,
  };

  console.log("Parsed details:", details);
  cacheSet(cacheKey, details);
  return details;
}

/**
 * Normalize dependency groups from various NuGet server formats.
 * Different servers (nuget.org, ProGet, Azure DevOps, BaGet, GitLab) may
 * use different property names or structures for dependency groups.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDependencyGroups(raw: any): DependencyGroup[] | undefined {
  if (!raw || !Array.isArray(raw)) return undefined;

  return raw.map((group) => {
    const targetFramework =
      group.targetFramework ?? group.targetFrameWork ?? group.framework;

    // Dependencies can be in "dependencies" or embedded differently
    const rawDeps = group.dependencies;
    if (!rawDeps || !Array.isArray(rawDeps)) {
      return { targetFramework, dependencies: undefined };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dependencies: Dependency[] = rawDeps
      .map((dep: any) => {
        // Some servers use different property names for the package id
        const id = dep.id ?? dep.Id ?? dep.name ?? dep.packageId;
        // Version range can be in different properties
        const range =
          dep.range ??
          dep.Range ??
          dep.versionRange ??
          dep.version ??
          undefined;
        return { id, range };
      })
      .filter((dep: Dependency) => dep.id); // filter out entries without an id

    return { targetFramework, dependencies };
  });
}

/** Extract flattened dependencies from package details */
export function flattenDependencies(details: PackageDetails): FlatDependency[] {
  const deps: FlatDependency[] = [];

  if (!details.dependencyGroups) return deps;

  for (const group of details.dependencyGroups) {
    if (!group.dependencies) continue;

    for (const dep of group.dependencies) {
      if (!dep.id) continue;
      deps.push({
        id: dep.id,
        versionRange: dep.range,
        targetFramework: group.targetFramework,
      });
    }
  }

  // Remove duplicates by id (keep first occurrence)
  const seen = new Set<string>();
  return deps.filter((d) => {
    const lower = d.id.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

/** Clear the cache */
export function clearCache(): void {
  cacheClear();
  serviceUrls = {};
}

/** Get cache stats */
export function getCacheStats(): { size: number; keys: string[] } {
  return getCacheServiceStats();
}

export {
  downloadCacheExport,
  readCacheImportFile,
  saveDefaultSnapshot,
  loadDefaultSnapshot,
};
