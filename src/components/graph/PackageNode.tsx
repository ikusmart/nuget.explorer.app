import { memo, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGraphStore, type PackageNodeData } from "@/stores/graph-store";

interface PackageNodeProps {
  data: PackageNodeData;
  selected?: boolean;
}

/** Get badge color for a target framework moniker */
function getTfmColor(tfm: string): string {
  if (tfm.startsWith("netstandard")) return "bg-blue-100 text-blue-700";
  const match = tfm.match(/^net(\d+)\./);
  if (match) {
    const ver = parseInt(match[1], 10);
    if (ver >= 9) return "bg-emerald-100 text-emerald-800";
    if (ver >= 7) return "bg-green-100 text-green-700";
    return "bg-lime-100 text-lime-700";
  }
  if (tfm.startsWith("netcoreapp")) return "bg-teal-100 text-teal-700";
  return "bg-gray-100 text-gray-600";
}

function PackageNodeComponent({ data, selected }: PackageNodeProps) {
  const isPlaceholder = data.isPlaceholder;
  const highlightFilter = useGraphStore((s) => s.highlightFilter);
  const hiddenNodeIds = useGraphStore((s) => s.hiddenNodeIds);
  const highlightedPath = useGraphStore((s) => s.highlightedPath);

  // Don't render if hidden
  if (data.isHidden) {
    return null;
  }

  const isMatch =
    !highlightFilter || data.packageId.toLowerCase().includes(highlightFilter);

  // Check if any nodes are hidden (filter is applied)
  const isFilterApplied = hiddenNodeIds.size > 0;

  // Check if there's an active path and this node is on it
  const hasActivePath = highlightedPath.size > 0;

  // Compute dependency count for tooltip
  const depCount = useMemo(() => {
    if (!data.dependencyGroups) return 0;
    const seen = new Set<string>();
    for (const group of data.dependencyGroups) {
      const deps = group.dependencies ?? group;
      if (Array.isArray(deps)) {
        for (const dep of deps) {
          if (dep.id) seen.add(dep.id.toLowerCase());
        }
      }
    }
    return seen.size;
  }, [data.dependencyGroups]);

  // Extract unique target frameworks
  const frameworks = useMemo(() => {
    if (!data.dependencyGroups) return [];
    const tfms = new Set<string>();
    for (const g of data.dependencyGroups) {
      if (g.targetFramework) tfms.add(g.targetFramework);
    }
    return Array.from(tfms);
  }, [data.dependencyGroups]);

  return (
    <div
      className={cn(
        "group/node relative px-3 py-2 rounded-lg bg-card border-2 shadow-sm min-w-[140px] transition-all",
        isPlaceholder
          ? "border-dashed border-muted-foreground/50"
          : "border-border",
        selected && "border-primary ring-2 ring-primary/20",
        // Only dim non-matching nodes if filter is not applied (highlight mode)
        !isMatch && !isFilterApplied && "opacity-30",
        // Dim nodes not on path when path is active
        hasActivePath && !selected && "opacity-50",
      )}
    >
      {/* Cluster color indicator */}
      {data.clusterColor && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
          style={{ backgroundColor: data.clusterColor }}
        />
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground !w-2 !h-2"
      />

      <div className="flex items-center gap-2">
        {data.iconUrl && !isPlaceholder ? (
          <img
            src={data.iconUrl}
            alt=""
            className="h-6 w-6 rounded object-contain shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div
            className={cn(
              "h-6 w-6 rounded flex items-center justify-center shrink-0",
              isPlaceholder ? "bg-muted/50" : "bg-muted",
            )}
          >
            <Package
              className={cn(
                "h-3 w-3",
                isPlaceholder
                  ? "text-muted-foreground/50"
                  : "text-muted-foreground",
              )}
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-xs font-medium whitespace-nowrap",
              isPlaceholder && "text-muted-foreground",
            )}
          >
            {data.packageId}
          </p>
          {data.version && (
            <p className="text-[10px] text-muted-foreground truncate">
              v{data.version}
            </p>
          )}
          {isPlaceholder && (
            <p className="text-[10px] text-muted-foreground/70 italic">
              double-click to expand
            </p>
          )}
        </div>
      </div>

      {/* Target framework badges */}
      {frameworks.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {frameworks.map((tfm) => (
            <span
              key={tfm}
              className={cn(
                "text-[9px] px-1 rounded font-medium leading-tight",
                getTfmColor(tfm),
              )}
            >
              {tfm}
            </span>
          ))}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-muted-foreground !w-2 !h-2"
      />

      {/* Hover tooltip */}
      {!isPlaceholder && (data.description || data.authors?.length) && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 opacity-0 group-hover/node:opacity-100 transition-opacity delay-500 pointer-events-none z-50 w-64 p-2 rounded-md bg-popover border shadow-md text-xs">
          <p className="font-medium">
            {data.packageId}
            {data.version && (
              <span className="text-muted-foreground ml-1">
                v{data.version}
              </span>
            )}
          </p>
          {data.description && (
            <p className="text-muted-foreground mt-1 line-clamp-3">
              {data.description}
            </p>
          )}
          {data.authors && data.authors.length > 0 && (
            <p className="text-muted-foreground mt-1">
              By: {data.authors.join(", ")}
            </p>
          )}
          <p className="text-muted-foreground mt-1">Dependencies: {depCount}</p>
        </div>
      )}
    </div>
  );
}

export const PackageNode = memo(PackageNodeComponent);
