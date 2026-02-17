import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  MigrationPackage,
  VersionConflict,
  TargetFramework,
  FrameworkSelection,
} from "@/types/migration";
import {
  searchByPrefix,
  loadDependencyTree,
  analyzeAllPackages,
  calculateMigrationOrder,
  detectVersionConflicts,
  type LoadingProgressInfo,
} from "@/services/migration-analyzer";
import { setCacheOnlyMode, getCacheOnlyMode } from "@/services/nuget-api";

interface MigrationState {
  // Inputs
  searchPrefix: string;
  internalMask: string;
  frameworkSelection: FrameworkSelection;
  devVersionFilter: string;

  // Data
  packages: MigrationPackage[];
  loadingProgress: LoadingProgressInfo | null;
  error: string | null;
  warning: string | null;

  // Analysis results
  versionConflicts: VersionConflict[];
  migrationOrder: string[];

  // Actions
  setSearchPrefix: (prefix: string) => void;
  setInternalMask: (mask: string) => void;
  setMigrationTarget: (tfm: TargetFramework) => void;
  toggleCurrentFramework: (tfm: TargetFramework) => void;
  setDevVersionFilter: (filter: string) => void;
  startAnalysis: () => Promise<void>;
  reset: () => void;
}

export const useMigrationStore = create<MigrationState>()(
  persist(
    (set, get) => ({
      // Initial state
      searchPrefix: "",
      internalMask: "",
      frameworkSelection: {
        currentFrameworks: [],
        migrationTarget: "net10.0",
      },
      devVersionFilter: "",
      packages: [],
      loadingProgress: null,
      error: null,
      warning: null,
      versionConflicts: [],
      migrationOrder: [],

      // Setters
      setSearchPrefix: (prefix: string) => set({ searchPrefix: prefix }),
      setInternalMask: (mask: string) => set({ internalMask: mask }),
      setMigrationTarget: (tfm: TargetFramework) =>
        set((state) => ({
          frameworkSelection: {
            ...state.frameworkSelection,
            migrationTarget: tfm,
            // Remove from currentFrameworks if it was selected there
            currentFrameworks:
              state.frameworkSelection.currentFrameworks.filter(
                (f) => f !== tfm,
              ),
          },
        })),
      toggleCurrentFramework: (tfm: TargetFramework) =>
        set((state) => {
          const current = state.frameworkSelection.currentFrameworks;
          const has = current.includes(tfm);
          return {
            frameworkSelection: {
              ...state.frameworkSelection,
              currentFrameworks: has
                ? current.filter((f) => f !== tfm)
                : [...current, tfm],
            },
          };
        }),
      setDevVersionFilter: (filter: string) =>
        set({ devVersionFilter: filter }),

      // Main analysis action
      startAnalysis: async () => {
        const state = get();
        const {
          searchPrefix,
          internalMask,
          frameworkSelection,
          devVersionFilter,
        } = state;

        if (!searchPrefix) return;

        const wasCacheOnly = getCacheOnlyMode();

        set({
          loadingProgress: {
            current: 0,
            total: 0,
            activePackages: [],
            concurrency: 0,
            phase: "loading",
          },
          packages: [],
          error: null,
          warning: null,
        });

        try {
          // Step 1: Search for packages by prefix
          const packageIds = await searchByPrefix(searchPrefix);

          if (packageIds.length === 0) {
            // cacheOnlyMode may have been auto-enabled by discoverServices()
            const offlineFallback = !wasCacheOnly && getCacheOnlyMode();
            set({
              loadingProgress: null,
              error: offlineFallback
                ? `Server unreachable and no cached data for "${searchPrefix}"`
                : `No packages found matching "${searchPrefix}"`,
            });
            if (offlineFallback) setCacheOnlyMode(false);
            return;
          }

          set({
            loadingProgress: {
              current: 0,
              total: 0,
              activePackages: [],
              concurrency: 0,
              phase: "loading",
            },
          });

          // Step 2: Load full dependency tree (parallel with semaphore)
          const packages = await loadDependencyTree(
            packageIds,
            internalMask,
            devVersionFilter,
            (info) => {
              set({ loadingProgress: info });
            },
          );

          // Step 3: Analyze TFM support (now async, supports multi-framework)
          const analyzedPackages = await analyzeAllPackages(
            packages,
            frameworkSelection.migrationTarget,
            frameworkSelection.currentFrameworks,
            (info) => {
              set({ loadingProgress: info });
            },
          );

          // Step 4: Sort by blockers count (heaviest packages first)
          const sortByBlockers = (
            pkgs: MigrationPackage[],
          ): MigrationPackage[] => {
            return [...pkgs]
              .sort((a, b) => b.blockerCount - a.blockerCount)
              .map((pkg) => ({
                ...pkg,
                dependencies: sortByBlockers(pkg.dependencies),
              }));
          };
          const sortedPackages = sortByBlockers(analyzedPackages);

          // Step 5: Calculate migration order
          const migrationOrder = calculateMigrationOrder(sortedPackages);

          // Step 6: Detect version conflicts
          const versionConflicts = detectVersionConflicts(sortedPackages);

          const fellBackToCache = !wasCacheOnly && getCacheOnlyMode();

          set({
            packages: sortedPackages,
            migrationOrder,
            versionConflicts,
            loadingProgress: null,
            warning: fellBackToCache
              ? "Server unreachable — showing cached data. Some packages may be missing or outdated."
              : null,
          });

          // Restore original mode so next analysis can try the server again
          if (fellBackToCache) setCacheOnlyMode(false);
        } catch (error) {
          console.error("Analysis failed:", error);
          // Restore original mode on failure
          if (!wasCacheOnly && getCacheOnlyMode()) setCacheOnlyMode(false);
          set({
            loadingProgress: null,
            error: error instanceof Error ? error.message : "Analysis failed",
          });
        }
      },

      reset: () => {
        set({
          searchPrefix: "",
          internalMask: "",
          devVersionFilter: "",
          packages: [],
          loadingProgress: null,
          error: null,
          warning: null,
          versionConflicts: [],
          migrationOrder: [],
        });
      },
    }),
    {
      name: "nuget-migration-storage",
      version: 1,
      migrate: (persisted: unknown) => {
        const data = persisted as Record<string, unknown>;
        // Migrate from old single targetFramework to new frameworkSelection
        if (data.targetFramework && !data.frameworkSelection) {
          data.frameworkSelection = {
            currentFrameworks: [],
            migrationTarget: data.targetFramework,
          };
          delete data.targetFramework;
        }
        return data;
      },
      partialize: (state) => ({
        searchPrefix: state.searchPrefix,
        internalMask: state.internalMask,
        frameworkSelection: state.frameworkSelection,
        devVersionFilter: state.devVersionFilter,
      }),
    },
  ),
);
