import { type ColumnDef } from "@tanstack/react-table";
import type { MigrationPackage, VersionConflict } from "@/types/migration";
import { ChevronDown, ChevronRight, AlertTriangle, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { VersionConflictPopover } from "./VersionConflictPopover";

interface ColumnContext {
  versionConflicts: VersionConflict[];
}

export function createColumns(
  context: ColumnContext,
): ColumnDef<MigrationPackage>[] {
  return [
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

    // Target Frameworks
    {
      accessorKey: "targetFrameworks",
      header: "Target Frameworks",
      cell: ({ getValue }) => {
        const frameworks = getValue() as string[];
        if (frameworks.length === 0) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {frameworks.slice(0, 3).map((tfm) => (
              <Badge key={tfm} variant="outline" className="text-xs">
                {tfm}
              </Badge>
            ))}
            {frameworks.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{frameworks.length - 3}
              </Badge>
            )}
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
}
