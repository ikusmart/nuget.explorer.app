/** Which frameworks the project currently uses and where it's migrating to */
export interface FrameworkSelection {
  currentFrameworks: TargetFramework[];
  migrationTarget: TargetFramework;
}

/** Per-framework compatibility result for a single package */
export interface FrameworkCompatibility {
  framework: TargetFramework;
  supported: boolean;
  compatibilityMode: "direct" | "netstandard" | "portable" | "none";
}

/** When a package needs a different version for a specific framework */
export interface PerFrameworkVersion {
  framework: TargetFramework;
  version: string;
}

/** Package data for migration analysis */
export interface MigrationPackage {
  id: string;
  version: string;
  availableVersions: string[];
  isInternal: boolean;
  depth: number;
  targetFrameworks: string[];
  dependencies: MigrationPackage[];
  status: "ready" | "partial" | "blocked" | "split";
  blockerCount: number;
  migrationOrder: number;
  isCyclic?: boolean;
  /** If true, this is a reference to an already-loaded package (shared dependency) */
  isSharedReference?: boolean;
  /** Per-framework compatibility breakdown (populated in multi-TFM mode) */
  frameworkCompatibility?: FrameworkCompatibility[];
  /** Per-framework version recommendations when status is "split" */
  perFrameworkVersions?: PerFrameworkVersion[];
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
