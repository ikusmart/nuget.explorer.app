import { useMemo } from "react";
import { useMigrationStore } from "@/stores/migration-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download } from "lucide-react";
import type {
  MigrationPackage,
  FrameworkCompatibility,
  PerFrameworkVersion,
} from "@/types/migration";

interface DependencyInfo {
  id: string;
  version: string;
  latestVersion: string;
  status: "ready" | "partial" | "blocked" | "split";
  targetFrameworks: string[];
  isCyclic?: boolean;
  frameworkCompatibility?: FrameworkCompatibility[];
  perFrameworkVersions?: PerFrameworkVersion[];
}

interface RootPackageView {
  id: string;
  version: string;
  latestVersion: string;
  targetFrameworks: string[];
  status: "ready" | "partial" | "blocked" | "split";
  blockerCount: number;
  internalDependencies: DependencyInfo[];
  externalDependencies: DependencyInfo[];
  frameworkCompatibility?: FrameworkCompatibility[];
  perFrameworkVersions?: PerFrameworkVersion[];
}

interface MigrationStage {
  stage: number;
  packages: RootPackageView[];
}

function pickVersion(pkg: MigrationPackage, devFilter: string): string {
  if (devFilter) {
    const dev = pkg.availableVersions.find(
      (v) =>
        v.includes("-") && v.toLowerCase().includes(devFilter.toLowerCase()),
    );
    if (dev) return dev;
  }
  const stable = pkg.availableVersions.find((v) => !v.includes("-"));
  return stable || pkg.availableVersions[0] || pkg.version;
}

const statusEmoji = (status: "ready" | "partial" | "blocked" | "split") =>
  status === "ready"
    ? "🟢"
    : status === "partial"
      ? "🟡"
      : status === "split"
        ? "🔵"
        : "🔴";

function formatVersion(current: string, latest: string): string {
  return current === latest ? latest : `${current} -> ${latest}`;
}

export function MigrationRoadmap() {
  const packages = useMigrationStore((s) => s.packages);
  const frameworkSelection = useMigrationStore((s) => s.frameworkSelection);
  const devVersionFilter = useMigrationStore((s) => s.devVersionFilter);

  // Build per-package views with DIRECT dependencies only, grouped into matryoshka stages
  const stages = useMemo(() => {
    const rootIds = new Set(packages.map((p) => p.id.toLowerCase()));

    const toDependencyInfo = (d: MigrationPackage): DependencyInfo => ({
      id: d.id,
      version: d.version,
      latestVersion: pickVersion(d, devVersionFilter),
      status: d.status,
      targetFrameworks: d.targetFrameworks,
      isCyclic: d.isCyclic,
      frameworkCompatibility: d.frameworkCompatibility,
      perFrameworkVersions: d.perFrameworkVersions,
    });

    const views = packages.map((root) => {
      // All direct dependencies (including shared references — they are still
      // real dependencies of this package, just already visited in the tree)
      const directDeps = root.dependencies;

      return {
        id: root.id,
        version: root.version,
        latestVersion: pickVersion(root, devVersionFilter),
        targetFrameworks: root.targetFrameworks,
        status: root.status,
        blockerCount: root.blockerCount,
        internalDependencies: directDeps
          .filter((d) => d.isInternal)
          .sort((a, b) => a.migrationOrder - b.migrationOrder)
          .map(toDependencyInfo),
        externalDependencies: directDeps
          .filter((d) => !d.isInternal)
          .sort((a, b) => a.migrationOrder - b.migrationOrder)
          .map(toDependencyInfo),
        frameworkCompatibility: root.frameworkCompatibility,
        perFrameworkVersions: root.perFrameworkVersions,
      } satisfies RootPackageView;
    });

    // Build cross-dependency map among root packages using ALL transitive deps
    // (not just direct) so that stage ordering is correct.
    // E.g. if A -> B -> C (all root), A must be staged after both B and C.
    const depsByRoot = new Map<string, Set<string>>();
    for (const pkg of packages) {
      const rootDeps = new Set<string>();

      function collectRootDeps(p: MigrationPackage) {
        for (const dep of p.dependencies) {
          const key = dep.id.toLowerCase();
          if (rootIds.has(key)) {
            rootDeps.add(key);
          }
          if (!dep.isSharedReference) {
            collectRootDeps(dep);
          }
        }
      }

      collectRootDeps(pkg);
      // Remove self-reference
      rootDeps.delete(pkg.id.toLowerCase());
      depsByRoot.set(pkg.id.toLowerCase(), rootDeps);
    }

    // Kahn's algorithm: iteratively pick packages whose root-level deps are all placed
    const result: MigrationStage[] = [];
    const placed = new Set<string>();
    const remaining = new Set(views.map((v) => v.id.toLowerCase()));
    let stageNum = 1;

    while (remaining.size > 0) {
      const batch: RootPackageView[] = [];
      for (const view of views) {
        const key = view.id.toLowerCase();
        if (!remaining.has(key)) continue;
        const deps = depsByRoot.get(key)!;
        if ([...deps].every((d) => placed.has(d))) {
          batch.push(view);
        }
      }

      if (batch.length === 0) {
        // Circular dependencies — add remaining as final stage
        const circular: RootPackageView[] = [];
        for (const view of views) {
          if (remaining.has(view.id.toLowerCase())) {
            circular.push(view);
            remaining.delete(view.id.toLowerCase());
          }
        }
        circular.sort((a, b) => {
          const splitA = a.status === "split" ? 1 : 0;
          const splitB = b.status === "split" ? 1 : 0;
          if (splitA !== splitB) return splitA - splitB;
          return (
            a.internalDependencies.length +
            a.externalDependencies.length -
            (b.internalDependencies.length + b.externalDependencies.length)
          );
        });
        result.push({ stage: stageNum, packages: circular });
        break;
      }

      batch.sort((a, b) => {
        const splitA = a.status === "split" ? 1 : 0;
        const splitB = b.status === "split" ? 1 : 0;
        if (splitA !== splitB) return splitA - splitB;
        return (
          a.internalDependencies.length +
          a.externalDependencies.length -
          (b.internalDependencies.length + b.externalDependencies.length)
        );
      });

      result.push({ stage: stageNum, packages: batch });
      stageNum++;

      for (const view of batch) {
        placed.add(view.id.toLowerCase());
        remaining.delete(view.id.toLowerCase());
      }
    }

    return result;
  }, [packages, devVersionFilter]);

  // Status counts across all unique packages
  const statusCounts = useMemo(() => {
    const counts = { ready: 0, partial: 0, blocked: 0, split: 0, total: 0 };
    const seen = new Set<string>();

    function count(pkgs: MigrationPackage[]) {
      for (const pkg of pkgs) {
        const key = pkg.id.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          counts[pkg.status]++;
          counts.total++;
        }
        count(pkg.dependencies);
      }
    }
    count(packages);
    return counts;
  }, [packages]);

  // Generate downloadable plan as clean markdown with checklists
  const downloadPlan = () => {
    const lines: string[] = [];

    const icon = (s: "ready" | "partial" | "blocked" | "split") =>
      s === "ready"
        ? "🟢"
        : s === "partial"
          ? "🟡"
          : s === "split"
            ? "🔵"
            : "🔴";

    const currentFws = frameworkSelection.currentFrameworks;
    const target = frameworkSelection.migrationTarget;

    if (currentFws.length > 0) {
      lines.push(`# Migration Plan: ${currentFws.join(", ")} → ${target}`);
      lines.push("");
      lines.push(`> Generated: ${new Date().toISOString()}`);
      lines.push(`> Current frameworks: **${currentFws.join("**, **")}**`);
      lines.push(`> Migration target: **${target}**`);
    } else {
      lines.push(`# Migration Plan to ${target}`);
      lines.push("");
      lines.push(`> Generated: ${new Date().toISOString()}`);
    }
    lines.push("");
    lines.push(
      `> 🟢 Ready: **${statusCounts.ready}** | 🟡 Partial: **${statusCounts.partial}** | 🔴 Blocked: **${statusCounts.blocked}**${statusCounts.split > 0 ? ` | 🔵 Split: **${statusCounts.split}**` : ""} | Total: **${statusCounts.total}**`,
    );
    lines.push("");

    let globalIndex = 1;

    for (const stage of stages) {
      lines.push(`## Stage ${stage.stage} (${stage.packages.length} packages)`);
      lines.push("");

      for (const root of stage.packages) {
        const tfm =
          root.targetFrameworks.length > 0
            ? ` — ${root.targetFrameworks.join(", ")}`
            : "";

        lines.push(
          `- [ ] ${icon(root.status)} **${globalIndex}. ${root.id}** \`${root.version}\`${tfm}`,
        );

        if (root.status === "split" && root.perFrameworkVersions) {
          lines.push(`  - **Framework versions:**`);
          for (const pv of root.perFrameworkVersions) {
            lines.push(`    - ${pv.framework}: \`${pv.version}\``);
          }
        }

        if (root.internalDependencies.length > 0) {
          lines.push(`  - Internal (${root.internalDependencies.length}):`);
          for (const dep of root.internalDependencies) {
            const ver = formatVersion(dep.version, dep.latestVersion);
            const depTfm =
              dep.targetFrameworks.length > 0
                ? ` — ${dep.targetFrameworks.slice(0, 3).join(", ")}`
                : "";
            lines.push(
              `    - [ ] ${icon(dep.status)} \`${dep.id}\` ${ver}${depTfm}`,
            );
          }
        }

        if (root.externalDependencies.length > 0) {
          lines.push(`  - External (${root.externalDependencies.length}):`);
          for (const dep of root.externalDependencies) {
            const ver = formatVersion(dep.version, dep.latestVersion);
            const depTfm =
              dep.targetFrameworks.length > 0
                ? ` — ${dep.targetFrameworks.slice(0, 3).join(", ")}`
                : "";
            lines.push(
              `    - [ ] ${icon(dep.status)} \`${dep.id}\` ${ver}${depTfm}`,
            );
          }
        }

        if (
          root.internalDependencies.length === 0 &&
          root.externalDependencies.length === 0
        ) {
          lines.push("  - *No dependencies*");
        }

        lines.push("");
        globalIndex++;
      }
    }

    if (currentFws.length > 0) {
      lines.push("## Framework Compatibility Matrix");
      lines.push("");
      const allFws = [...new Set([...currentFws, target])];
      const header = `| Package | ${allFws.join(" | ")} | Notes |`;
      const sep = `|${Array(allFws.length + 2)
        .fill("---------")
        .join("|")}|`;
      lines.push(header);
      lines.push(sep);

      for (const stage of stages) {
        for (const root of stage.packages) {
          const cells = allFws.map((fw) => {
            if (root.perFrameworkVersions) {
              const pv = root.perFrameworkVersions.find(
                (v) => v.framework === fw,
              );
              if (pv) return pv.version === root.version ? "✓" : pv.version;
            }
            if (root.frameworkCompatibility) {
              const fc = root.frameworkCompatibility.find(
                (c) => c.framework === fw,
              );
              if (fc?.supported) {
                if (fc.compatibilityMode === "netstandard") return "✓ (std)";
                if (fc.compatibilityMode === "portable") return "✓ (any)";
                return "✓";
              }
              return "✗";
            }
            return "-";
          });
          const note =
            root.status === "split"
              ? "Split"
              : root.status === "blocked"
                ? "Blocked"
                : "";
          lines.push(
            `| ${root.id} \`${root.version}\` | ${cells.join(" | ")} | ${note} |`,
          );
        }
      }
      lines.push("");
    }

    // Multi-target Packages section
    {
      const multiTargetRows: string[] = [];

      for (const stage of stages) {
        for (const root of stage.packages) {
          if (root.status === "split" && root.perFrameworkVersions) {
            const details = root.perFrameworkVersions
              .map((pv) => {
                const fc = root.frameworkCompatibility?.find(
                  (c) => c.framework === pv.framework,
                );
                const mode = fc?.compatibilityMode ?? "direct";
                return `${pv.framework}: v${pv.version} (${mode})`;
              })
              .join(", ");
            multiTargetRows.push(
              `| ${root.id} \`${root.version}\` | Multi-target | ${details} |`,
            );
          } else if (
            root.frameworkCompatibility?.some(
              (c) => c.compatibilityMode === "netstandard",
            )
          ) {
            const stdFws = root.frameworkCompatibility
              .filter((c) => c.compatibilityMode === "netstandard")
              .map((c) => c.framework)
              .join(", ");
            multiTargetRows.push(
              `| ${root.id} \`${root.version}\` | via netstandard | Works via netstandard — no native support for ${stdFws} |`,
            );
          }
        }
      }

      if (multiTargetRows.length > 0) {
        lines.push("## Multi-target Packages");
        lines.push("");
        lines.push(
          "Packages below require multi-targeting or use netstandard compatibility:",
        );
        lines.push("");
        lines.push("| Package | Migration Type | Details |");
        lines.push("|---------|---------------|---------|");
        for (const row of multiTargetRows) {
          lines.push(row);
        }
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
    lines.push("## Instructions");
    lines.push("");
    lines.push("1. Migrate stages in order, starting from **Stage 1**");
    lines.push("2. Within each stage, packages can be migrated in parallel");
    lines.push("3. For each package, update internal dependencies first");
    lines.push(
      "4. 🔴 Blocked packages require external updates or replacements",
    );
    lines.push("5. Re-run the analysis after completing each stage");
    if (statusCounts.split > 0) {
      lines.push(
        "6. 🔵 Split packages need conditional PackageReference per TFM:",
      );
      lines.push(
        "   `<PackageReference Condition=\"'$(TargetFramework)'=='net6.0'\" ... />`",
      );
    }

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `migration-plan-${target}-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (packages.length === 0) {
    return null;
  }

  let globalIndex = 0;

  const currentFws = frameworkSelection.currentFrameworks;
  const target = frameworkSelection.migrationTarget;
  const headerTitle =
    currentFws.length > 0
      ? `Migration Roadmap: ${currentFws.join(", ")} → ${target}`
      : `Migration Roadmap to ${target}`;

  return (
    <Card className="m-4 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{headerTitle}</h3>
        <Button variant="outline" size="sm" onClick={downloadPlan}>
          <Download className="h-4 w-4 mr-1" />
          Download Plan
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-6 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🟢</span>
          <div>
            <div className="text-2xl font-bold">{statusCounts.ready}</div>
            <div className="text-sm text-muted-foreground">Ready</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🟡</span>
          <div>
            <div className="text-2xl font-bold">{statusCounts.partial}</div>
            <div className="text-sm text-muted-foreground">Partial</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔴</span>
          <div>
            <div className="text-2xl font-bold">{statusCounts.blocked}</div>
            <div className="text-sm text-muted-foreground">Blocked</div>
          </div>
        </div>
        {statusCounts.split > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔵</span>
            <div>
              <div className="text-2xl font-bold">{statusCounts.split}</div>
              <div className="text-sm text-muted-foreground">Split</div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 ml-4 pl-4 border-l">
          <div>
            <div className="text-2xl font-bold">{statusCounts.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </div>
        </div>
      </div>

      {/* Matryoshka stages */}
      <div className="space-y-4">
        {stages.map((stage) => (
          <details key={stage.stage} open className="border rounded-lg">
            <summary className="cursor-pointer px-4 py-3 flex items-center gap-2 hover:bg-muted/50">
              <Badge variant="outline" className="text-sm">
                Stage {stage.stage}
              </Badge>
              <span className="font-medium text-sm">
                {stage.packages.length} packages
              </span>
            </summary>

            <div className="px-4 pb-4 space-y-3">
              {stage.packages.map((root) => {
                globalIndex++;
                const idx = globalIndex;
                return (
                  <div key={root.id} className="border rounded-md p-3 bg-card">
                    {/* Package header */}
                    <div className="flex items-center gap-2 mb-1">
                      <span>{statusEmoji(root.status)}</span>
                      <h4 className="font-semibold font-mono text-sm">
                        {root.id}
                      </h4>
                      <Badge variant="outline" className="text-xs">
                        {root.version}
                      </Badge>
                      {root.targetFrameworks.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {root.targetFrameworks.slice(0, 3).join(", ")}
                          {root.targetFrameworks.length > 3 &&
                            ` +${root.targetFrameworks.length - 3}`}
                        </span>
                      )}
                      <Badge variant="outline" className="text-xs ml-auto">
                        #{idx}
                      </Badge>
                    </div>

                    {/* Multi-target info box */}
                    {root.status === "split" &&
                      root.perFrameworkVersions &&
                      root.perFrameworkVersions.length > 0 && (
                        <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                          <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                            Multi-target — different versions per framework:
                          </div>
                          <div className="space-y-0.5">
                            {root.perFrameworkVersions.map((pv) => {
                              const fc = root.frameworkCompatibility?.find(
                                (c) => c.framework === pv.framework,
                              );
                              const mode = fc?.compatibilityMode ?? "direct";
                              return (
                                <div
                                  key={pv.framework}
                                  className="flex items-center gap-2 text-xs font-mono"
                                >
                                  <span className="w-20 text-right text-muted-foreground">
                                    {pv.framework}:
                                  </span>
                                  <code>{pv.version}</code>
                                  <span className="text-muted-foreground">
                                    ({mode})
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {/* Netstandard compatibility info box */}
                    {root.status !== "split" &&
                      root.frameworkCompatibility?.some(
                        (c) => c.compatibilityMode === "netstandard",
                      ) && (
                        <div className="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/20 rounded border border-emerald-200 dark:border-emerald-800">
                          <div className="text-xs text-emerald-700 dark:text-emerald-300">
                            Compatible via netstandard — works on all target
                            frameworks, but not a native .NET{" "}
                            {frameworkSelection.migrationTarget
                              .replace("net", "")
                              .replace(".0", "")}{" "}
                            build. Consider upgrading to a version with native
                            support if available.
                          </div>
                        </div>
                      )}

                    {/* Internal dependencies */}
                    {root.internalDependencies.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          Internal packages to update (
                          {root.internalDependencies.length}):
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {root.internalDependencies.map((dep) => (
                            <Badge
                              key={dep.id}
                              variant="default"
                              className="font-mono text-xs"
                            >
                              {statusEmoji(dep.status)} {dep.id} (
                              {formatVersion(dep.version, dep.latestVersion)})
                              {dep.targetFrameworks.length > 0 && (
                                <span className="ml-1 opacity-70">
                                  {dep.targetFrameworks.slice(0, 2).join(", ")}
                                </span>
                              )}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* External dependencies */}
                    {root.externalDependencies.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          External packages to update (
                          {root.externalDependencies.length}):
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {root.externalDependencies.map((dep) => (
                            <Badge
                              key={dep.id}
                              variant="secondary"
                              className="font-mono text-xs"
                            >
                              {statusEmoji(dep.status)} {dep.id} (
                              {formatVersion(dep.version, dep.latestVersion)})
                              {dep.targetFrameworks.length > 0 && (
                                <span className="ml-1 opacity-70">
                                  {dep.targetFrameworks.slice(0, 2).join(", ")}
                                </span>
                              )}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No dependencies */}
                    {root.internalDependencies.length === 0 &&
                      root.externalDependencies.length === 0 && (
                        <div className="mt-2 text-xs text-muted-foreground italic">
                          No dependencies
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>

      {/* Instructions */}
      <div className="mt-6 p-3 bg-muted rounded-md text-sm">
        <p className="font-medium mb-1">How to use this roadmap:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Migrate stages in order, starting from Stage 1</li>
          <li>Within each stage, packages can be migrated in parallel</li>
          <li>For each package, update internal dependencies first</li>
          <li>
            Check external dependencies for blockers - upgrade or replace as
            needed
          </li>
          <li>
            Click "Download Plan" to save the full migration plan as a markdown
            file
          </li>
        </ol>
      </div>
    </Card>
  );
}
