import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGraphStore, type PackageNodeData } from "@/stores/graph-store";

interface PackageNodeProps {
  data: PackageNodeData;
  selected?: boolean;
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

  return (
    <div
      className={cn(
        "relative px-3 py-2 rounded-lg bg-card border-2 shadow-sm min-w-[140px] max-w-[200px] transition-all",
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
              "text-xs font-medium truncate",
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

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-muted-foreground !w-2 !h-2"
      />
    </div>
  );
}

export const PackageNode = memo(PackageNodeComponent);
