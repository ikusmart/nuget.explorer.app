/** Package data for migration analysis */
export interface MigrationPackage {
  id: string;
  version: string;
  availableVersions: string[];
  isInternal: boolean;
  depth: number;
  targetFrameworks: string[];
  dependencies: MigrationPackage[];
  status: "ready" | "partial" | "blocked";
  blockerCount: number;
  migrationOrder: number;
  isCyclic?: boolean;
  /** If true, this is a reference to an already-loaded package (shared dependency) */
  isSharedReference?: boolean;
}

/** Version conflict between packages */
export interface VersionConflict {
  packageId: string;
  requestedVersions: Array<{
    by: string;
    version: string;
  }>;
}

/** Flat representation for table display */
export interface FlatMigrationPackage extends Omit<
  MigrationPackage,
  "dependencies"
> {
  parentId: string | null;
  hasChildren: boolean;
}

/** Target framework options */
export const TARGET_FRAMEWORKS = [
  { value: "net10.0", label: ".NET 10" },
  { value: "net9.0", label: ".NET 9" },
  { value: "net8.0", label: ".NET 8" },
  { value: "net7.0", label: ".NET 7" },
  { value: "net6.0", label: ".NET 6" },
] as const;

export type TargetFramework = (typeof TARGET_FRAMEWORKS)[number]["value"];
