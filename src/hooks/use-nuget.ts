import { useState, useCallback } from "react";
import type {
  SearchResult,
  PackageDetails,
  FlatDependency,
} from "@/types/nuget";
import {
  searchPackages,
  getPackageVersions,
  getPackageDetails,
  flattenDependencies,
} from "@/services/nuget-api";

interface UseSearchResult {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  search: (query: string, includePrerelease?: boolean) => Promise<void>;
  clear: () => void;
}

export function useSearch(): UseSearchResult {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (query: string, includePrerelease = false) => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await searchPackages(query, 0, 20, includePrerelease);
        setResults(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, loading, error, search, clear };
}

interface UseVersionsResult {
  versions: string[];
  loading: boolean;
  error: string | null;
  fetchVersions: (packageId: string) => Promise<void>;
  clear: () => void;
}

export function useVersions(): UseVersionsResult {
  const [versions, setVersions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVersions = useCallback(async (packageId: string) => {
    setLoading(true);
    setError(null);

    try {
      const data = await getPackageVersions(packageId);
      setVersions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch versions");
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setVersions([]);
    setError(null);
  }, []);

  return { versions, loading, error, fetchVersions, clear };
}

interface UsePackageDetailsResult {
  details: PackageDetails | null;
  dependencies: FlatDependency[];
  loading: boolean;
  error: string | null;
  fetchDetails: (packageId: string, version: string) => Promise<void>;
  clear: () => void;
}

export function usePackageDetails(): UsePackageDetailsResult {
  const [details, setDetails] = useState<PackageDetails | null>(null);
  const [dependencies, setDependencies] = useState<FlatDependency[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(
    async (packageId: string, version: string) => {
      setLoading(true);
      setError(null);

      try {
        const data = await getPackageDetails(packageId, version);
        setDetails(data);
        setDependencies(flattenDependencies(data));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch details",
        );
        setDetails(null);
        setDependencies([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const clear = useCallback(() => {
    setDetails(null);
    setDependencies([]);
    setError(null);
  }, []);

  return { details, dependencies, loading, error, fetchDetails, clear };
}
