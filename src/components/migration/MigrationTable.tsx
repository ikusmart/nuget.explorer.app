import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  flexRender,
  type ExpandedState,
  type SortingState,
} from "@tanstack/react-table";
import { useMigrationStore } from "@/stores/migration-store";
import { createColumns } from "./columns";
import type { MigrationPackage } from "@/types/migration";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export function MigrationTable() {
  const packages = useMigrationStore((s) => s.packages);
  const versionConflicts = useMigrationStore((s) => s.versionConflicts);

  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);

  // Flatten the tree structure for the table
  const flatData = useMemo(() => {
    const result: MigrationPackage[] = [];

    function flatten(pkgs: MigrationPackage[], parentExpanded: boolean) {
      for (const pkg of pkgs) {
        result.push(pkg);
        if (pkg.dependencies.length > 0) {
          // Check if this row is expanded
          const rowId = result.length - 1;
          const isExpanded =
            expanded === true || (expanded as Record<string, boolean>)[rowId];
          if (isExpanded && parentExpanded) {
            flatten(pkg.dependencies, true);
          }
        }
      }
    }

    flatten(packages, true);
    return result;
  }, [packages, expanded]);

  const columns = useMemo(
    () => createColumns({ versionConflicts }),
    [versionConflicts],
  );

  const table = useReactTable({
    data: flatData,
    columns,
    state: {
      expanded,
      sorting,
    },
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    getSubRows: (row) => row.dependencies,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Calculate heatmap color based on blocker count
  const getRowHeatmapClass = (blockerCount: number): string => {
    if (blockerCount === 0) return "";
    if (blockerCount <= 2) return "bg-red-50 dark:bg-red-950/30";
    if (blockerCount <= 5) return "bg-red-100 dark:bg-red-900/40";
    return "bg-red-200 dark:bg-red-800/50";
  };

  return (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();

                return (
                  <th
                    key={header.id}
                    className={cn(
                      "px-4 py-2 text-left text-sm font-medium text-muted-foreground",
                      canSort &&
                        "cursor-pointer select-none hover:bg-muted-foreground/10",
                    )}
                    style={{ width: header.getSize() }}
                    onClick={
                      canSort
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {canSort && (
                        <span className="ml-1">
                          {sorted === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "border-t hover:bg-muted/50 transition-colors",
                getRowHeatmapClass(row.original.blockerCount),
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {flatData.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          No packages loaded
        </div>
      )}
    </div>
  );
}
