import { create } from "zustand";
import type {
  MigrationPackage,
  VersionConflict,
  TargetFramework,
} from "@/types/migration";
import {
  searchByPrefix,
  loadDependencyTree,
  analyzeAllPackages,
  calculateMigrationOrder,
  detectVersionConflicts,
} from "@/services/migration-analyzer";

interface MigrationState {
  // Inputs
  searchPrefix: string;
  internalMask: string;
  targetFramework: TargetFramework;
  devVersionFilter: string;

  // Data
  packages: MigrationPackage[];
  loadingProgress: { current: number; total: number } | null;
  error: string | null;

  // Analysis results
  versionConflicts: VersionConflict[];
  migrationOrder: string[];

  // Actions
  setSearchPrefix: (prefix: string) => void;
  setInternalMask: (mask: string) => void;
  setTargetFramework: (tfm: TargetFramework) => void;
  setDevVersionFilter: (filter: string) => void;
  startAnalysis: () => Promise<void>;
  reset: () => void;
}

export const useMigrationStore = create<MigrationState>((set, get) => ({
  // Initial state
  searchPrefix: "",
  internalMask: "",
  targetFramework: "net10.0",
  devVersionFilter: "",
  packages: [],
  loadingProgress: null,
  error: null,
  versionConflicts: [],
  migrationOrder: [],

  // Setters
  setSearchPrefix: (prefix: string) => set({ searchPrefix: prefix }),
  setInternalMask: (mask: string) => set({ internalMask: mask }),
  setTargetFramework: (tfm: TargetFramework) => set({ targetFramework: tfm }),
  setDevVersionFilter: (filter: string) => set({ devVersionFilter: filter }),

  // Main analysis action
  startAnalysis: async () => {
    const state = get();
    const { searchPrefix, internalMask, targetFramework, devVersionFilter } =
      state;

    if (!searchPrefix) return;

    set({
      loadingProgress: { current: 0, total: 1 },
      packages: [],
      error: null,
    });

    try {
      // Step 1: Search for packages by prefix
      const packageIds = await searchByPrefix(searchPrefix);

      if (packageIds.length === 0) {
        set({
          loadingProgress: null,
          error: `No packages found matching "${searchPrefix}"`,
        });
        return;
      }

      set({ loadingProgress: { current: 0, total: packageIds.length } });

      // Step 2: Load full dependency tree
      const packages = await loadDependencyTree(
        packageIds,
        internalMask,
        devVersionFilter,
        (current, total) => {
          set({ loadingProgress: { current, total } });
        },
      );

      // Step 3: Analyze TFM support
      const analyzedPackages = analyzeAllPackages(packages, targetFramework);

      // Step 4: Sort by blockers count (heaviest packages first)
      const sortByBlockers = (pkgs: MigrationPackage[]): MigrationPackage[] => {
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

      set({
        packages: sortedPackages,
        migrationOrder,
        versionConflicts,
        loadingProgress: null,
      });
    } catch (error) {
      console.error("Analysis failed:", error);
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
      versionConflicts: [],
      migrationOrder: [],
    });
  },
}));
