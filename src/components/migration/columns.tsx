import { type ColumnDef } from "@tanstack/react-table";
import type {
  MigrationPackage,
  VersionConflict,
  TargetFramework,
} from "@/types/migration";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Link2,
  GitBranch,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { VersionConflictPopover } from "./VersionConflictPopover";

interface ColumnContext {
  versionConflicts: VersionConflict[];
  currentFrameworks: TargetFramework[];
}

export function createColumns(
  context: ColumnContext,
): ColumnDef<MigrationPackage>[] {
  const columns: ColumnDef<MigrationPackage>[] = [
    // Package Name with expand/collapse
    {
      accessorKey: "id",
      header: "Package",
      cell: ({ row, getValue }) => {
        const canExpand = row.original.dependencies.length > 0;
        const depth = row.original.depth;
        const isSharedRef = row.original.isSharedReference;

        return (
          <div
            className="flex items-center"
            style={{ paddingLeft: `${depth * 20}px` }}
          >
            {canExpand ? (
              <button
                onClick={() => row.toggleExpanded()}
                className="p-1 hover:bg-muted rounded mr-1"
              >
                {row.getIsExpanded() ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="w-6" />
            )}
            {isSharedRef && (
              <span title="Shared dependency (see above)">
                <Link2 className="h-4 w-4 mr-1 text-blue-500" />
              </span>
            )}
            <span
              className={`font-mono text-sm ${isSharedRef ? "text-blue-500 italic" : ""}`}
            >
              {getValue() as string}
            </span>
            {isSharedRef && (
              <span className="ml-1 text-xs text-muted-foreground">(ref)</span>
            )}
          </div>
        );
      },
      size: 300,
      enableSorting: false,
    },

    // Version with conflict indicator
    {
      accessorKey: "version",
      header: "Version",
      cell: ({ row }) => {
        const pkg = row.original;
        const conflict = context.versionConflicts.find(
          (c) => c.packageId.toLowerCase() === pkg.id.toLowerCase(),
        );

        return (
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm">{pkg.version}</span>
            {conflict && (
              <VersionConflictPopover conflict={conflict}>
                <button className="text-amber-500 hover:text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                </button>
              </VersionConflictPopover>
            )}
          </div>
        );
      },
      size: 120,
      enableSorting: false,
    },

    // Type (Internal/External)
    {
      accessorKey: "isInternal",
      header: "Type",
      cell: ({ getValue }) => {
        const isInternal = getValue() as boolean;
        return (
          <Badge variant={isInternal ? "default" : "secondary"}>
            {isInternal ? "Internal" : "External"}
          </Badge>
        );
      },
      size: 100,
      enableSorting: false,
    },

    // Depth
    {
      accessorKey: "depth",
      header: "Depth",
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue() as number}</span>
      ),
      size: 60,
      enableSorting: false,
    },

    // Migration — per-TFM compatibility with color-coded badges
    {
      id: "migration",
      header: "Migration",
      cell: ({ row }) => {
        const fc = row.original.frameworkCompatibility;
        if (!fc || fc.length === 0) {
          return <span className="text-muted-foreground">-</span>;
        }

        const modeConfig = {
          direct: {
            badge:
              "bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-700",
            label: "direct",
          },
          netstandard: {
            badge:
              "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700",
            label: "std",
          },
          portable: {
            badge:
              "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600",
            label: "any",
          },
          none: {
            badge:
              "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-700",
            label: "none",
          },
        };

        return (
          <div className="flex flex-wrap gap-1">
            {fc.map((compat) => {
              const config = modeConfig[compat.compatibilityMode];
              return (
                <Badge
                  key={compat.framework}
                  className={`text-xs ${config.badge}`}
                >
                  {compat.framework}
                  {compat.compatibilityMode !== "direct" &&
                    ` (${config.label})`}
                </Badge>
              );
            })}
          </div>
        );
      },
      size: 200,
      enableSorting: false,
    },

    // Status
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const status = getValue() as MigrationPackage["status"];
        const statusConfig = {
          ready: { emoji: "🟢", text: "Ready" },
          partial: { emoji: "🟡", text: "Partial" },
          blocked: { emoji: "🔴", text: "Blocked" },
          split: { emoji: "🔵", text: "Split" },
        };
        const config = statusConfig[status];
        return (
          <span className="flex items-center gap-1">
            <span>{config.emoji}</span>
            <span>{config.text}</span>
          </span>
        );
      },
      size: 100,
      enableSorting: false,
    },

    // Blockers count
    {
      accessorKey: "blockerCount",
      header: "Blockers",
      cell: ({ getValue }) => {
        const count = getValue() as number;
        return count > 0 ? (
          <span className="text-red-500 font-medium">{count}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        );
      },
      size: 80,
      enableSorting: true,
    },

    // Migration Order
    {
      accessorKey: "migrationOrder",
      header: "Migration Order",
      cell: ({ getValue }) => {
        const order = getValue() as number;
        return order > 0 ? (
          <Badge variant="outline">{order}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
      size: 120,
      enableSorting: true,
    },
  ];

  // Conditionally add TFM Versions column if currentFrameworks is not empty
  if (context.currentFrameworks.length > 0) {
    // Insert after Status column (index 7)
    columns.splice(7, 0, {
      accessorKey: "perFrameworkVersions",
      header: "TFM Versions",
      cell: ({ row }) => {
        const pkg = row.original;
        const perFrameworkVersions = pkg.perFrameworkVersions;

        // Only show for split packages with perFrameworkVersions
        if (
          pkg.status === "split" &&
          perFrameworkVersions &&
          perFrameworkVersions.length > 0
        ) {
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1">
                  <GitBranch className="h-3 w-3" />
                  <span className="text-xs">{perFrameworkVersions.length}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">
                    Framework-Specific Versions
                  </h4>
                  <div className="space-y-1">
                    {perFrameworkVersions.map((fv) => (
                      <div
                        key={fv.framework}
                        className="flex justify-between items-center text-sm"
                      >
                        <Badge variant="outline" className="text-xs">
                          {fv.framework}
                        </Badge>
                        <span className="font-mono text-xs">{fv.version}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          );
        }

        return <span className="text-muted-foreground">-</span>;
      },
      size: 130,
      enableSorting: false,
    });
  }

  return columns;
}
